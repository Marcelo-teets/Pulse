-- Pulse LinkedIn Capture v0.6-v0.7 hardening
ALTER TABLE public.linkedin_profile_captures ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE public.linkedin_company_captures ADD COLUMN IF NOT EXISTS request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_linkedin_profile_captures_request_id ON public.linkedin_profile_captures(request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_linkedin_company_captures_request_id ON public.linkedin_company_captures(request_id) WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.linkedin_people (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  linkedin_url TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  location TEXT,
  current_title TEXT,
  current_company TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_capture_id BIGINT REFERENCES public.linkedin_profile_captures(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_linkedin_people_current_company ON public.linkedin_people(current_company);

CREATE TABLE IF NOT EXISTS public.linkedin_companies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_key TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  description TEXT,
  website TEXT,
  employee_count TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_capture_id BIGINT REFERENCES public.linkedin_company_captures(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_linkedin_companies_name ON public.linkedin_companies(company_name);

CREATE TABLE IF NOT EXISTS public.linkedin_current_roles (
  person_id BIGINT PRIMARY KEY REFERENCES public.linkedin_people(id) ON DELETE CASCADE,
  company_id BIGINT REFERENCES public.linkedin_companies(id) ON DELETE SET NULL,
  current_title TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.linkedin_sheet_sync_queue ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.linkedin_sheet_sync_queue ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_linkedin_sheet_sync_queue_retry ON public.linkedin_sheet_sync_queue(status,next_attempt_at,created_at);

CREATE TABLE IF NOT EXISTS public.linkedin_devices (
  device_id TEXT PRIMARY KEY,
  device_name TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  extension_version TEXT,
  token_expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_linkedin_devices_active ON public.linkedin_devices(revoked_at,last_seen_at);

CREATE TABLE IF NOT EXISTS public.linkedin_pairing_codes (
  code_hash TEXT PRIMARY KEY,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by_device_id TEXT REFERENCES public.linkedin_devices(device_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_linkedin_pairing_codes_expiry ON public.linkedin_pairing_codes(expires_at,used_at);

CREATE TABLE IF NOT EXISTS public.linkedin_api_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type TEXT NOT NULL,
  device_id TEXT,
  request_id TEXT,
  extension_version TEXT,
  success BOOLEAN NOT NULL,
  http_status INTEGER NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_linkedin_api_audit_created ON public.linkedin_api_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_linkedin_api_audit_device ON public.linkedin_api_audit(device_id,created_at DESC);

CREATE OR REPLACE VIEW public.linkedin_canonical_contacts AS
SELECT p.id AS person_id,p.linkedin_url,p.full_name,p.location,p.current_title,p.current_company,
       p.first_seen_at,p.last_seen_at,c.id AS company_id,c.company_name,c.description AS company_description,
       c.website AS company_website,c.employee_count,c.first_seen_at AS company_first_seen_at,c.last_seen_at AS company_last_seen_at
FROM public.linkedin_people p
LEFT JOIN public.linkedin_current_roles r ON r.person_id=p.id
LEFT JOIN public.linkedin_companies c ON c.id=r.company_id;

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
