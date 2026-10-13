import { requireUser } from "../../../lib/auth";
import { getPool } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const personId = new URL(request.url).searchParams.get("person_id") || "";
  if (!/^[1-9]\d{0,17}$/.test(personId)) return Response.json({ error: "Pessoa inválida." }, { status: 400 });
  const db = getPool();
  if (!db) return Response.json({ error: "Banco não configurado." }, { status: 503 });
  try {
    const owned = user.role === "master" ? "" : " AND EXISTS (SELECT 1 FROM public.pulse_user_people up WHERE up.person_id=p.id AND up.user_id=$2::bigint)";
    const args = user.role === "master" ? [personId] : [personId, user.id];
    const result = await db.query(
      "SELECT h.company_id::text AS company_id, c.company_name, c.linkedin_url AS company_linkedin_url," +
      " h.current_title, h.began_at, h.ended_at, h.observed_at" +
      " FROM public.linkedin_people p JOIN public.pulse_role_history h ON h.person_id=p.id" +
      " JOIN public.linkedin_companies c ON c.id=h.company_id" +
      " WHERE p.id=$1::bigint" + owned + " ORDER BY h.began_at DESC, h.id DESC LIMIT 100", args
    );
    return Response.json({ items: result.rows });
  } catch (error) {
    console.error("Role history query failed", error);
    return Response.json({ error: "Falha ao consultar histórico." }, { status: 500 });
  }
}
