import { createHash, randomBytes } from "node:crypto";
import { requireUser } from "../../../../lib/auth";
import { getPool } from "../../../../lib/db";
import { ensureSchema } from "../../../../lib/schema";

export const dynamic = "force-dynamic";

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const db = getPool();
  await ensureSchema(db);
  const body = await request.json().catch(() => ({}));
  const label = String(body.label || "Extensão Chrome").trim().slice(0, 120);
  const code = randomBytes(9).toString("base64url").toUpperCase();

  await db.query(
    `
      INSERT INTO public.linkedin_pairing_codes(code_hash, label, expires_at, owner_user_id)
      VALUES ($1, $2, NOW() + INTERVAL '20 minutes', $3)
    `,
    [sha(code), label, user.id]
  );

  return Response.json({ ok: true, code, expiresInMinutes: 20 });
}
