import pg from "pg";

export const dynamic = "force-dynamic";
const { Pool } = pg;
let pool;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000 });
  return pool;
}

export async function GET(request) {
  const db = getPool();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 200);

  if (!db) return Response.json({ connected: false, items: [], total: 0, message: "DATABASE_URL não configurada." });

  try {
    const params = [];
    let where = "";
    if (q) {
      params.push("%" + q + "%");
      where = `WHERE p.full_name ILIKE $1 OR p.current_title ILIKE $1 OR p.current_company ILIKE $1 OR p.location ILIKE $1 OR c.company_name ILIKE $1`;
    }
    params.push(limit);
    const limitRef = "$" + params.length;

    const [items, total] = await Promise.all([
      db.query(`
        SELECT p.id, p.full_name, p.linkedin_url, p.location, p.current_title, p.current_company,
               p.first_seen_at, p.last_seen_at, c.company_name, c.website, c.employee_count
        FROM public.linkedin_people p
        LEFT JOIN public.linkedin_current_roles r ON r.person_id = p.id
        LEFT JOIN public.linkedin_companies c ON c.id = r.company_id
        ${where}
        ORDER BY p.last_seen_at DESC
        LIMIT ${limitRef}
      `, params),
      db.query(`
        SELECT count(*)::int AS total
        FROM public.linkedin_people p
        LEFT JOIN public.linkedin_current_roles r ON r.person_id = p.id
        LEFT JOIN public.linkedin_companies c ON c.id = r.company_id
        ${where}
      `, q ? [params[0]] : []),
    ]);

    return Response.json({ connected: true, items: items.rows, total: total.rows[0]?.total || 0 });
  } catch (error) {
    console.error("People query failed", error);
    return Response.json({ connected: false, items: [], total: 0, message: "Falha ao consultar pessoas." });
  }
}
