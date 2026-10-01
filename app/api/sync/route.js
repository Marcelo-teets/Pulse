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
  const status = (searchParams.get("status") || "all").trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 100), 1), 250);

  if (!db) {
    return Response.json({
      connected: false,
      items: [],
      stats: { total: 0, pending: 0, processing: 0, synced: 0, error: 0 },
      message: "DATABASE_URL não configurada.",
    });
  }

  try {
    const values = [];
    let where = "";
    if (["pending", "processing", "synced", "error"].includes(status)) {
      values.push(status);
      where = "WHERE q.status = $1";
    }
    values.push(limit);
    const limitRef = "$" + values.length;

    const [items, stats] = await Promise.all([
      db.query(`
        SELECT q.id, q.status, q.attempts, q.last_error, q.created_at, q.synced_at,
               q.next_attempt_at, q.last_attempt_at,
               pc.full_name, pc.linkedin_url, pc.current_title,
               cc.company_name
        FROM public.linkedin_sheet_sync_queue q
        LEFT JOIN public.linkedin_profile_captures pc ON pc.id = q.person_capture_id
        LEFT JOIN public.linkedin_company_captures cc ON cc.id = q.company_capture_id
        ${where}
        ORDER BY q.created_at DESC
        LIMIT ${limitRef}
      `, values),
      db.query(`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE status = 'pending')::int AS pending,
          count(*) FILTER (WHERE status = 'processing')::int AS processing,
          count(*) FILTER (WHERE status = 'synced')::int AS synced,
          count(*) FILTER (WHERE status = 'error')::int AS error
        FROM public.linkedin_sheet_sync_queue
      `),
    ]);

    return Response.json({ connected: true, items: items.rows, stats: stats.rows[0] });
  } catch (error) {
    console.error("Sync query failed", error);
    return Response.json({
      connected: false,
      items: [],
      stats: { total: 0, pending: 0, processing: 0, synced: 0, error: 0 },
      message: "Falha ao consultar a fila de sincronização.",
    });
  }
}
