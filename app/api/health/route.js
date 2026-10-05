import pg from "pg";

export const dynamic = "force-dynamic";
const { Pool } = pg;

export async function GET() {
  const startedAt = Date.now();

  if (!process.env.DATABASE_URL) {
    return Response.json({
      status: "degraded",
      app: "pulse",
      database: "not_configured",
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 4000,
  });

  try {
    await pool.query("SELECT 1");
    return Response.json({
      status: "ok",
      app: "pulse",
      database: "connected",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Healthcheck database error", error);
    return Response.json({
      status: "degraded",
      app: "pulse",
      database: "unreachable",
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  } finally {
    await pool.end().catch(() => {});
  }
}
