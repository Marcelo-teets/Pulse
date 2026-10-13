import pg from "pg";
import { inspectSheetsConnection } from "../../../lib/sheets-health.js";

export const dynamic = "force-dynamic";
const { Pool } = pg;

export async function GET(request) {
  // Read-only diagnostics are available only to Vercel Preview, never production.
  if (process.env.VERCEL_ENV === "preview" && new URL(request.url).searchParams.get("sheets_probe") === "1") {
    const sheets = await inspectSheetsConnection();
    return Response.json({ app: "pulse", target: "preview-environment", sheets }, {
      status: sheets.state === "ready" ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  }
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
