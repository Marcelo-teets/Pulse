import { getPool } from "../../../lib/db";
import { requireUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  if (user.role !== "master") return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const generatedAt = new Date().toISOString();
  const db = getPool();

  if (!db) {
    return Response.json({
      connected: false,
      generatedAt,
      summary: {},
      devices: [],
      audit: [],
      quality: { average: null, scored: 0 },
      message: "DATABASE_URL não configurada no Vercel.",
    });
  }

  try {
    const [summary, devices, audit, quality] = await Promise.all([
      db.query("SELECT * FROM public.linkedin_ops_summary"),
      db.query(`
        SELECT device_id, device_name, created_at, last_seen_at, revoked_at,
               extension_version, token_expires_at, status
        FROM public.linkedin_device_status
        ORDER BY COALESCE(last_seen_at, created_at) DESC
        LIMIT 50
      `),
      db.query(`
        SELECT id, event_type, device_id, request_id, extension_version,
               success, http_status, details, created_at
        FROM public.linkedin_api_audit_safe
        ORDER BY created_at DESC
        LIMIT 100
      `),
      db.query(`
        SELECT
          ROUND(AVG(NULLIF(details->>'quality_score','')::numeric), 1) AS average,
          COUNT(*) FILTER (
            WHERE event_type='capture_saved'
              AND details ? 'quality_score'
              AND details->>'quality_score' IS NOT NULL
          )::int AS scored
        FROM public.linkedin_api_audit_safe
        WHERE event_type='capture_saved'
      `),
    ]);

    return Response.json({
      connected: true,
      generatedAt,
      summary: summary.rows[0] || {},
      devices: devices.rows,
      audit: audit.rows,
      quality: quality.rows[0] || { average: null, scored: 0 },
    });
  } catch (error) {
    console.error("Operations query failed", error);
    return Response.json({
      connected: false,
      generatedAt,
      summary: {},
      devices: [],
      audit: [],
      quality: { average: null, scored: 0 },
      message: "Falha ao consultar a telemetria operacional.",
    });
  }
}
