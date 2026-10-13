import { canonicalCompanyUrl, canonicalPersonUrl } from "./linkedin-identity.js";

// Pure, side-effect-free company matching for the Google Sheets operational mirror.
// A company with a different canonical LinkedIn URL must never overwrite an existing row.
export function companyNameKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function companyLinkedinKey(value) {
  const canonical = canonicalCompanyUrl(value);
  return canonical ? `linkedin:${decodeURIComponent(new URL(canonical).pathname.split("/")[2])}` : "";
}

function websiteHost(value) {
  try {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Rows are Google Sheets columns: C=company name, E=website, H=LinkedIn URL.
// Returns the real 1-based spreadsheet row or null (append a new row).
export function findCompanySheetRow(rows, { company_name, company_website, company_linkedin_url }) {
  const name = companyNameKey(company_name);
  const linked = companyLinkedinKey(company_linkedin_url);
  const host = websiteHost(company_website);
  if (!name) return null;

  const existing = rows.map((row, index) => ({
    rowNumber: index + 2,
    name: companyNameKey(row?.[2]),
    host: websiteHost(row?.[4]),
    linked: companyLinkedinKey(row?.[7]),
  }));

  if (linked) {
    const matches = existing.filter((row) => row.linked === linked);
    if (matches.length > 1) throw new Error("LinkedIn duplicado em Empresas: corrija a planilha antes de sincronizar.");
    if (matches.length === 1) return matches[0].rowNumber;

    // Backfill *one* legacy row only. A different known LinkedIn identity is never replaced.
    const legacy = existing.filter((row) => row.name === name && !row.linked);
    const names = existing.filter((row) => row.name === name);
    if (legacy.length !== 1 || names.length !== 1) return null;
    if (host && legacy[0].host && host !== legacy[0].host) return null;
    return legacy[0].rowNumber;
  }

  // Without a canonical URL, name-only matching is unsafe. Require a shared
  // website domain and a single legacy unlinked identity.
  if (!host) return null;
  const matches = existing.filter((row) => !row.linked && row.name === name && row.host === host);
  return matches.length === 1 ? matches[0].rowNumber : null;
}

/** Returns a map from canonical person identity to the actual 1-based sheet row. */
export function indexPeopleSheetRows(rows) {
  const indexed = new Map();
  for (let i = 0; i < rows.length; i++) {
    const raw = String(rows[i]?.[2] || "").trim();
    if (!raw) continue;
    const key = canonicalPersonUrl(raw);
    if (!key) throw new Error("LinkedIn inválido na aba Pessoas, linha " + (i + 2));
    if (indexed.has(key)) throw new Error("LinkedIn duplicado em Pessoas: " + key + ". Corrija a planilha antes de sincronizar.");
    indexed.set(key, i + 2);
  }
  return indexed;
}

/** Do not predict append destinations: use Google's returned updatedRange. */
export function appendedSheetRow(response, expectedTab) {
  const range = String(response?.updates?.updatedRange || "");
  const split = range.split("!");
  const tab = split[0]?.replace(/^'/, "").replace(/'$/, "").replace(/''/g, "'");
  const match = split.length === 2 && split[1].match(/^\\$?[A-Z]+\\$?(\\d+)(?::\\$?[A-Z]+\\$?\\d+)?$/i);
  const row = match && Number(match[1]);
  if (tab !== expectedTab || !Number.isSafeInteger(row) || row < 2)
    throw new Error("Google Sheets não confirmou a linha inserida na aba " + expectedTab);
  return row;
}
