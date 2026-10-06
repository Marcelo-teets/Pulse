import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL missing");
process.env.DATABASE_URL = databaseUrl;

const db = new Pool({ connectionString: databaseUrl, max: 4 });
const sha = (value) => createHash("sha256").update(value).digest("hex");

try {
  const email = "api-smoke@example.com";
  await db.query("DELETE FROM public.pulse_users WHERE email=$1", [email]);
  const user = await db.query(
    "INSERT INTO public.pulse_users(email,full_name,password_hash,role) VALUES($1,'API Smoke','x','user') RETURNING id",
    [email]
  );
  const userId = user.rows[0].id;

  const pairingCode = "PULSE-API-SMOKE-089";
  await db.query(
    "INSERT INTO public.linkedin_pairing_codes(code_hash,label,expires_at,owner_user_id) VALUES($1,'API Smoke',NOW()+INTERVAL '20 minutes',$2)",
    [sha(pairingCode), userId]
  );

  const mod = await import("../dist/neon-linkedin/index.mjs");
  const handler = mod.default;

  const health = await handler.fetch(new Request("https://qa.example/health"));
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.version, "0.7.2");

  const outdatedPair = await handler.fetch(new Request("https://qa.example/pair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pairing_code: pairingCode, device_name: "QA", extension_version: "0.8.8" }),
  }));
  assert.equal(outdatedPair.status, 426);

  const pair = await handler.fetch(new Request("https://qa.example/pair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pairing_code: pairingCode, device_name: "QA", extension_version: "0.8.9" }),
  }));
  assert.equal(pair.status, 201);
  const pairBody = await pair.json();
  assert.ok(pairBody.device_token);

  const authHeaders = {
    "x-pulse-device-token": pairBody.device_token,
    "x-pulse-extension-version": "0.8.9",
  };

  const status = await handler.fetch(new Request("https://qa.example/status", { headers: authHeaders }));
  assert.equal(status.status, 200);
  const statusBody = await status.json();
  assert.equal(statusBody.version, "0.7.2");
  assert.equal(statusBody.person_captures, 0);

  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const payload = {
    request_id: requestId,
    person: {
      full_name: "Pessoa API QA",
      linkedin_url: "https://www.linkedin.com/in/pessoa-api-qa",
      location: "São Paulo, Brasil",
      current_title: "CFO",
      current_company: "Empresa API QA",
      captured_at: new Date().toISOString(),
    },
    company: {
      company_name: "Empresa API QA",
      linkedin_url: "https://www.linkedin.com/company/empresa-api-qa",
      description: "Empresa de teste controlado para validar o bundle da API Pulse.",
      website: "https://example.com",
      employee_count: "11-50",
      captured_at: new Date().toISOString(),
    },
    meta: { extension_version: "0.8.9", quality_score: 100, missing_fields: [] },
  };

  const capture = await handler.fetch(new Request("https://qa.example/capture", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
  assert.equal(capture.status, 201);

  const duplicate = await handler.fetch(new Request("https://qa.example/capture", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);

  const mismatch = structuredClone(payload);
  mismatch.request_id = "123e4567-e89b-42d3-a456-426614174001";
  mismatch.company.company_name = "Empresa Errada";
  const mismatchResp = await handler.fetch(new Request("https://qa.example/capture", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify(mismatch),
  }));
  assert.equal(mismatchResp.status, 400);

  const outdatedStatus = await handler.fetch(new Request("https://qa.example/status", {
    headers: {
      "x-pulse-device-token": pairBody.device_token,
      "x-pulse-extension-version": "0.8.8",
    },
  }));
  assert.equal(outdatedStatus.status, 426);

  const persisted = await db.query(
    `SELECT c.linkedin_url,c.company_name,p.owner_user_id,
            EXISTS(SELECT 1 FROM public.pulse_user_people up WHERE up.user_id=$1 AND up.person_id=p.id) AS owns_person,
            EXISTS(SELECT 1 FROM public.pulse_user_companies uc WHERE uc.user_id=$1 AND uc.company_id=c.id) AS owns_company
       FROM public.linkedin_people p
       JOIN public.linkedin_current_roles r ON r.person_id=p.id
       JOIN public.linkedin_companies c ON c.id=r.company_id
      WHERE p.linkedin_url='https://www.linkedin.com/in/pessoa-api-qa'`,
    [userId]
  );
  assert.equal(persisted.rowCount, 1);
  assert.equal(persisted.rows[0].linkedin_url, "https://www.linkedin.com/company/empresa-api-qa");
  assert.equal(String(persisted.rows[0].owner_user_id), String(userId));
  assert.equal(persisted.rows[0].owns_person, true);
  assert.equal(persisted.rows[0].owns_company, true);

  const queue = await db.query(
    "SELECT status,count(*)::int AS n FROM public.linkedin_sheet_sync_queue q JOIN public.linkedin_profile_captures p ON p.id=q.person_capture_id WHERE p.owner_user_id=$1 GROUP BY status",
    [userId]
  );
  assert.equal(queue.rows.reduce((n, row) => n + row.n, 0), 1);

  console.log("Bundled LinkedIn API E2E: OK");
} finally {
  await db.end();
}
