import { getPool } from "../../../lib/db";
import { requireUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const generatedAt = new Date().toISOString();
  const db = getPool();
  const peopleOwnerSql = user.role === "master" ? "" : "WHERE EXISTS (SELECT 1 FROM public.pulse_user_people up WHERE up.person_id = public.linkedin_people.id AND up.user_id = $1)";
  const companyOwnerSql = user.role === "master" ? "" : "WHERE EXISTS (SELECT 1 FROM public.pulse_user_companies uc WHERE uc.company_id = public.linkedin_companies.id AND uc.user_id = $1)";
  const captureOwnerSql = user.role === "master" ? "" : "WHERE owner_user_id = $1";
  const ownerParams = user.role === "master" ? [] : [user.id];
  const queueOwnerSql = user.role === "master" ? "" : "JOIN public.linkedin_profile_captures op ON op.id = q.person_capture_id AND op.owner_user_id = $1";

  if (!db) {
    return Response.json({
      connected: false,
      generatedAt,
      message: "DATABASE_URL ainda não está configurada no ambiente do Vercel.",
      stats: {
        people: 0,
        companies: 0,
        profileCaptures: 0,
        companyCaptures: 0,
        pendingSync: 0,
        synced: 0,
        processing: 0,
        errors: 0,
      },
      people: [],
      companies: [],
      queue: [],
    });
  }

  try {
    const [statsResult, peopleResult, companyResult, queueResult] = await Promise.all([
      db.query(`
        SELECT
          (SELECT count(*)::int FROM public.linkedin_people ${peopleOwnerSql}) AS people,
          (SELECT count(*)::int FROM public.linkedin_companies ${companyOwnerSql}) AS companies,
          (SELECT count(*)::int FROM public.linkedin_profile_captures ${captureOwnerSql}) AS profile_captures,
          (SELECT count(*)::int FROM public.linkedin_company_captures ${captureOwnerSql}) AS company_captures,
          (SELECT count(*)::int FROM public.linkedin_sheet_sync_queue q ${queueOwnerSql} WHERE q.status = 'pending') AS pending_sync,
          (SELECT count(*)::int FROM public.linkedin_sheet_sync_queue q ${queueOwnerSql} WHERE q.status = 'synced') AS synced,
          (SELECT count(*)::int FROM public.linkedin_sheet_sync_queue q ${queueOwnerSql} WHERE q.status = 'processing') AS processing,
          (SELECT count(*)::int FROM public.linkedin_sheet_sync_queue q ${queueOwnerSql} WHERE q.status = 'error') AS errors
      `, ownerParams),
      db.query(`
        SELECT
          p.id,
          p.full_name,
          p.linkedin_url,
          p.location,
          p.current_title,
          p.current_company,
          p.last_seen_at,
          c.company_name,
          c.website,
          c.employee_count
        FROM public.linkedin_people p
        LEFT JOIN public.linkedin_current_roles r ON r.person_id = p.id
        LEFT JOIN public.linkedin_companies c ON c.id = r.company_id
        ${user.role === "master" ? "" : "WHERE EXISTS (SELECT 1 FROM public.pulse_user_people up WHERE up.person_id = p.id AND up.user_id = $1)"}
        ORDER BY p.last_seen_at DESC
        LIMIT 20
      `, ownerParams),
      db.query(`
        SELECT
          id,
          company_key,
          company_name,
          website,
          employee_count,
          last_seen_at
        FROM public.linkedin_companies
        ${user.role === "master" ? "" : "WHERE EXISTS (SELECT 1 FROM public.pulse_user_companies uc WHERE uc.company_id = public.linkedin_companies.id AND uc.user_id = $1)"}
        ORDER BY last_seen_at DESC
        LIMIT 10
      `, ownerParams),
      db.query(`
        SELECT q.id, q.status, q.attempts, q.last_error, q.created_at, q.synced_at, q.next_attempt_at
        FROM public.linkedin_sheet_sync_queue q
        ${queueOwnerSql}
        ORDER BY q.created_at DESC
        LIMIT 20
      `, ownerParams),
    ]);

    const rawStats = statsResult.rows[0] || {};

    return Response.json({
      connected: true,
      generatedAt,
      stats: {
        people: rawStats.people ?? 0,
        companies: rawStats.companies ?? 0,
        profileCaptures: rawStats.profile_captures ?? 0,
        companyCaptures: rawStats.company_captures ?? 0,
        pendingSync: rawStats.pending_sync ?? 0,
        synced: rawStats.synced ?? 0,
        processing: rawStats.processing ?? 0,
        errors: rawStats.errors ?? 0,
      },
      people: peopleResult.rows,
      companies: companyResult.rows,
      queue: queueResult.rows,
    });
  } catch (error) {
    console.error("Pulse dashboard query failed", error);
    return Response.json(
      {
        connected: false,
        generatedAt,
        message: "O frontend está online, mas a consulta ao Neon falhou.",
        stats: {},
        people: [],
        companies: [],
        queue: [],
      },
      { status: 200 }
    );
  }
}
