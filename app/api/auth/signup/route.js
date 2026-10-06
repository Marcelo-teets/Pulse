import { createSession, hashPassword, normalizeEmail, safeUser } from "../../../../lib/auth";
import { getPool } from "../../../../lib/db";
import { ensureSchema } from "../../../../lib/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getPool();
  if (!db) return Response.json({ ok: true, signupEnabled: false });
  await ensureSchema(db);
  const masters = await db.query("SELECT count(*)::int AS total FROM public.pulse_users WHERE role='master'");
  const bootstrapNeeded = Number(masters.rows[0]?.total || 0) === 0;
  const publicSignup = process.env.PULSE_ALLOW_PUBLIC_SIGNUP === "true";
  return Response.json({ ok: true, signupEnabled: publicSignup || bootstrapNeeded });
}

export async function POST(request) {
  const db = getPool();
  if (!db) return Response.json({ ok: false, error: "DATABASE_URL não configurada." }, { status: 503 });
  await ensureSchema(db);

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const fullName = String(body.fullName || "").trim();
  const password = String(body.password || "");

  if (!email || !email.includes("@")) {
    return Response.json({ ok: false, error: "Informe um e-mail válido." }, { status: 400 });
  }
  if (fullName.length < 2) {
    return Response.json({ ok: false, error: "Informe seu nome." }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ ok: false, error: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
  }

  const masterEmail = normalizeEmail(process.env.PULSE_MASTER_EMAIL);
  const masters = await db.query("SELECT count(*)::int AS total FROM public.pulse_users WHERE role='master'");
  const bootstrapNeeded = Number(masters.rows[0]?.total || 0) === 0;
  const isBootstrapMaster = bootstrapNeeded && !!masterEmail && email === masterEmail;
  const publicSignup = process.env.PULSE_ALLOW_PUBLIC_SIGNUP === "true";

  if (!publicSignup && !isBootstrapMaster) {
    return Response.json({ ok: false, error: "Cadastro público desativado. Solicite acesso ao administrador." }, { status: 403 });
  }

  const role = isBootstrapMaster ? "master" : "user";

  try {
    const result = await db.query(
      `
        INSERT INTO public.pulse_users(email, full_name, password_hash, role, last_login_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id, email, full_name, role, status, created_at, last_login_at
      `,
      [email, fullName, hashPassword(password), role]
    );

    await createSession(result.rows[0].id);
    return Response.json({ ok: true, user: safeUser(result.rows[0]) }, { status: 201 });
  } catch (error) {
    if (error?.code === "23505") {
      return Response.json({ ok: false, error: "Este e-mail já tem conta. Entre com sua senha." }, { status: 409 });
    }
    console.error("Signup failed", error);
    return Response.json({ ok: false, error: "Falha ao criar conta." }, { status: 500 });
  }
}
