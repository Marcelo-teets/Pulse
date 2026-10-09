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
  "vercel.json",
  "scripts/build-neon-linkedin-function.mjs",
  "scripts/test-linkedin-api-bundle.mjs",
  "migrations/004_company_linkedin_identity.sql",
  "migrations/005_login_rate_limit.sql"
];
critical.forEach(exists);

const manifest = JSON.parse(read("extensions/linkedin-capture/manifest.json"));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, "0.8.9");
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
assert.ok(content.includes('if (!role.current_company) throw new Error'), "content extractor must fail closed without company name evidence");
assert.ok(content.includes("RESOLVE_COMPANY_LINK"), "href-less company resolver message missing");
assert.ok(content.includes("function resolveCompanyLink"), "href-less company resolver missing");
assert.ok(content.includes("CLICK_COMPANY_AFFILIATION"), "visible company click message missing");
assert.ok(content.includes("function clickCompanyAffiliation"), "visible company click fallback missing");
assert.ok(content.includes("attemptIndex = 0"), "ranked click retry index missing");
assert.ok(content.includes("targets.sort((a, b) => b.score - a.score)"), "click target ranking missing");
assert.ok(content.includes("target_count"), "click target observability missing");

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
  "if(!person.full_name||!person.current_title||!person.current_company)",
  "resolveCompanyLinkFromProfile",
  "CLICK_COMPANY_AFFILIATION",
  "click?.clicked",
  "if(!companyUrl)throw new Error",
  "chrome.scripting.executeScript",
  "companyAboutUrl"
]) assert.ok(bg.includes(marker), `missing background safeguard: ${marker}`);
assert.ok(bg.includes("actualUrl.origin!==expected.origin") && bg.includes("actualPath!==expectedPath"), "exact company page URL identity guard missing");
assert.ok(bg.includes("nome canônico da empresa no LinkedIn"), "canonical company-name reconciliation missing");
assert.ok(bg.includes("safeEndpoint"), "API endpoint allowlist guard missing");
assert.ok(bg.includes('candidate.protocol==="https:"&&candidate.origin===expected.origin'), "API endpoint origin pinning missing");
assert.ok(bg.includes("for(let attemptIndex=0;attemptIndex<6;attemptIndex++)"), "multiple click-target retry loop missing");
assert.ok(bg.includes("attemptIndex},2"), "click retry index is not sent to content script");

const api = read("functions/linkedin/index.ts");
assert.ok(api.includes('const VERSION = "0.7.2"'));
assert.ok(api.includes("normalizeLinkedinUrl"));
assert.ok(api.includes("request_id inválido"));
assert.ok(api.includes("findExisting(requestId)"));
assert.ok(api.includes("ON CONFLICT(linkedin_url) DO UPDATE"));
assert.ok(api.includes("ON CONFLICT(company_key) DO UPDATE"));
assert.ok(api.includes("token_hash=$1"));
assert.ok(api.includes("token_expires_at>NOW()"));
assert.ok(api.includes('current_title é obrigatório'), "server-side current_title validation missing");
assert.ok(api.includes('current_company é obrigatório'), "server-side current_company validation missing");
assert.ok(api.includes("pulse_user_people WHERE user_id=$1::bigint"), "device status counts are not owner scoped");
assert.ok(api.includes("4[0-9a-f]{3}-[89ab]"), "strict UUID v4 validation missing");
assert.ok(api.includes("async function readJsonLimited"), "bounded JSON reader missing");
assert.ok(api.includes("request.body.getReader()"), "request body must be streamed for size enforcement");
assert.ok(api.includes('readJsonLimited(request, 16_384)'), "pairing payload limit missing");
assert.ok(api.includes("readJsonLimited(request)"), "capture payload limit missing");
assert.ok(api.includes("used_by_device_id=$1"), "historical pairing ownership recovery missing");
assert.ok(api.includes('reason: "device_unowned"'), "unowned device fail-closed reason missing");
assert.ok(api.includes("owner_user_id=$2::bigint"), "device ownership self-heal update missing");
assert.ok(api.includes("normalizeLinkedinCompanyUrl"), "stable LinkedIn company URL validation missing");
assert.ok(api.includes('linkedin_url IS NULL'), "legacy company identity reconciliation missing");
assert.ok(api.includes('linkedin:'), "LinkedIn company URL must drive canonical identity");

const schema = read("lib/schema.js");
const dropDevice = schema.indexOf("DROP VIEW IF EXISTS public.linkedin_device_status");
const createDevice = schema.indexOf("CREATE VIEW public.linkedin_device_status");
const dropAudit = schema.indexOf("DROP VIEW IF EXISTS public.linkedin_api_audit_safe");
const createAudit = schema.indexOf("CREATE VIEW public.linkedin_api_audit_safe");
assert.ok(dropDevice >= 0 && createDevice > dropDevice, "device view recreation is not idempotent");
assert.ok(dropAudit >= 0 && createAudit > dropAudit, "audit view recreation is not idempotent");
assert.ok(schema.includes("pg_advisory_xact_lock"), "schema initialization is not serialized across serverless instances");
assert.ok(schema.includes("ROLLBACK"), "schema initialization rollback guard missing");
assert.ok(schema.includes("SCHEMA_VERSION = 6"), "runtime schema version missing");
assert.ok(schema.includes("pulse_schema_meta"), "runtime schema metadata table missing");
assert.ok(schema.includes("Number(current.rows[0]?.version || 0) < SCHEMA_VERSION"), "runtime schema version gate missing");
assert.ok(schema.includes("ux_linkedin_companies_linkedin_url"), "stable company LinkedIn URL unique index missing");

const authLib = read("lib/auth.js");
assert.ok(authLib.includes("DELETE FROM public.pulse_sessions WHERE expires_at <= NOW() OR revoked_at IS NOT NULL"), "stale session cleanup missing");

const loginRoute = read("app/api/auth/login/route.js");
assert.ok(loginRoute.includes("pulse_login_attempts"), "persistent login throttling missing");
assert.ok(loginRoute.includes("status: 429"), "login throttling must return HTTP 429");
assert.ok(loginRoute.includes('"retry-after": "900"'), "login throttle retry hint missing");
assert.ok(loginRoute.includes("failures + 1"), "login failure counter missing");

const signupRoute = read("app/api/auth/signup/route.js");
assert.ok(!signupRoute.includes("masterCount"), "first signup must never auto-promote to master");
assert.ok(signupRoute.includes('PULSE_ALLOW_PUBLIC_SIGNUP === "true"'), "public signup must be explicitly enabled");
assert.ok(signupRoute.includes("isBootstrapMaster"), "safe master bootstrap path missing");
assert.ok(signupRoute.includes("Cadastro público desativado"), "closed-by-default signup guard missing");

const companiesRoute = read("app/api/companies/route.js");
assert.ok(companiesRoute.includes("pulse_user_people"), "company people_count must be scoped to the authenticated user");
assert.ok(companiesRoute.includes("peopleCountSql"), "company people_count scoping expression missing");

const pageShell = read("app/components/PageShell.js");
assert.ok(pageShell.includes('if (!payload.authenticated)'), "expired-session redirect missing from PageShell");
assert.ok(pageShell.includes('window.location.href = "/auth"'), "PageShell login redirect missing");
assert.ok(pageShell.includes('["Operação", "◫", "/operacao", "master"]'), "Operations navigation must be master-only");

const authPage = read("app/auth/page.js");
assert.ok(authPage.includes('fetch("/api/auth/me"'), "auth page must verify the session");
assert.ok(authPage.includes("router.replace"), "verified-session redirect missing");
assert.ok(authPage.includes("signupEnabled"), "signup visibility guard missing");

const usersPage = read("app/usuarios/page.js");
assert.ok(usersPage.includes("response.status === 403"), "user admin page must handle forbidden access");

const operationsPage = read("app/operacao/page.js");
assert.ok(operationsPage.includes("response.status === 403"), "operations page must handle forbidden access");

const worker = read("app/api/internal/sheets-sync/route.js");
for (const marker of [
  "FOR UPDATE SKIP LOCKED",
  "status='processing'",
  "markSynced",
  "markError",
  'Operação!B2:B12',
  "api_failures_24h",
  "LINKEDIN_API_VERSION",
  "NOW() - INTERVAL '15 minutes'",
  'getValues(token, "Pessoas!A2:H")',
  'getValues(token, "Empresas!A2:H")',
  'getValues(token, "Capturas!A2:A")',
  "existingCaptureIds",
  "company_linkedin_url",
  "companyRowByName",
  'const LINKEDIN_API_VERSION = "0.7.2"',
  "metricsUpdated: true"
]) assert.ok(worker.includes(marker), `missing Sheets worker invariant: ${marker}`);
const emptyQueuePos = worker.indexOf("if (!ids.length)");
const metricsPos = worker.indexOf("await updateOperationalMetrics(database, token)", emptyQueuePos);
assert.ok(emptyQueuePos >= 0 && metricsPos > emptyQueuePos, "empty queue must still refresh operational metrics");

const health = read("app/api/health/route.js");
assert.ok((health.match(/status: 503/g) || []).length >= 2, "degraded health checks must return HTTP 503");

const proxy = read("proxy.js");
for (const path of ["/auth","/api/auth/login","/api/auth/signup","/api/health","/api/internal/sheets-sync"]) {
  assert.ok(proxy.includes(`"${path}"`), `public path missing: ${path}`);
}
assert.ok(proxy.includes('request.cookies.has("pulse_session")'));
assert.ok(proxy.includes('const isApi = pathname.startsWith("/api/")'), "API pass-through guard missing");
assert.ok(proxy.includes("if (isApi)"), "API routes must reach their own 401/403 handlers");
assert.ok(!proxy.includes('pathname === "/auth" && hasSession'), "proxy must not redirect /auth based only on stale cookie presence");

const vercel = JSON.parse(read("vercel.json"));
assert.ok(Array.isArray(vercel.crons) && vercel.crons.length === 1);
assert.equal(vercel.crons[0].path, "/api/internal/sheets-sync");
assert.equal(vercel.crons[0].schedule, "0 9 * * *");
assert.equal(vercel.installCommand, "npm ci --no-audit --no-fund");

const neonBuilder = read("scripts/build-neon-linkedin-function.mjs");
assert.ok(neonBuilder.includes("esbuild@0.25.10"), "Neon function bundler must pin esbuild");
assert.ok(neonBuilder.includes("--target=node24"), "Neon function target must be Node 24");
assert.ok(neonBuilder.includes("pulse-linkedin-api-v0.7.2.zip"), "Neon function artifact version mismatch");

const fullQa = read(".github/workflows/full-qa.yml");
assert.ok(fullQa.includes("Bundle Neon LinkedIn Function"), "Full QA must compile Neon Function");
assert.ok(fullQa.includes("Bundled LinkedIn API end-to-end"), "Full QA must execute the bundled LinkedIn API against Postgres");
assert.ok(fullQa.includes("pulse-linkedin-api-v0.7.2"), "Full QA must publish Neon Function artifact");
assert.ok(fullQa.includes("path: dist/linkedin-capture/**"), "extension artifact must expose manifest at archive root");
assert.ok(!fullQa.includes("zip -r pulse-linkedin-capture"), "extension artifact must not be nested in a second ZIP");

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
assert.ok(extensionReadme.includes("v0.8.9"), "extension README version is stale");
const architecture = read("docs/linkedin-capture-architecture.md");
assert.ok(architecture.includes("v0.8.9"), "architecture extension version is stale");
assert.ok(architecture.includes("API v0.7.2"), "architecture API version is stale");

console.log("Pulse full structural QA: OK");
