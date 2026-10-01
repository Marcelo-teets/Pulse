import { Pool } from "pg";
import { attachDatabasePool } from "@neon/functions";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

const TOKEN = process.env.PULSE_EXTENSION_TOKEN || "";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-extension-token",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

function cleanString(value: unknown, max = 4000) {
  if (typeof value !== "string") return null;
  const v = value.replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : null;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    if (request.method === "GET") {
      const { rows } = await pool.query("select 1 as ok");
      return json({ ok: rows[0]?.ok === 1, service: "pulse-linkedin-capture" });
    }

    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!TOKEN || request.headers.get("x-extension-token") !== TOKEN) {
      return json({ error: "Unauthorized" }, 401);
    }

    try {
      const body = await request.json() as any;
      const p = body?.person || {};
      const c = body?.company || {};

      const fullName = cleanString(p.full_name, 500);
      const linkedinUrl = cleanString(p.linkedin_url, 2000);
      const companyName = cleanString(c.company_name, 1000) || cleanString(p.current_company, 1000);

      if (!fullName) return json({ error: "full_name é obrigatório" }, 400);
      if (!linkedinUrl || !/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\//i.test(linkedinUrl)) {
        return json({ error: "linkedin_url inválida" }, 400);
      }
      if (!companyName) return json({ error: "company_name é obrigatório" }, 400);

      const personCapturedAt = p.captured_at && !Number.isNaN(Date.parse(p.captured_at))
        ? new Date(p.captured_at).toISOString() : new Date().toISOString();
      const companyCapturedAt = c.captured_at && !Number.isNaN(Date.parse(c.captured_at))
        ? new Date(c.captured_at).toISOString() : new Date().toISOString();

      const person = {
        full_name: fullName,
        linkedin_url: linkedinUrl.replace(/\/$/, ""),
        location: cleanString(p.location, 1000),
        current_title: cleanString(p.current_title, 1000),
        current_company: cleanString(p.current_company, 1000),
        captured_at: personCapturedAt,
      };
      const rawJson = { ...person };

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const personResult = await client.query(
          `INSERT INTO public.linkedin_profile_captures
           (full_name, linkedin_url, location, current_title, current_company, captured_at, raw_json)
           VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::jsonb)
           RETURNING id::text AS id`,
          [person.full_name, person.linkedin_url, person.location, person.current_title,
           person.current_company, person.captured_at, JSON.stringify(rawJson)]
        );
        const personId = personResult.rows[0].id;

        const companyResult = await client.query(
          `INSERT INTO public.linkedin_company_captures
           (person_capture_id, company_name, description, website, employee_count, captured_at)
           VALUES ($1::bigint,$2,$3,$4,$5,$6::timestamptz)
           RETURNING id::text AS id`,
          [personId, companyName, cleanString(c.description, 12000), cleanString(c.website, 2000),
           cleanString(c.employee_count, 500), companyCapturedAt]
        );
        await client.query("COMMIT");
        return json({ ok: true, person_id: personId, company_id: companyResult.rows[0].id }, 201);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(error);
      return json({ error: "Internal server error" }, 500);
    }
  },
};