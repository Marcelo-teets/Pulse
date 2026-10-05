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
assert.equal(manifest.version, "0.8.3");
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
assert.ok(content.includes('if (!full_name) throw new Error'), "content extractor must fail closed without a name");
assert.ok(content.includes('if (!headline) throw new Error'), "content extractor must fail closed without a headline");
assert.ok(content.includes('if (!role.current_company || !role.company_url)'), "content extractor must fail closed without company evidence");

const bg = read("extensions/linkedin-capture/background.js");
assert.ok(!bg.includes("nameFromTitle"), "unsafe tab-title name fallback must not exist");
for (const marker of [
  "sendMessageWithRetry",
  "ensureExtractor",
  "captureCompany",
  "completePerson",
  "clearDeviceAuth",
  "RETRY_OUTBOX",
  "x-pulse-device-token",
  "if(!person.full_name||!person.current_title||!person.current_company||!companyUrl)",
  "chrome.scripting.executeScript",
  "companyAboutUrl"
]) assert.ok(bg.includes(marker), `missing background safeguard: ${marker}`);
assert.ok(bg.includes("actual.url?.startsWith"), "company page URL identity guard missing");
assert.ok(bg.includes("nome canônico da empresa no LinkedIn"), "canonical company-name reconciliation missing");

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
assert.ok(schema.includes("pg_advisory_xact_lock"), "schema initialization is not serialized across serverless instances");
assert.ok(schema.includes("ROLLBACK"), "schema initialization rollback guard missing");

const companiesRoute = read("app/api/companies/route.js");
assert.ok(companiesRoute.includes("pulse_user_people"), "company people_count must be scoped to the authenticated user");
assert.ok(companiesRoute.includes("peopleCountSql"), "company people_count scoping expression missing");

const pageShell = read("app/components/PageShell.js");
assert.ok(pageShell.includes('if (!payload.authenticated)'), "expired-session redirect missing from PageShell");
assert.ok(pageShell.includes('window.location.href = "/auth"'), "PageShell login redirect missing");

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
const scanFiles = critical.concat(["README.md",".env.example","extensions/linkedin-capture/README.md","docs/linkedin-capture-architecture.md"]);
for (const file of scanFiles) {
  const data = read(file);
  for (const token of forbidden) assert.ok(!data.includes(token), `possible secret leaked in ${file}: ${token}`);
}

const extensionReadme = read("extensions/linkedin-capture/README.md");
assert.ok(extensionReadme.includes("v0.8.3"), "extension README version is stale");
const architecture = read("docs/linkedin-capture-architecture.md");
assert.ok(architecture.includes("v0.8.3"), "architecture extension version is stale");
assert.ok(architecture.includes("API v0.7.0"), "architecture API version is stale");

console.log("Pulse full structural QA: OK");
