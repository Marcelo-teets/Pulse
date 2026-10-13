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
  const displayNameSql = `
    COALESCE(
      NULLIF(BTRIM(p.full_name), ''),
      NULLIF(BTRIM(pc.full_name), ''),
      NULLIF(INITCAP(REPLACE(REPLACE(SPLIT_PART(SPLIT_PART(p.linkedin_url, '/in/', 2), '/', 1), '-', ' '), '_', ' ')), ''),
      'Perfil LinkedIn'
    )
  `;

  if (!db) return Response.json({ connected: false, items: [], total: 0, message: "DATABASE_URL não configurada." }, { status: 503 });

  try {
    const params = [];
    const conditions = [];
    if (q) {
      params.push("%" + q + "%");
      conditions.push(`(${displayNameSql} ILIKE $1 OR p.current_title ILIKE $1 OR p.current_company ILIKE $1 OR p.location ILIKE $1 OR c.company_name ILIKE $1)`);
    }
    if (user.role !== "master") {
      params.push(user.id);
      conditions.push(`EXISTS (SELECT 1 FROM public.pulse_user_people up WHERE up.person_id = p.id AND up.user_id = $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);
    const limitRef = "$" + (params.length - 1);
    const offsetRef = "$" + params.length;

    const [items, total] = await Promise.all([
      db.query(`
        SELECT p.id, ${displayNameSql} AS full_name, p.linkedin_url, p.location, p.current_title, p.current_company,
               p.first_seen_at, p.last_seen_at, c.company_name, c.website, c.employee_count
        FROM public.linkedin_people p
        LEFT JOIN public.linkedin_profile_captures pc ON pc.id = p.last_capture_id
        LEFT JOIN public.linkedin_current_roles r ON r.person_id = p.id
        LEFT JOIN public.linkedin_companies c ON c.id = r.company_id
        ${where}
        ORDER BY p.last_seen_at DESC
        LIMIT ${limitRef} OFFSET ${offsetRef}
      `, params),
      db.query(`
        SELECT count(*)::int AS total
        FROM public.linkedin_people p
        LEFT JOIN public.linkedin_profile_captures pc ON pc.id = p.last_capture_id
        LEFT JOIN public.linkedin_current_roles r ON r.person_id = p.id
        LEFT JOIN public.linkedin_companies c ON c.id = r.company_id
        ${where}
      `, params.slice(0, -2)),
    ]);

    return Response.json({ connected: true, items: items.rows, total: total.rows[0]?.total || 0, page, limit });
  } catch (error) {
    console.error("People query failed", error);
    return Response.json({ connected: false, items: [], total: 0, message: "Falha ao consultar pessoas." }, { status: 500 });
  }
}
