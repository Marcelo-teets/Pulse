
CREATE TABLE IF NOT EXISTS public.pulse_quality_reviews (
  capture_id BIGINT PRIMARY KEY REFERENCES public.linkedin_profile_captures(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  note TEXT NOT NULL DEFAULT '',
  reviewed_by BIGINT REFERENCES public.pulse_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pulse_quality_reviews_status ON public.pulse_quality_reviews(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.pulse_role_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person_id BIGINT NOT NULL REFERENCES public.linkedin_people(id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES public.linkedin_companies(id) ON DELETE CASCADE,
  current_title TEXT,
  began_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pulse_role_history_person ON public.pulse_role_history(person_id,began_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pulse_role_history_active ON public.pulse_role_history(person_id) WHERE ended_at IS NULL;

INSERT INTO public.pulse_role_history(person_id,company_id,current_title,began_at,observed_at)
SELECT r.person_id,r.company_id,r.current_title,r.first_seen_at,r.last_seen_at
FROM public.linkedin_current_roles r
WHERE NOT EXISTS (SELECT 1 FROM public.pulse_role_history h WHERE h.person_id=r.person_id);

CREATE OR REPLACE FUNCTION public.pulse_track_current_role()
RETURNS trigger LANGUAGE plpgsql AS $pulse$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pulse_role_history(person_id,company_id,current_title,began_at,observed_at)
    VALUES (NEW.person_id,NEW.company_id,NEW.current_title,NEW.first_seen_at,NEW.last_seen_at);
  ELSIF OLD.company_id IS DISTINCT FROM NEW.company_id OR OLD.current_title IS DISTINCT FROM NEW.current_title THEN
    UPDATE public.pulse_role_history SET ended_at=NEW.last_seen_at
    WHERE person_id=NEW.person_id AND ended_at IS NULL;
    INSERT INTO public.pulse_role_history(person_id,company_id,current_title,began_at,observed_at)
    VALUES (NEW.person_id,NEW.company_id,NEW.current_title,NEW.last_seen_at,NEW.last_seen_at);
  ELSE
    UPDATE public.pulse_role_history
    SET observed_at=GREATEST(observed_at,NEW.last_seen_at)
    WHERE person_id=NEW.person_id AND ended_at IS NULL;
  END IF;
  RETURN NEW;
END;
$pulse$;
DROP TRIGGER IF EXISTS trg_pulse_role_history ON public.linkedin_current_roles;
CREATE TRIGGER trg_pulse_role_history
AFTER INSERT OR UPDATE ON public.linkedin_current_roles
FOR EACH ROW EXECUTE FUNCTION public.pulse_track_current_role();
