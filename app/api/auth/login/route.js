import { createHash } from "node:crypto";
import { createSession, normalizeEmail, safeUser, verifyPassword } from "../../../../lib/auth";
import { getPool } from "../../../../lib/db";
import { ensureSchema } from "../../../../lib/schema";

export const dynamic = "force-dynamic";

function loginAttemptKey(request, email) {
  const forwarded = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const clientIp = String(forwarded).split(",")[0].trim().slice(0, 200);
  return createHash("sha256").update(`${email}|${clientIp}`).digest("hex");
}

async function registerFailure(db, key) {
  const result = await db.query(
    `
      INSERT INTO public.pulse_login_attempts(key_hash,failures,window_started_at,blocked_until,updated_at)
      VALUES ($1,1,NOW(),NULL,NOW())
      ON CONFLICT(key_hash) DO UPDATE SET
        failures = CASE
          WHEN public.pulse_login_attempts.window_started_at < NOW() - INTERVAL '15 minutes' THEN 1
          ELSE public.pulse_login_attempts.failures + 1
        END,
        window_started_at = CASE
          WHEN public.pulse_login_attempts.window_started_at < NOW() - INTERVAL '15 minutes' THEN NOW()
          ELSE public.pulse_login_attempts.window_started_at
        END,
        blocked_until = CASE
          WHEN (
            CASE
              WHEN public.pulse_login_attempts.window_started_at < NOW() - INTERVAL '15 minutes' THEN 1
              ELSE public.pulse_login_attempts.failures + 1
            END
          ) >= 10 THEN NOW() + INTERVAL '15 minutes'
          ELSE public.pulse_login_attempts.blocked_until
        END,
        updated_at = NOW()
      RETURNING failures,blocked_until
    `,
    [key]
  );
  return result.rows[0] || {};
}

export async function POST(request) {
  const db = getPool();
  if (!db) return Response.json({ ok: false, error: "DATABASE_URL não configurada." }, { status: 503 });
  await ensureSchema(db);

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const attemptKey = loginAttemptKey(request, email);
  const throttle = await db.query(
    "SELECT failures,blocked_until FROM public.pulse_login_attempts WHERE key_hash=$1 LIMIT 1",
    [attemptKey]
  );
  if (throttle.rows[0]?.blocked_until && new Date(throttle.rows[0].blocked_until).getTime() > Date.now()) {
    return Response.json(
      { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429, headers: { "retry-after": "900" } }
    );
  }

  const result = await db.query(
    "SELECT id, email, full_name, password_hash, role, status, created_at, last_login_at FROM public.pulse_users WHERE email = $1 LIMIT 1",
    [email]
  );
  const row = result.rows[0];

  if (!row || row.status !== "active" || !verifyPassword(password, row.password_hash)) {
    const failed = await registerFailure(db, attemptKey);
    if (failed.blocked_until) {
      return Response.json(
        { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
        { status: 429, headers: { "retry-after": "900" } }
      );
    }
    return Response.json({ ok: false, error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  await db.query("DELETE FROM public.pulse_login_attempts WHERE key_hash=$1", [attemptKey]);
  await db.query("UPDATE public.pulse_users SET last_login_at = NOW() WHERE id = $1", [row.id]);
  await createSession(row.id);
  return Response.json({ ok: true, user: safeUser({ ...row, last_login_at: new Date().toISOString() }) });
}
