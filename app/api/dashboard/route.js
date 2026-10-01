import pg from "pg";

export const dynamic = "force-dynamic";

const { Pool } = pg;

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function GET() {
  const generatedAt = new Date().toISOString();
  const db = getPool();

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
          (SELECT count(*)::int FROM public.linkedin_people) AS people,
          (SELECT count(*)::int FROM public.linkedin_companies) AS companies,
          (SELECT count(*)::int FROM public.linkedin_profile_captures) AS profile_captures,
          (SELECT count(*)::int FROM public.linkedin_company_captures) AS company_captures,
          (SELECT count(*)::int FROM public.linkedin_sheet_sync_queue WHERE status = 'pending') AS pending_sync,
          (SELECT count(*)::int FROM public.linkedin_sheet_sync_queue WHERE status = 'synced') AS synced,
          (SELECT count(*)::int FROM public.linkedin_sheet_sync_queue WHERE status = 'processing') AS processing,
          (SELECT count(*)::int FROM public.linkedin_sheet_sync_queue WHERE status = 'error') AS errors
      `),
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
        ORDER BY p.last_seen_at DESC
        LIMIT 20
      `),
      db.query(`
        SELECT
          id,
          company_key,
          company_name,
          website,
          employee_count,
          last_seen_at
        FROM public.linkedin_companies
        ORDER BY last_seen_at DESC
        LIMIT 10
      `),
      db.query(`
        SELECT id, status, attempts, last_error, created_at, synced_at, next_attempt_at
        FROM public.linkedin_sheet_sync_queue
        ORDER BY created_at DESC
        LIMIT 20
      `),
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
