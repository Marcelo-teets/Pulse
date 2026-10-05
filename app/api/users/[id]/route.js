import { requireUser } from "../../../../lib/auth";
import { getPool } from "../../../../lib/db";
import { ensureSchema } from "../../../../lib/schema";

export const dynamic = "force-dynamic";

export async function DELETE(_request, { params }) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (user.role !== "master") return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const id = String((await params).id || "");
  if (!id || id === user.id) {
    return Response.json({ ok: false, error: "Não é possível excluir o próprio usuário autenticado." }, { status: 400 });
  }

  const db = getPool();
  await ensureSchema(db);
  const result = await db.query("DELETE FROM public.pulse_users WHERE id = $1 RETURNING id", [id]);
  return Response.json({ ok: true, deleted: result.rowCount > 0 });
}
