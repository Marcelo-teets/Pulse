CREATE TABLE IF NOT EXISTS public.linkedin_profile_captures (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name TEXT NOT NULL,
  linkedin_url TEXT NOT NULL,
  location TEXT,
  current_title TEXT,
  current_company TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_linkedin_profile_captures_url
  ON public.linkedin_profile_captures (linkedin_url);

CREATE INDEX IF NOT EXISTS idx_linkedin_profile_captures_captured_at
  ON public.linkedin_profile_captures (captured_at DESC);

CREATE TABLE IF NOT EXISTS public.linkedin_company_captures (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person_capture_id BIGINT NOT NULL REFERENCES public.linkedin_profile_captures(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  description TEXT,
  website TEXT,
  employee_count TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_linkedin_company_captures_person
  ON public.linkedin_company_captures (person_capture_id);

CREATE INDEX IF NOT EXISTS idx_linkedin_company_captures_name
  ON public.linkedin_company_captures (company_name);

CREATE INDEX IF NOT EXISTS idx_linkedin_company_captures_captured_at
  ON public.linkedin_company_captures (captured_at DESC);

CREATE TABLE IF NOT EXISTS public.linkedin_capture_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.linkedin_sheet_sync_queue (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person_capture_id BIGINT NOT NULL REFERENCES public.linkedin_profile_captures(id) ON DELETE CASCADE,
  company_capture_id BIGINT NOT NULL REFERENCES public.linkedin_company_captures(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','synced','error')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ,
  UNIQUE(person_capture_id, company_capture_id)
);

CREATE INDEX IF NOT EXISTS idx_linkedin_sheet_sync_queue_status_created
  ON public.linkedin_sheet_sync_queue(status, created_at);

CREATE OR REPLACE FUNCTION public.enqueue_linkedin_sheet_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.linkedin_sheet_sync_queue(person_capture_id, company_capture_id)
  VALUES (NEW.person_capture_id, NEW.id)
  ON CONFLICT (person_capture_id, company_capture_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_linkedin_sheet_sync ON public.linkedin_company_captures;

CREATE TRIGGER trg_enqueue_linkedin_sheet_sync
AFTER INSERT ON public.linkedin_company_captures
FOR EACH ROW EXECUTE FUNCTION public.enqueue_linkedin_sheet_sync();

CREATE OR REPLACE VIEW public.linkedin_sheet_sync_payload AS
SELECT
  q.id AS sync_id,
  q.status AS sync_status,
  p.id AS person_capture_id,
  p.full_name,
  p.linkedin_url,
  p.location,
  p.current_title,
  p.current_company,
  p.captured_at AS person_captured_at,
  p.raw_json,
  c.id AS company_capture_id,
  c.company_name,
  c.description AS company_description,
  c.website AS company_website,
  c.employee_count,
  c.captured_at AS company_captured_at,
  q.created_at AS queued_at
FROM public.linkedin_sheet_sync_queue q
JOIN public.linkedin_profile_captures p ON p.id = q.person_capture_id
JOIN public.linkedin_company_captures c ON c.id = q.company_capture_id;
