// Read-only, server-side check of the *actual* Google Sheets credentials and destination.
// Never return a token, private key, raw provider error or spreadsheet data to callers.
import { createSign } from "node:crypto";

const REQUIRED_TABS = ["Capturas", "Pessoas", "Empresas", "Operação"];
const CACHE_MS = 5 * 60 * 1000;
let cached = null;
let inFlight = null;

export function classifySheetsFailure(status, payload = {}) {
  const error = payload?.error || {};
  const message = String(error.message || error.error_description || "").toLowerCase();
  const reasons = Array.isArray(error.details)
    ? error.details.flatMap(detail => Array.isArray(detail?.metadata?.violations)
        ? detail.metadata.violations.map(v => String(v.type || "")) : [String(detail?.reason || "")])
    : [];
  if (status === 403 && (/has not been used|is disabled|api has not been used|service_disabled/.test(message)
     || reasons.some(reason => /SERVICE_DISABLED|API_DISABLED/i.test(reason)))) return "api_disabled";
  if (status === 401 || status === 400) return "auth_failed";
  if (status === 403) return "permission_denied";
  if (status === 404) return "sheet_not_found";
  if (status === 429) return "rate_limited";
  return "unreachable";
}

function result(state, extras = {}) {
  return { state, checked_at: new Date().toISOString(), ...extras };
}

async function probe(fetcher, env) {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GOOGLE_PRIVATE_KEY;
  const sheetId = env.GOOGLE_SHEET_ID;
  if (!email || !privateKey || !sheetId) return result("not_configured");

  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = encode({ alg: "RS256", typ: "JWT" }) + "." + encode({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 600,
  });
  let assertion;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(input); signer.end();
    assertion = input + "." + signer.sign(privateKey.replace(/\\n/g, "\n")).toString("base64url");
  } catch { return result("auth_failed"); }
  try {
    const tokenResponse = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const oauth = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !oauth.access_token)
      return result(tokenResponse.status === 429 ? "rate_limited" : "auth_failed");

    const metadataResponse = await fetcher(
      "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(sheetId) + "?fields=sheets(properties(title))",
      {
        headers: { authorization: "Bearer " + oauth.access_token },
        signal: AbortSignal.timeout(8000),
      }
    );
    const payload = await metadataResponse.json().catch(() => ({}));
    if (!metadataResponse.ok) return result(classifySheetsFailure(metadataResponse.status, payload));
    const tabs = new Set((payload.sheets || []).map(s => s?.properties?.title).filter(Boolean));
    const missing_tabs = REQUIRED_TABS.filter(tab => !tabs.has(tab));
    return missing_tabs.length ? result("missing_tabs", { missing_tabs }) : result("ready");
  } catch { return result("unreachable"); }
}

export async function inspectSheetsConnection({ fetcher = fetch, env = process.env, force = false } = {}) {
  // Caching applies only to default production calls; injected test inputs are never shared.
  const cacheable = fetcher === fetch && env === process.env && !force;
  if (cacheable && cached && Date.now() - cached.time < CACHE_MS) return cached.data;
  if (cacheable && inFlight) return inFlight;
  const task = probe(fetcher, env).catch(() => result("unreachable"));
  if (cacheable) inFlight = task;
  try {
    const data = await task;
    if (cacheable) cached = { data, time: Date.now() };
    return data;
  } finally {
    if (cacheable) inFlight = null;
  }
}
