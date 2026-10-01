import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@neon/functions";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

const VERSION = "0.7.0";
const MAX_BODY_BYTES = 180_000;
const LEGACY_TOKENS = [
  process.env.PULSE_EXTENSION_TOKEN_LEGACY_CURRENT,
  process.env.PULSE_EXTENSION_TOKEN_LEGACY_PREVIOUS,
].filter(Boolean) as string[];
const LEGACY_UNTIL = Date.parse(process.env.PULSE_LEGACY_AUTH_UNTIL || "1970-01-01T00:00:00Z");

const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-extension-token, x-pulse-device-token, x-pulse-extension-version",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "cache-control": "no-store",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const clean = (value: unknown, max = 4000) => {
  if (typeof value !== "string") return null;
  const v = value.replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : null;
};
const q = async <T = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
  client: Pool | PoolClient = pool
) => (await client.query<T>(text, values)).rows;

async function audit(
  eventType: string,
  input: {
    deviceId?: string | null;
    requestId?: string | null;
    extensionVersion?: string | null;
    success: boolean;
    httpStatus: number;
    details?: unknown;
  }
) {
  try {
    await q(
      "INSERT INTO public.linkedin_api_audit(event_type,device_id,request_id,extension_version,success,http_status,details) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",
      [
        eventType,
        input.deviceId ?? null,
        input.requestId ?? null,
        input.extensionVersion ?? null,
        input.success,
        input.httpStatus,
        JSON.stringify(input.details ?? {}),
      ]
    );
  } catch (error) {
    console.error("audit insert failed", error);
  }
}

async function authenticate(request: Request) {
  const extensionVersion = clean(request.headers.get("x-pulse-extension-version"), 50);
  const deviceToken = clean(request.headers.get("x-pulse-device-token"), 500);

  if (deviceToken) {
    const rows = await q<{ device_id: string }>(
      "SELECT device_id FROM public.linkedin_devices WHERE token_hash=$1 AND revoked_at IS NULL AND (token_expires_at IS NULL OR token_expires_at>NOW()) LIMIT 1",
      [sha(deviceToken)]
    );
    if (rows.length) {
      await q(
        "UPDATE public.linkedin_devices SET last_seen_at=NOW(), extension_version=COALESCE($2,extension_version) WHERE device_id=$1",
        [rows[0].device_id, extensionVersion]
      );
      return { ok: true, deviceId: rows[0].device_id, mode: "device", extensionVersion };
    }
  }

  const legacy = clean(request.headers.get("x-extension-token"), 500);
  if (legacy && Date.now() <= LEGACY_UNTIL && LEGACY_TOKENS.includes(legacy)) {
    return { ok: true, deviceId: "legacy-v06", mode: "legacy", extensionVersion };
  }

  return { ok: false, deviceId: null, mode: null, extensionVersion };
}

function normalizeLinkedinUrl(value: unknown) {
  const raw = clean(value, 2000);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname) || !/^\/in\//i.test(u.pathname)) return null;
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function capturedAt(value: unknown) {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    const d = new Date(value);
    if (Math.abs(Date.now() - d.getTime()) < 86_400_000) return d.toISOString();
  }
  return new Date().toISOString();
}

function validatePerson(input: any) {
  const full_name = clean(input?.full_name, 500);
  const linkedin_url = normalizeLinkedinUrl(input?.linkedin_url);
  if (!full_name) throw new Error("full_name é obrigatório");
  if (!linkedin_url) throw new Error("linkedin_url inválida");
  const person = {
    full_name,
    linkedin_url,
    location: clean(input?.location, 1000),
    current_title: clean(input?.current_title, 1000),
    current_company: clean(input?.current_company, 1000),
    captured_at: capturedAt(input?.captured_at),
  };
  return { ...person, raw_json: { ...person } };
}

function validateCompany(input: any, fallback: unknown) {
  const company_name = clean(input?.company_name, 1000) || clean(fallback, 1000);
  if (!company_name) throw new Error("company_name é obrigatório");
  let website = clean(input?.website, 2000);
  if (website && !/^https?:\/\//i.test(website)) website = null;
  return {
    company_name,
    description: clean(input?.description, 12000),
    website,
    employee_count: clean(input?.employee_count, 500),
    captured_at: capturedAt(input?.captured_at),
  };
}

function companyKey(company: any) {
  let host = "";
  try {
    host = company.website ? new URL(company.website).hostname.toLowerCase().replace(/^www\./, "") : "";
  } catch {}
  const name = company.company_name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return sha(`${name}|${host}`);
}

async function findExisting(requestId: string) {
  const person = await q<{ person_id: string }>(
    "SELECT id::text AS person_id FROM public.linkedin_profile_captures WHERE request_id=$1 LIMIT 1",
    [requestId]
  );
  if (!person.length) return null;
  const company = await q<{ company_id: string }>(
    "SELECT id::text AS company_id FROM public.linkedin_company_captures WHERE request_id=$1 LIMIT 1",
    [requestId]
  );
  return {
    person_id: person[0].person_id,
    company_id: company[0]?.company_id ?? null,
    duplicate: true,
  };
}

async function persist(requestId: string, person: any, company: any) {
  const existing = await findExisting(requestId);
  if (existing) return existing;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const personCapture = await q<{ id: string }>(
      "INSERT INTO public.linkedin_profile_captures(request_id,full_name,linkedin_url,location,current_title,current_company,captured_at,raw_json) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb) RETURNING id::text",
      [
        requestId,
        person.full_name,
        person.linkedin_url,
        person.location,
        person.current_title,
        person.current_company,
        person.captured_at,
        JSON.stringify(person.raw_json),
      ],
      client
    );
    const personCaptureId = personCapture[0].id;

    const companyCapture = await q<{ id: string }>(
      "INSERT INTO public.linkedin_company_captures(request_id,person_capture_id,company_name,description,website,employee_count,captured_at) VALUES($1,$2::bigint,$3,$4,$5,$6,$7::timestamptz) RETURNING id::text",
      [
        requestId,
        personCaptureId,
        company.company_name,
        company.description,
        company.website,
        company.employee_count,
        company.captured_at,
      ],
      client
    );
    const companyCaptureId = companyCapture[0].id;

    const canonicalPerson = await q<{ id: string }>(
      "INSERT INTO public.linkedin_people(linkedin_url,full_name,location,current_title,current_company,first_seen_at,last_seen_at,last_capture_id) VALUES($1,$2,$3,$4,$5,$6::timestamptz,$6::timestamptz,$7::bigint) ON CONFLICT(linkedin_url) DO UPDATE SET full_name=EXCLUDED.full_name,location=EXCLUDED.location,current_title=EXCLUDED.current_title,current_company=EXCLUDED.current_company,last_seen_at=GREATEST(public.linkedin_people.last_seen_at,EXCLUDED.last_seen_at),last_capture_id=EXCLUDED.last_capture_id RETURNING id::text",
      [
        person.linkedin_url,
        person.full_name,
        person.location,
        person.current_title,
        person.current_company,
        person.captured_at,
        personCaptureId,
      ],
      client
    );

    const canonicalCompany = await q<{ id: string }>(
      "INSERT INTO public.linkedin_companies(company_key,company_name,description,website,employee_count,first_seen_at,last_seen_at,last_capture_id) VALUES($1,$2,$3,$4,$5,$6::timestamptz,$6::timestamptz,$7::bigint) ON CONFLICT(company_key) DO UPDATE SET company_name=EXCLUDED.company_name,description=COALESCE(EXCLUDED.description,public.linkedin_companies.description),website=COALESCE(EXCLUDED.website,public.linkedin_companies.website),employee_count=COALESCE(EXCLUDED.employee_count,public.linkedin_companies.employee_count),last_seen_at=GREATEST(public.linkedin_companies.last_seen_at,EXCLUDED.last_seen_at),last_capture_id=EXCLUDED.last_capture_id RETURNING id::text",
      [
        companyKey(company),
        company.company_name,
        company.description,
        company.website,
        company.employee_count,
        company.captured_at,
        companyCaptureId,
      ],
      client
    );

    await q(
      "INSERT INTO public.linkedin_current_roles(person_id,company_id,current_title,first_seen_at,last_seen_at) VALUES($1::bigint,$2::bigint,$3,$4::timestamptz,$4::timestamptz) ON CONFLICT(person_id) DO UPDATE SET company_id=EXCLUDED.company_id,current_title=EXCLUDED.current_title,last_seen_at=EXCLUDED.last_seen_at",
      [canonicalPerson[0].id, canonicalCompany[0].id, person.current_title, person.captured_at],
      client
    );

    await client.query("COMMIT");
    return {
      person_id: personCaptureId,
      company_id: companyCaptureId,
      canonical_person_id: canonicalPerson[0].id,
      canonical_company_id: canonicalCompany[0].id,
      duplicate: false,
    };
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") {
      const raced = await findExisting(requestId);
      if (raced) return raced;
    }
    throw error;
  } finally {
    client.release();
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    try {
      if (request.method === "GET" && path === "/health") {
        const rows = await q<{ ok: number }>("SELECT 1::int AS ok");
        return json({ ok: rows[0]?.ok === 1, service: "pulse-linkedin-capture", version: VERSION });
      }

      if (request.method === "POST" && path === "/pair") {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return json({ error: "JSON inválido" }, 400);
        }

        const code = clean(body?.pairing_code, 100);
        const deviceName = clean(body?.device_name, 200) || "Chrome";
        const extensionVersion = clean(body?.extension_version, 50) || VERSION;
        if (!code) return json({ error: "pairing_code é obrigatório" }, 400);

        const client = await pool.connect();
        const deviceId = randomUUID();
        const token = randomBytes(32).toString("base64url");

        try {
          await client.query("BEGIN");
          const valid = await q(
            "SELECT code_hash FROM public.linkedin_pairing_codes WHERE code_hash=$1 AND used_at IS NULL AND expires_at>NOW() FOR UPDATE",
            [sha(code)],
            client
          );
          if (!valid.length) {
            await client.query("ROLLBACK");
            await audit("pair_failed", {
              success: false,
              httpStatus: 401,
              extensionVersion,
              details: { reason: "invalid_or_expired" },
            });
            return json({ error: "Código de pareamento inválido, expirado ou já utilizado" }, 401);
          }

          await q(
            "INSERT INTO public.linkedin_devices(device_id,device_name,token_hash,created_at,last_seen_at,extension_version,token_expires_at) VALUES($1,$2,$3,NOW(),NOW(),$4,NOW()+INTERVAL '90 days')",
            [deviceId, deviceName, sha(token), extensionVersion],
            client
          );
          await q(
            "UPDATE public.linkedin_pairing_codes SET used_at=NOW(),used_by_device_id=$2 WHERE code_hash=$1",
            [sha(code), deviceId],
            client
          );
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }

        await audit("pair_success", {
          deviceId,
          success: true,
          httpStatus: 201,
          extensionVersion,
          details: { device_name: deviceName },
        });
        return json({ ok: true, device_id: deviceId, device_token: token, expires_in_days: 90 }, 201);
      }

      const auth = await authenticate(request);
      if (!auth.ok) {
        await audit("auth_failed", {
          success: false,
          httpStatus: 401,
          extensionVersion: auth.extensionVersion,
          details: { path },
        });
        return json({ error: "Unauthorized" }, 401);
      }

      if (request.method === "GET" && (path === "/" || path === "/status")) {
        const rows = await q(
          "SELECT (SELECT COUNT(*)::int FROM public.linkedin_profile_captures) AS person_captures,(SELECT COUNT(*)::int FROM public.linkedin_company_captures) AS company_captures,(SELECT COUNT(*)::int FROM public.linkedin_people) AS canonical_people,(SELECT COUNT(*)::int FROM public.linkedin_companies) AS canonical_companies,(SELECT COUNT(*)::int FROM public.linkedin_sheet_sync_queue WHERE status IN ('pending','error')) AS sheet_backlog"
        );
        return json({
          ok: true,
          service: "pulse-linkedin-capture",
          version: VERSION,
          auth_mode: auth.mode,
          ...rows[0],
        });
      }

      if (request.method !== "POST" || !(path === "/" || path === "/capture")) {
        return json({ error: "Not found" }, 404);
      }

      const length = Number(request.headers.get("content-length") || "0");
      if (length > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413);

      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "JSON inválido" }, 400);
      }

      const requestId = clean(body?.request_id, 100);
      if (!requestId || !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(requestId)) {
        return json({ error: "request_id inválido" }, 400);
      }

      let person;
      let company;
      try {
        person = validatePerson(body?.person);
        company = validateCompany(body?.company, person.current_company);
      } catch (error: any) {
        return json({ error: error.message || "Payload inválido" }, 400);
      }

      const result = await persist(requestId, person, company);
      const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};

      await audit("capture_saved", {
        deviceId: auth.deviceId,
        requestId,
        extensionVersion: auth.extensionVersion,
        success: true,
        httpStatus: result.duplicate ? 200 : 201,
        details: {
          duplicate: !!result.duplicate,
          quality_score: Number.isFinite(Number(meta.quality_score)) ? Number(meta.quality_score) : null,
          missing_fields: Array.isArray(meta.missing_fields) ? meta.missing_fields.slice(0, 20) : [],
        },
      });

      return json({ ok: true, request_id: requestId, ...result }, result.duplicate ? 200 : 201);
    } catch (error) {
      console.error("pulse linkedin api error", error);
      return json({ error: "Internal server error" }, 500);
    }
  },
};
