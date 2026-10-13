import { getPool } from "../../../lib/db";
import { requireUser } from "../../../lib/auth";
import { assessCapture } from "../../../lib/pulse-intelligence.js";

export const dynamic = "force-dynamic";

function pageNum(value, fallback, maximum) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

export async function GET(request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const db = getPool();
  if (!db) return Response.json({ connected: false, items: [], total: 0 }, { status: 503 });
  const { searchParams } = new URL(request.url);
  const page = pageNum(searchParams.get("page"), 1, 10000);
  const limit = pageNum(searchParams.get("limit"), 25, 100);
  const conditions = [];
  const params = [];
  if (user.role !== "master") {
    params.push(user.id);
    conditions.push("p.owner_user_id=$" + params.length + "::bigint");
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const totalParams = [...params];
  params.push(limit, (page - 1) * limit);
  try {
    const [rows, count] = await Promise.all([
      db.query(
        "SELECT p.id::text AS capture_id, p.full_name, p.linkedin_url, p.current_title, p.current_company, p.location, p.captured_at," +
        " c.company_name, c.linkedin_url AS company_linkedin_url, c.website, c.employee_count, c.description," +
        " COALESCE(a.details, '{}'::jsonb) AS evidence, COALESCE(rv.status,'pending') AS review_status," +
        " COALESCE(rv.note,'') AS review_note, rv.updated_at AS reviewed_at" +
        " FROM public.linkedin_profile_captures p" +
        " LEFT JOIN LATERAL (SELECT company_name,linkedin_url,website,employee_count,description" +
        " FROM public.linkedin_company_captures WHERE person_capture_id=p.id ORDER BY captured_at DESC,id DESC LIMIT 1) c ON true" +
        " LEFT JOIN LATERAL (SELECT details FROM public.linkedin_api_audit" +
        " WHERE event_type='capture_saved' AND request_id=p.request_id ORDER BY created_at DESC LIMIT 1) a ON true" +
        " LEFT JOIN public.pulse_quality_reviews rv ON rv.capture_id=p.id " + where +
        " ORDER BY p.captured_at DESC, p.id DESC LIMIT $" + (params.length - 1) + " OFFSET $" + params.length,
        params
      ),
      db.query("SELECT count(*)::int AS total FROM public.linkedin_profile_captures p " + where, totalParams),
    ]);
    const items = rows.rows.map((row) => {
      const assessment = assessCapture(
        { full_name: row.full_name, linkedin_url: row.linkedin_url, current_title: row.current_title,
          current_company: row.current_company, location: row.location },
        { company_name: row.company_name, linkedin_url: row.company_linkedin_url,
          website: row.website, employee_count: row.employee_count, description: row.description },
        row.evidence, { status: row.review_status }
      );
      const { evidence, ...publicRow } = row;
      return { ...publicRow, assessment };
    });
    return Response.json({ connected: true, items, page, limit, total: count.rows[0]?.total || 0 });
  } catch (error) {
    console.error("Quality review query failed", error);
    return Response.json({ connected: false, items: [], total: 0, message: "Não foi possível consultar a qualidade das capturas." }, { status: 500 });
  }
}

export async function POST(request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Origem inválida." }, { status: 403 });
  }
  const db = getPool();
  if (!db) return Response.json({ error: "Banco indisponível." }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON inválido." }, { status: 400 }); }
  const id = String(body?.capture_id || "");
  const status = String(body?.status || "");
  const note = String(body?.note || "").trim().slice(0, 2000);
  if (!/^[1-9]\d{0,17}$/.test(id) || !["pending", "approved", "rejected"].includes(status)) {
    return Response.json({ error: "Identificador ou status inválido." }, { status: 400 });
  }
  if (status === "rejected" && !note) {
    return Response.json({ error: "Descreva o problema antes de rejeitar." }, { status: 400 });
  }
  try {
    const args = [id, status, note, user.id];
    let access = "";
    if (user.role !== "master") access = " AND p.owner_user_id=$4::bigint";
    const updated = await db.query(
      "INSERT INTO public.pulse_quality_reviews(capture_id,status,note,reviewed_by)" +
      " SELECT p.id,$2,$3,$4::bigint FROM public.linkedin_profile_captures p" +
      " WHERE p.id=$1::bigint" + access +
      " ON CONFLICT(capture_id) DO UPDATE SET status=EXCLUDED.status,note=EXCLUDED.note," +
      " reviewed_by=EXCLUDED.reviewed_by,updated_at=NOW() RETURNING capture_id::text,status,updated_at",
      args
    );
    if (!updated.rowCount) return Response.json({ error: "Captura não encontrada ou acesso negado." }, { status: 404 });
    return Response.json({ ok: true, review: updated.rows[0] });
  } catch (error) {
    console.error("Quality review update failed", error);
    return Response.json({ error: "Falha ao salvar revisão." }, { status: 500 });
  }
}
