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
