import { getPool } from "../../../lib/db";
import { requireUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { user, response } = await requireUser();
  if (response) return response;
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
    const conditions = [];
    if (["pending", "processing", "synced", "error"].includes(status)) {
      values.push(status);
      conditions.push(`q.status = $1`);
    }
    if (user.role !== "master") {
      values.push(user.id);
      conditions.push(`pc.owner_user_id = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
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
        FROM public.linkedin_sheet_sync_queue q
        LEFT JOIN public.linkedin_profile_captures pc ON pc.id = q.person_capture_id
        ${user.role !== "master" ? "WHERE pc.owner_user_id = $1" : ""}
      `, user.role !== "master" ? [user.id] : []),
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
