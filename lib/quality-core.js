// Precision is measured against human-reviewed ground truth; never infer it from completeness.
export const REVIEW_FIELDS = Object.freeze([
  "full_name", "linkedin_url", "location", "current_title", "current_company",
  "company_name", "company_linkedin_url", "description", "website", "employee_count",
]);
export const REQUIRED_FIELDS = Object.freeze(["full_name", "current_title", "current_company", "company_linkedin_url"]);
export const MIN_REAL_PROFILES = 30;
export const MAX_REAL_PROFILES = 50;
export function computeQuality(reviews, uniqueCaptureCount = null) {
  const rows = Array.isArray(reviews) ? reviews : [];
  const captures = new Set();
  const byField = Object.fromEntries(REVIEW_FIELDS.map(field => [field, {correct:0, incorrect:0, unknown:0, reviewed:0, precision:null}]));
  for (const row of rows) {
    if (!REVIEW_FIELDS.includes(row.field_key) || !["correct","incorrect","unknown"].includes(row.verdict)) continue;
    const capture = String(row.capture_id);
    captures.add(capture);
    byField[row.field_key][row.verdict] += 1;
  }
  for (const entry of Object.values(byField)) {
    entry.reviewed = entry.correct + entry.incorrect;
    entry.precision = entry.reviewed ? Number((100*entry.correct/entry.reviewed).toFixed(2)) : null;
  }
  const profiles = uniqueCaptureCount === null ? captures.size : Number(uniqueCaptureCount);
  const enoughSamples = profiles >= MIN_REAL_PROFILES && profiles <= MAX_REAL_PROFILES;
  // A good sample is not necessarily a valid sample: enforce coverage by critical field.
  const coverage = REQUIRED_FIELDS.every(field => byField[field].reviewed >= MIN_REAL_PROFILES);
  const precision = REQUIRED_FIELDS.every(field => byField[field].precision !== null && byField[field].precision >= 98);
  return { profiles_reviewed: profiles, target_min: MIN_REAL_PROFILES, target_max: MAX_REAL_PROFILES,
    fields: byField, homologated: enoughSamples && coverage && precision, enough_samples: enoughSamples, coverage_met: coverage,
    measured: rows.length>0, note: "Métrica exclusivamente de revisão humana; nunca inclui fixtures sintéticos." };
}
export function evidenceFlags(person = {}, company = {}) {
  const present = value => typeof value==="string" && value.trim().length>0;
  const flags = [];
  for (const [key,value] of Object.entries({
    full_name:person.full_name, linkedin_url:person.linkedin_url,
    location:person.location, current_title:person.current_title,
    current_company:person.current_company, company_name:company.company_name,
    company_linkedin_url:company.linkedin_url, description:company.description,
    website:company.website, employee_count:company.employee_count
  })) if (!present(value)) flags.push("missing:"+key);
  const norm = s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
  if (present(person.current_company) && present(company.company_name) && norm(person.current_company)!==norm(company.company_name)) flags.push("company_identity_conflict");
  // Evidence score is only a completeness/consistency indicator; NOT factual precision.
  const completeness = REVIEW_FIELDS.length - flags.filter(f=>f.startsWith("missing:")).length;
  return {evidence_score:Math.max(0,Math.round(100*completeness/REVIEW_FIELDS.length)-(flags.includes("company_identity_conflict")?30:0)),flags};
}
