// Pulse Sheets sync worker — production
const LINKEDIN_API_VERSION = "0.7.2";
import { createSign } from "node:crypto";
import pg from "pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const { Pool } = pg;
let pool;

function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function googleAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error("Google service-account credentials not configured");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const key = rawKey.replace(/\\n/g, "\n");
  const assertion = `${unsigned}.${signer.sign(key).toString("base64url")}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Google OAuth failed");
  }
  return payload.access_token;
}

async function sheetsFetch(token, path, init = {}) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Sheets API ${response.status}`);
  return payload;
}

async function getValues(token, range) {
  return sheetsFetch(token, `values/${encodeURIComponent(range)}?majorDimension=ROWS`);
}

async function appendValues(token, range, values) {
  return sheetsFetch(
    token,
    `values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values }) }
  );
}

async function updateValues(token, range, values) {
  return sheetsFetch(
    token,
    `values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ majorDimension: "ROWS", values }) }
  );
}

function normalizeCompanyName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCompanyKey(name, website, linkedinUrl) {
  const linked = String(linkedinUrl || "").trim().replace(/\/$/, "").toLowerCase();
  if (linked) return `linkedin:${linked}`;
  let host = "";
  try { host = website ? new URL(website).hostname.toLowerCase().replace(/^www\./, "") : ""; } catch {}
  return `${normalizeCompanyName(name)}|${host}`;
}

async function claimBatch(database, limit = 20) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      WITH picked AS (
        SELECT id
        FROM public.linkedin_sheet_sync_queue
        WHERE (
          status IN ('pending','error')
          AND COALESCE(next_attempt_at, NOW()) <= NOW()
        ) OR (
          status='processing'
          AND COALESCE(last_attempt_at, created_at) <= NOW() - INTERVAL '15 minutes'
        )
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      )
      UPDATE public.linkedin_sheet_sync_queue q
      SET status='processing',
          attempts=q.attempts+1,
          last_attempt_at=NOW(),
          last_error=NULL
      FROM picked
      WHERE q.id=picked.id
      RETURNING q.id
    `, [limit]);
    await client.query("COMMIT");
    return result.rows.map((row) => String(row.id));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function loadPayloads(database, ids) {
  if (!ids.length) return [];
  const result = await database.query(`
    SELECT q.id::text AS sync_id,
           p.id::text AS person_capture_id,
           p.full_name,p.linkedin_url,p.location,p.current_title,p.current_company,
           p.captured_at AS person_captured_at,p.raw_json,
           c.id::text AS company_capture_id,c.company_name,c.linkedin_url AS company_linkedin_url,c.description AS company_description,
           c.website AS company_website,c.employee_count,c.captured_at AS company_captured_at
    FROM public.linkedin_sheet_sync_queue q
    JOIN public.linkedin_profile_captures p ON p.id=q.person_capture_id
    JOIN public.linkedin_company_captures c ON c.id=q.company_capture_id
    WHERE q.id = ANY($1::bigint[])
    ORDER BY q.id
  `, [ids]);
  return result.rows;
}

async function markSynced(database, ids) {
  if (!ids.length) return;
  await database.query(`
    UPDATE public.linkedin_sheet_sync_queue
    SET status='synced', synced_at=NOW(), last_error=NULL, next_attempt_at=NOW()
    WHERE id = ANY($1::bigint[])
  `, [ids]);
}

async function markError(database, ids, error) {
  if (!ids.length) return;
  const message = String(error?.message || error || "sync failed").slice(0, 4000);
  await database.query(`
    UPDATE public.linkedin_sheet_sync_queue
    SET status='error',
        last_error=$2,
        next_attempt_at=NOW() + (LEAST(GREATEST(attempts,1),8) * INTERVAL '15 minutes')
    WHERE id = ANY($1::bigint[])
  `, [ids, message]);
}

async function updateOperationalMetrics(database, token) {
  const result = await database.query(`
    SELECT
      (SELECT count(*)::int FROM public.linkedin_sheet_sync_queue WHERE status='synced') AS synced,
      (SELECT count(*)::int FROM public.linkedin_people) AS people,
      (SELECT count(*)::int FROM public.linkedin_companies) AS companies,
      (SELECT max(captured_at) FROM public.linkedin_profile_captures) AS last_capture,
      (SELECT count(*)::int FROM public.linkedin_companies WHERE website IS NOT NULL AND website<>'') AS with_site,
      (SELECT count(*)::int FROM public.linkedin_companies WHERE employee_count IS NOT NULL AND employee_count<>'') AS with_employees,
      (SELECT count(*)::int FROM public.linkedin_sheet_sync_queue WHERE status IN ('pending','processing','error')) AS backlog,
      (SELECT count(*)::int FROM public.linkedin_devices WHERE revoked_at IS NULL AND (token_expires_at IS NULL OR token_expires_at>NOW())) AS active_devices,
      (SELECT count(*)::int FROM public.linkedin_profile_captures WHERE captured_at>=NOW()-INTERVAL '24 hours') AS captures_24h,
      (SELECT count(*)::int FROM public.linkedin_api_audit WHERE success = FALSE AND created_at>=NOW()-INTERVAL '24 hours') AS api_failures_24h
  `);
  const m = result.rows[0] || {};
  await updateValues(token, "Operação!B2:B12", [[m.synced || 0],[m.people || 0],[m.companies || 0],[m.last_capture ? new Date(m.last_capture).toISOString() : ""],[m.with_site || 0],[m.with_employees || 0],[m.backlog || 0],[m.active_devices || 0],[m.captures_24h || 0],[m.api_failures_24h || 0],[LINKEDIN_API_VERSION]]);
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const database = db();
  if (!database) {
    return Response.json({ ok: false, error: "DATABASE_URL not configured" }, { status: 503 });
  }
  if (!process.env.GOOGLE_SHEET_ID) {
    return Response.json({ ok: false, error: "GOOGLE_SHEET_ID not configured" }, { status: 503 });
  }

  const ids = await claimBatch(database, 20);

  try {
    const token = await googleAccessToken();
    if (!ids.length) {
      await updateOperationalMetrics(database, token);
      return Response.json({ ok: true, processed: 0, message: "queue empty", metricsUpdated: true });
    }

    const payloads = await loadPayloads(database, ids);

    const [peopleSheet, companiesSheet, capturesSheet] = await Promise.all([
      getValues(token, "Pessoas!A2:H"),
      getValues(token, "Empresas!A2:H"),
      getValues(token, "Capturas!A2:A"),
    ]);
    const peopleRows = peopleSheet.values || [];
    const companyRows = companiesSheet.values || [];
    const existingCaptureIds = new Set((capturesSheet.values || []).map((row) => String(row?.[0] || "").trim()).filter(Boolean));

    const personRowByUrl = new Map();
    peopleRows.forEach((row, index) => {
      const url = String(row?.[2] || "").trim().replace(/\/$/, "");
      if (url) personRowByUrl.set(url, index + 2);
    });
    let nextPersonRow = peopleRows.length + 2;

    const companyRowByKey = new Map();
    const companyRowByName = new Map();
    companyRows.forEach((row, index) => {
      const rowNumber = index + 2;
      const key = normalizeCompanyKey(row?.[2], row?.[4], row?.[7]);
      if (key !== "|") companyRowByKey.set(key, rowNumber);
      const nameKey = normalizeCompanyName(row?.[2]);
      if (nameKey && !companyRowByName.has(nameKey)) companyRowByName.set(nameKey, rowNumber);
    });
    let nextCompanyRow = companyRows.length + 2;

    const captureRows = [];
    const syncedIds = [];

    for (const item of payloads) {
      const personUrl = String(item.linkedin_url || "").replace(/\/$/, "");
      const companyKey = normalizeCompanyKey(item.company_name, item.company_website, item.company_linkedin_url);
      const companyNameKey = normalizeCompanyName(item.company_name);

      if (!existingCaptureIds.has(String(item.sync_id))) {
        captureRows.push([
          item.sync_id,
          item.person_capture_id,
          item.full_name || "",
          personUrl,
          item.location || "",
          item.current_title || "",
          item.current_company || "",
          item.person_captured_at ? new Date(item.person_captured_at).toISOString() : "",
          JSON.stringify(item.raw_json || {}),
          item.company_capture_id,
          item.company_name || "",
          item.company_description || "",
          item.company_website || "",
          item.employee_count || "",
          item.company_captured_at ? new Date(item.company_captured_at).toISOString() : "",
          "synced",
        ]);
        existingCaptureIds.add(String(item.sync_id));
      }

      const personValues = [[
        item.person_capture_id,
        item.full_name || "",
        personUrl,
        item.location || "",
        item.current_title || "",
        item.current_company || "",
        item.person_captured_at ? new Date(item.person_captured_at).toISOString() : "",
        JSON.stringify(item.raw_json || {}),
      ]];
      const existingPersonRow = personRowByUrl.get(personUrl);
      if (existingPersonRow) {
        await updateValues(token, `Pessoas!A${existingPersonRow}:H${existingPersonRow}`, personValues);
      } else {
        await appendValues(token, "Pessoas!A:H", personValues);
        personRowByUrl.set(personUrl, nextPersonRow++);
      }

      const companyValues = [[
        item.company_capture_id,
        item.person_capture_id,
        item.company_name || "",
        item.company_description || "",
        item.company_website || "",
        item.employee_count || "",
        item.company_captured_at ? new Date(item.company_captured_at).toISOString() : "",
        item.company_linkedin_url || "",
      ]];
      const existingCompanyRow = companyRowByKey.get(companyKey) || companyRowByName.get(companyNameKey);
      if (existingCompanyRow) {
        await updateValues(token, `Empresas!A${existingCompanyRow}:H${existingCompanyRow}`, companyValues);
      } else {
        await appendValues(token, "Empresas!A:H", companyValues);
        companyRowByKey.set(companyKey, nextCompanyRow);
        if (companyNameKey && !companyRowByName.has(companyNameKey)) companyRowByName.set(companyNameKey, nextCompanyRow);
        nextCompanyRow++;
      }

      syncedIds.push(item.sync_id);
    }

    if (captureRows.length) {
      await appendValues(token, "Capturas!A:P", captureRows);
    }

    await markSynced(database, syncedIds);
    await updateOperationalMetrics(database, token);

    return Response.json({ ok: true, processed: syncedIds.length, ids: syncedIds });
  } catch (error) {
    await markError(database, ids, error);
    console.error("Sheets sync failed", error);
    return Response.json({ ok: false, processed: 0, error: String(error?.message || error) }, { status: 500 });
  }
}
