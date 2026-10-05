import { createSession, normalizeEmail, safeUser, verifyPassword } from "../../../../lib/auth";
import { getPool } from "../../../../lib/db";
import { ensureSchema } from "../../../../lib/schema";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const db = getPool();
  if (!db) return Response.json({ ok: false, error: "DATABASE_URL não configurada." }, { status: 503 });
  await ensureSchema(db);

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  const result = await db.query(
    "SELECT id, email, full_name, password_hash, role, status, created_at, last_login_at FROM public.pulse_users WHERE email = $1 LIMIT 1",
    [email]
  );
  const row = result.rows[0];

  if (!row || row.status !== "active" || !verifyPassword(password, row.password_hash)) {
    return Response.json({ ok: false, error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  await db.query("UPDATE public.pulse_users SET last_login_at = NOW() WHERE id = $1", [row.id]);
  await createSession(row.id);
  return Response.json({ ok: true, user: safeUser({ ...row, last_login_at: new Date().toISOString() }) });
}
