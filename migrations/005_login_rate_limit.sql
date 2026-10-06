-- Brute-force protection for Pulse login
CREATE TABLE IF NOT EXISTS public.pulse_login_attempts (
  key_hash TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pulse_login_attempts_blocked
  ON public.pulse_login_attempts(blocked_until);
