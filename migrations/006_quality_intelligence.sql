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
