import { hashPassword, normalizeEmail, requireUser, safeUser } from "../../../lib/auth";
import { getPool } from "../../../lib/db";
import { ensureSchema } from "../../../lib/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  if (user.role !== "master") return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const db = getPool();
  await ensureSchema(db);
  const result = await db.query(`
    SELECT id, email, full_name, role, status, created_at, last_login_at
    FROM public.pulse_users
    ORDER BY role = 'master' DESC, created_at DESC
  `);
  return Response.json({ ok: true, users: result.rows.map(safeUser) });
}

export async function POST(request) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (user.role !== "master") return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const db = getPool();
  await ensureSchema(db);
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const fullName = String(body.fullName || "").trim();
  const password = String(body.password || "");
  const role = body.role === "master" ? "master" : "user";

  if (!email || !email.includes("@") || fullName.length < 2 || password.length < 8) {
    return Response.json({ ok: false, error: "Preencha nome, e-mail válido e senha com 8+ caracteres." }, { status: 400 });
  }

  try {
    const result = await db.query(
      `
        INSERT INTO public.pulse_users(email, full_name, password_hash, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, full_name, role, status, created_at, last_login_at
      `,
      [email, fullName, hashPassword(password), role]
    );
    return Response.json({ ok: true, user: safeUser(result.rows[0]) }, { status: 201 });
  } catch (error) {
    if (error?.code === "23505") {
      return Response.json({ ok: false, error: "Este e-mail já existe." }, { status: 409 });
    }
    console.error("Create user failed", error);
    return Response.json({ ok: false, error: "Falha ao criar usuário." }, { status: 500 });
  }
}
