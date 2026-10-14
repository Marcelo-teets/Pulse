import { getPool } from "../../../lib/db";
import { requireUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const db = getPool();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().slice(0, 200);
  const rawLimit = Number(searchParams.get("limit") || 50);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 200) : 50;
  const rawPage = Number(searchParams.get("page") || 1);
  const page = Number.isSafeInteger(rawPage) ? Math.min(Math.max(rawPage, 1), 10000) : 1;
  const offset = (page - 1) * limit;

  if (!db) return Response.json({ connected: false, items: [], total: 0, message: "DATABASE_URL não configurada." }, { status: 503 });

  try {
    const params = [];
    const conditions = [];
    if (q) {
      params.push("%" + q + "%");
      conditions.push(`(c.company_name ILIKE $1 OR c.description ILIKE $1 OR c.website ILIKE $1 OR c.employee_count ILIKE $1)`);
    }
    let userRef = null;
    if (user.role !== "master") {
      params.push(user.id);
      userRef = "$" + params.length;
      conditions.push(`EXISTS (SELECT 1 FROM public.pulse_user_companies uc WHERE uc.company_id = c.id AND uc.user_id = ${userRef})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const peopleCountSql = user.role === "master"
      ? "count(r.person_id)::int"
      : `count(r.person_id) FILTER (WHERE EXISTS (
          SELECT 1 FROM public.pulse_user_people up
          WHERE up.person_id = r.person_id AND up.user_id = ${userRef}
        ))::int`;
    params.push(limit, offset);
    const limitRef = "$" + (params.length - 1);
    const offsetRef = "$" + params.length;

    const [items, total] = await Promise.all([
      db.query(`
        SELECT c.id, c.company_key, c.company_name, c.description, c.website, c.employee_count,
               c.first_seen_at, c.last_seen_at,
               ${peopleCountSql} AS people_count
        FROM public.linkedin_companies c
        LEFT JOIN public.linkedin_current_roles r ON r.company_id = c.id
        ${where}
        GROUP BY c.id
        ORDER BY c.last_seen_at DESC
        LIMIT ${limitRef} OFFSET ${offsetRef}
      `, params),
      db.query(`
        SELECT count(*)::int AS total
        FROM public.linkedin_companies c
        ${where}
      `, params.slice(0, -2)),
    ]);

    return Response.json({ connected: true, items: items.rows, total: total.rows[0]?.total || 0, page, limit });
  } catch (error) {
    console.error("Companies query failed", error);
    return Response.json({ connected: false, items: [], total: 0, message: "Falha ao consultar empresas." }, { status: 500 });
  }
}
