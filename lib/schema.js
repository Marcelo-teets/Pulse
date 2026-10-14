let schemaReady = false;
let schemaPromise = null;
const SCHEMA_VERSION = 7;

const SQL = `
CREATE TABLE IF NOT EXISTS public.pulse_users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('master','user')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pulse_users_role ON public.pulse_users(role);
CREATE INDEX IF NOT EXISTS idx_pulse_users_status ON public.pulse_users(status);

CREATE TABLE IF NOT EXISTS public.pulse_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.pulse_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pulse_sessions_user ON public.pulse_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_pulse_sessions_expiry ON public.pulse_sessions(expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS public.pulse_login_attempts (
  key_hash TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pulse_login_attempts_blocked ON public.pulse_login_attempts(blocked_until);

ALTER TABLE public.linkedin_devices ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES public.pulse_users(id) ON DELETE SET NULL;
ALTER TABLE public.linkedin_pairing_codes ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES public.pulse_users(id) ON DELETE CASCADE;
ALTER TABLE public.linkedin_profile_captures ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES public.pulse_users(id) ON DELETE SET NULL;
ALTER TABLE public.linkedin_company_captures ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES public.pulse_users(id) ON DELETE SET NULL;
ALTER TABLE public.linkedin_people ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES public.pulse_users(id) ON DELETE SET NULL;
ALTER TABLE public.linkedin_companies ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES public.pulse_users(id) ON DELETE SET NULL;
ALTER TABLE public.linkedin_company_captures ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE public.linkedin_companies ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
CREATE INDEX IF NOT EXISTS idx_linkedin_company_captures_linkedin_url ON public.linkedin_company_captures(linkedin_url);
CREATE UNIQUE INDEX IF NOT EXISTS ux_linkedin_companies_linkedin_url ON public.linkedin_companies(linkedin_url) WHERE linkedin_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_linkedin_devices_owner ON public.linkedin_devices(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_profile_captures_owner ON public.linkedin_profile_captures(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_company_captures_owner ON public.linkedin_company_captures(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_people_owner ON public.linkedin_people(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_companies_owner ON public.linkedin_companies(owner_user_id);

CREATE TABLE IF NOT EXISTS public.pulse_user_people (
  user_id BIGINT NOT NULL REFERENCES public.pulse_users(id) ON DELETE CASCADE,
  person_id BIGINT NOT NULL REFERENCES public.linkedin_people(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_user_people_person ON public.pulse_user_people(person_id);

CREATE TABLE IF NOT EXISTS public.pulse_user_companies (
  user_id BIGINT NOT NULL REFERENCES public.pulse_users(id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES public.linkedin_companies(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_user_companies_company ON public.pulse_user_companies(company_id);

-- Phase 1/2: human-labelled QA; Phase 4: observed job transitions.
CREATE TABLE IF NOT EXISTS public.pulse_capture_reviews (
  capture_id BIGINT NOT NULL REFERENCES public.linkedin_profile_captures(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL CHECK (field_key IN ('full_name','linkedin_url','location','current_title','current_company','company_name','company_linkedin_url','description','website','employee_count')),
  verdict TEXT NOT NULL CHECK (verdict IN ('correct','incorrect','unknown')),
  expected_value TEXT,
  reviewer_id BIGINT NOT NULL REFERENCES public.pulse_users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(capture_id,field_key),
  CONSTRAINT incorrect_needs_truth CHECK (verdict<>'incorrect' OR NULLIF(BTRIM(expected_value),'') IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_pulse_capture_reviews_reviewer ON public.pulse_capture_reviews(reviewer_id,reviewed_at DESC);

CREATE TABLE IF NOT EXISTS public.pulse_role_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person_id BIGINT NOT NULL REFERENCES public.linkedin_people(id) ON DELETE CASCADE,
  previous_company_id BIGINT,
  current_company_id BIGINT,
  previous_title TEXT,
  current_title TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_kind TEXT NOT NULL CHECK(event_kind IN ('first_seen','changed'))
);
CREATE INDEX IF NOT EXISTS idx_pulse_role_events_person ON public.pulse_role_events(person_id,observed_at DESC);

CREATE OR REPLACE FUNCTION public.pulse_record_role_event() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.pulse_role_events(person_id,current_company_id,current_title,observed_at,event_kind)
    VALUES(NEW.person_id,NEW.company_id,NEW.current_title,NEW.last_seen_at,'first_seen');
  ELSIF OLD.company_id IS DISTINCT FROM NEW.company_id OR OLD.current_title IS DISTINCT FROM NEW.current_title THEN
    INSERT INTO public.pulse_role_events(person_id,previous_company_id,current_company_id,previous_title,current_title,observed_at,event_kind)
    VALUES(NEW.person_id,OLD.company_id,NEW.company_id,OLD.current_title,NEW.current_title,NEW.last_seen_at,'changed');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_pulse_role_event ON public.linkedin_current_roles;
CREATE TRIGGER trg_pulse_role_event AFTER INSERT OR UPDATE ON public.linkedin_current_roles
  FOR EACH ROW EXECUTE FUNCTION public.pulse_record_role_event();

DROP VIEW IF EXISTS public.linkedin_device_status;
DROP VIEW IF EXISTS public.linkedin_api_audit_safe;

CREATE VIEW public.linkedin_device_status AS
SELECT
  d.device_id,
  d.device_name,
  d.owner_user_id,
  u.email AS owner_email,
  d.created_at,
  d.last_seen_at,
  d.revoked_at,
  d.extension_version,
  d.token_expires_at,
  CASE
    WHEN d.revoked_at IS NOT NULL THEN 'revoked'
    WHEN d.token_expires_at IS NOT NULL AND d.token_expires_at <= NOW() THEN 'expired'
    ELSE 'active'
  END AS status
FROM public.linkedin_devices d
LEFT JOIN public.pulse_users u ON u.id = d.owner_user_id;

CREATE VIEW public.linkedin_api_audit_safe AS
SELECT
  a.id,
  a.event_type,
  a.device_id,
  d.owner_user_id,
  a.request_id,
  a.extension_version,
  a.success,
  a.http_status,
  a.details,
  a.created_at
FROM public.linkedin_api_audit a
LEFT JOIN public.linkedin_devices d ON d.device_id = a.device_id;
`;

export async function ensureSchema(db) {
  if (schemaReady) return;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('pulse_runtime_schema'))");
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.pulse_schema_meta (
            key TEXT PRIMARY KEY,
            version INTEGER NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        const current = await client.query(
          "SELECT version FROM public.pulse_schema_meta WHERE key='runtime' FOR UPDATE"
        );
        if (Number(current.rows[0]?.version || 0) < SCHEMA_VERSION) {
          await client.query(SQL);
          await client.query(
            `INSERT INTO public.pulse_schema_meta(key,version,updated_at)
             VALUES('runtime',$1,NOW())
             ON CONFLICT(key) DO UPDATE SET version=EXCLUDED.version,updated_at=NOW()`,
            [SCHEMA_VERSION]
          );
        }
        await client.query("COMMIT");
        schemaReady = true;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    })().finally(() => {
      schemaPromise = null;
    });
  }
  await schemaPromise;
}
