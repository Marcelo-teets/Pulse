import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => assert.ok(fs.existsSync(p), `missing: ${p}`);

const critical = [
  "extensions/linkedin-capture/manifest.json",
  "extensions/linkedin-capture/background.js",
  "extensions/linkedin-capture/content.js",
  "extensions/linkedin-capture/popup.js",
  "functions/linkedin/index.ts",
  "app/api/health/route.js",
  "app/api/auth/signup/route.js",
  "app/api/people/route.js",
  "app/api/companies/route.js",
  "app/api/dashboard/route.js",
  "app/api/internal/sheets-sync/route.js",
  "lib/schema.js",
  "proxy.js",
  "vercel.json"
];
critical.forEach(exists);

const manifest = JSON.parse(read("extensions/linkedin-capture/manifest.json"));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, "0.8.2");
assert.ok(manifest.permissions.includes("scripting"));
assert.ok(manifest.content_scripts.some((x) => x.matches.some((m) => m.includes("linkedin.com/in/"))));

const content = read("extensions/linkedin-capture/content.js");
for (const marker of [
  "function profileTopCard()",
  "function profileName(top)",
  "function profileLocation(top)",
  "function profileHeadline(top",
  "function topCardCompany(top",
  "function currentRole(headline)",
  "__pulseLinkedinCaptureLoaded === CONTENT_VERSION"
]) assert.ok(content.includes(marker), `missing extractor marker: ${marker}`);
assert.ok(content.includes("Atividades|Activity|Experiência|Experience"), "top-card section guard missing");
assert.ok(content.includes("CEO|CFO|CTO|COO"), "job-title-as-name guard missing");

const bg = read("extensions/linkedin-capture/background.js");
for (const marker of [
  "sendMessageWithRetry",
  "ensureExtractor",
  "captureCompany",
  "completePerson",
  "RETRY_OUTBOX",
  "x-pulse-device-token",
  "if(!person.full_name||!person.current_title||!person.current_company||!companyUrl)"
]) assert.ok(bg.includes(marker), `missing background safeguard: ${marker}`);

const api = read("functions/linkedin/index.ts");
assert.ok(api.includes('const VERSION = "0.7.0"'));
assert.ok(api.includes("normalizeLinkedinUrl"));
assert.ok(api.includes("request_id inválido"));
assert.ok(api.includes("findExisting(requestId)"));
assert.ok(api.includes("ON CONFLICT(linkedin_url) DO UPDATE"));
assert.ok(api.includes("ON CONFLICT(company_key) DO UPDATE"));
assert.ok(api.includes("token_hash=$1"));
assert.ok(api.includes("token_expires_at>NOW()"));

const schema = read("lib/schema.js");
const dropDevice = schema.indexOf("DROP VIEW IF EXISTS public.linkedin_device_status");
const createDevice = schema.indexOf("CREATE VIEW public.linkedin_device_status");
const dropAudit = schema.indexOf("DROP VIEW IF EXISTS public.linkedin_api_audit_safe");
const createAudit = schema.indexOf("CREATE VIEW public.linkedin_api_audit_safe");
assert.ok(dropDevice >= 0 && createDevice > dropDevice, "device view recreation is not idempotent");
assert.ok(dropAudit >= 0 && createAudit > dropAudit, "audit view recreation is not idempotent");

const worker = read("app/api/internal/sheets-sync/route.js");
for (const marker of [
  "FOR UPDATE SKIP LOCKED",
  "status='processing'",
  "markSynced",
  "markError",
  'Operação!B2:B12',
  "api_failures_24h",
  "LINKEDIN_API_VERSION"
]) assert.ok(worker.includes(marker), `missing Sheets worker invariant: ${marker}`);

const proxy = read("proxy.js");
for (const path of ["/auth","/api/auth/login","/api/auth/signup","/api/health","/api/internal/sheets-sync"]) {
  assert.ok(proxy.includes(`"${path}"`), `public path missing: ${path}`);
}
assert.ok(proxy.includes('request.cookies.has("pulse_session")'));

const vercel = JSON.parse(read("vercel.json"));
assert.ok(Array.isArray(vercel.crons) && vercel.crons.length === 1);
assert.equal(vercel.crons[0].path, "/api/internal/sheets-sync");
assert.equal(vercel.crons[0].schedule, "0 9 * * *");

const readme = read("README.md");
assert.ok(readme.includes("1x por dia às 09:00 UTC"), "README cron schedule is stale");

const forbidden = [
  "-----BEGIN PRIVATE KEY-----",
  "sk_live_",
  "AIzaSy"
];
const scanFiles = critical.concat(["README.md",".env.example"]);
for (const file of scanFiles) {
  const data = read(file);
  for (const token of forbidden) assert.ok(!data.includes(token), `possible secret leaked in ${file}: ${token}`);
}

console.log("Pulse full structural QA: OK");
