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

ALTER TABLE public.linkedin_devices ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES public.pulse_users(id) ON DELETE SET NULL;
ALTER TABLE public.linkedin_pairing_codes ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES public.pulse_users(id) ON DELETE CASCADE;
ALTER TABLE public.linkedin_profile_captures ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES public.pulse_users(id) ON DELETE SET NULL;
ALTER TABLE public.linkedin_company_captures ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES public.pulse_users(id) ON DELETE SET NULL;
ALTER TABLE public.linkedin_people ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES public.pulse_users(id) ON DELETE SET NULL;
ALTER TABLE public.linkedin_companies ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES public.pulse_users(id) ON DELETE SET NULL;

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

CREATE OR REPLACE VIEW public.linkedin_device_status AS
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

CREATE OR REPLACE VIEW public.linkedin_api_audit_safe AS
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

CREATE OR REPLACE VIEW public.linkedin_ops_summary AS
SELECT
 (SELECT COUNT(*)::bigint FROM public.linkedin_profile_captures) AS profile_captures,
 (SELECT COUNT(*)::bigint FROM public.linkedin_company_captures) AS company_captures,
 (SELECT COUNT(*)::bigint FROM public.linkedin_people) AS unique_people,
 (SELECT COUNT(*)::bigint FROM public.linkedin_companies) AS unique_companies,
 (SELECT COUNT(*)::bigint FROM public.linkedin_devices WHERE revoked_at IS NULL AND (token_expires_at IS NULL OR token_expires_at>NOW())) AS active_devices,
 (SELECT COUNT(*)::bigint FROM public.linkedin_sheet_sync_queue WHERE status IN ('pending','error','processing')) AS sync_backlog,
 (SELECT COUNT(*)::bigint FROM public.linkedin_profile_captures WHERE captured_at>=NOW()-INTERVAL '24 hours') AS captures_24h,
 (SELECT COUNT(*)::bigint FROM public.linkedin_api_audit WHERE created_at>=NOW()-INTERVAL '24 hours' AND success=false) AS api_failures_24h,
 (SELECT MAX(captured_at) FROM public.linkedin_profile_captures) AS last_capture_at,
 (SELECT MAX(synced_at) FROM public.linkedin_sheet_sync_queue WHERE status='synced') AS last_sheet_sync_at;
