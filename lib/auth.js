import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { safeUser } from "./auth-core.js";
import { getPool } from "./db";
import { ensureSchema } from "./schema";

export const SESSION_COOKIE = "pulse_session";

const SESSION_DAYS = 30;
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

export { hashPassword, normalizeEmail, safeUser, verifyPassword } from "./auth-core.js";

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function getCurrentUser() {
  const db = getPool();
  if (!db) return null;
  await ensureSchema(db);

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const result = await db.query(
    `
      SELECT u.id, u.email, u.full_name, u.role, u.status, u.created_at, u.last_login_at
      FROM public.pulse_sessions s
      JOIN public.pulse_users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
        AND s.revoked_at IS NULL
        AND u.status = 'active'
      LIMIT 1
    `,
    [sha(token)]
  );

  return safeUser(result.rows[0]);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  return { user, response: null };
}

export async function createSession(userId) {
  const db = getPool();
  if (!db) throw new Error("DATABASE_URL não configurada.");
  await ensureSchema(db);

  const token = randomBytes(32).toString("base64url");
  await db.query(
    `
      INSERT INTO public.pulse_sessions(user_id, token_hash, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '${SESSION_DAYS} days')
    `,
    [userId, sha(token)]
  );

  (await cookies()).set(SESSION_COOKIE, token, COOKIE_OPTIONS);
}

export async function destroySession() {
  const db = getPool();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (db && token) {
    await db.query("UPDATE public.pulse_sessions SET revoked_at = NOW() WHERE token_hash = $1", [sha(token)]);
  }
  store.set(SESSION_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
}

export function scopedClause(user, alias = "p") {
  if (user?.role === "master") return { sql: "", params: [] };
  return { sql: ` AND ${alias}.owner_user_id = $1`, params: [user.id] };
}
