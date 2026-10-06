-- Stable LinkedIn company identity
ALTER TABLE public.linkedin_company_captures
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

ALTER TABLE public.linkedin_companies
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

CREATE INDEX IF NOT EXISTS idx_linkedin_company_captures_linkedin_url
  ON public.linkedin_company_captures(linkedin_url);

CREATE UNIQUE INDEX IF NOT EXISTS ux_linkedin_companies_linkedin_url
  ON public.linkedin_companies(linkedin_url)
  WHERE linkedin_url IS NOT NULL;
