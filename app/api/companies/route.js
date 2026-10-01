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
      where = `WHERE c.company_name ILIKE $1 OR c.description ILIKE $1 OR c.website ILIKE $1 OR c.employee_count ILIKE $1`;
    }
    params.push(limit);
    const limitRef = "$" + params.length;

    const [items, total] = await Promise.all([
      db.query(`
        SELECT c.id, c.company_key, c.company_name, c.description, c.website, c.employee_count,
               c.first_seen_at, c.last_seen_at,
               count(r.person_id)::int AS people_count
        FROM public.linkedin_companies c
        LEFT JOIN public.linkedin_current_roles r ON r.company_id = c.id
        ${where}
        GROUP BY c.id
        ORDER BY c.last_seen_at DESC
        LIMIT ${limitRef}
      `, params),
      db.query(`
        SELECT count(*)::int AS total
        FROM public.linkedin_companies c
        ${where}
      `, q ? [params[0]] : []),
    ]);

    return Response.json({ connected: true, items: items.rows, total: total.rows[0]?.total || 0 });
  } catch (error) {
    console.error("Companies query failed", error);
    return Response.json({ connected: false, items: [], total: 0, message: "Falha ao consultar empresas." });
  }
}
