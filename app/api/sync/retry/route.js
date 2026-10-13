import { requireUser } from "../../../../lib/auth";
import { getPool } from "../../../../lib/db";
import { GET as runWorker } from "../../internal/sheets-sync/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (user.role !== "master") return Response.json({ error: "Apenas administradores podem reprocessar a fila." }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const db = getPool();
  const secret = process.env.CRON_SECRET;
  if (!db || !secret) return Response.json({ error: "Banco ou CRON_SECRET não configurado." }, { status: 503 });
  try {
    const recovered = await db.query(
      "UPDATE public.linkedin_sheet_sync_queue SET next_attempt_at=NOW()" +
      " WHERE id IN (SELECT id FROM public.linkedin_sheet_sync_queue WHERE status='error' ORDER BY created_at LIMIT 20)" +
      " RETURNING id"
    );
    const workerRequest = new Request(new URL("/api/internal/sheets-sync", request.url), {
      headers: { authorization: "Bearer " + secret },
    });
    const result = await runWorker(workerRequest);
    const payload = await result.json().catch(() => ({}));
    return Response.json({ ...payload, reactivated: recovered.rowCount }, { status: result.status });
  } catch (error) {
    console.error("Manual Sheets recovery failed", error);
    return Response.json({ error: "Falha ao reprocessar a fila." }, { status: 500 });
  }
}
