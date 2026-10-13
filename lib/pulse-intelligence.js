// Deterministic quality and prospecting signals. Completeness is NOT factual accuracy.
export function normalizeName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
}

export function canonicalLinkedInUrl(value, kind = "person") {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !/(^|\.)linkedin\.com$/i.test(url.hostname)) return "";
    const type = kind === "company" ? "company" : "in";
    const match = url.pathname.match(new RegExp("^/" + type + "/([^/?#]+)/?$", "i"));
    if (!match || !match[1]) return "";
    return "https://www.linkedin.com/" + type + "/" + match[1].toLowerCase();
  } catch {
    return "";
  }
}

const FIELDS = [
  ["full_name", "Nome", 12], ["linkedin_url", "LinkedIn da pessoa", 12],
  ["location", "Localização", 7], ["current_title", "Cargo", 12],
  ["current_company", "Empresa atual", 12], ["company_name", "Nome da empresa", 12],
  ["company_linkedin_url", "LinkedIn da empresa", 15],
  ["website", "Site", 9], ["employee_count", "Funcionários", 9],
];

export function assessCapture(person = {}, company = {}, meta = {}, review = {}) {
  const data = { ...person, ...company, company_linkedin_url: company.linkedin_url };
  const present = FIELDS.filter(([field]) => String(data[field] || "").trim());
  const completeness = Math.round(present.reduce((sum, field) => sum + field[2], 0));
  const missing = FIELDS.filter(([key]) => !String(data[key] || "").trim()).map(([, label]) => label);
  const issues = [];
  if (!person.full_name || !person.current_title || !person.current_company) issues.push("Identidade profissional incompleta");
  if (!canonicalLinkedInUrl(person.linkedin_url)) issues.push("URL da pessoa não verificável");
  if (!canonicalLinkedInUrl(company.linkedin_url, "company")) issues.push("Empresa sem URL canônica comprovada");
  if (person.current_company && company.company_name &&
      normalizeName(person.current_company) !== normalizeName(company.company_name)) {
    issues.push("Divergência entre empresa do perfil e página da empresa");
  }
  if (meta.company_identity_overridden) issues.push("Identidade da empresa alterada manualmente");
  const identityConfidence = Number(meta.identity_confidence);
  if (meta.identity_confidence != null && Number.isFinite(identityConfidence) && identityConfidence < 95) {
    issues.push("Identidade da empresa exige revisão");
  }
  const critical = issues.some((issue) => /Divergência|URL da pessoa|Identidade profissional/.test(issue));
  const state = critical ? "blocked" : issues.length ? "review" : "ready";
  return {
    completeness, missing, issues, state,
    identity_confidence: meta.identity_confidence == null ? null : Number(meta.identity_confidence),
    provenance: meta.field_sources && typeof meta.field_sources === "object" ? meta.field_sources : {},
    review_status: review.status || "pending",
  };
}

// A screening aid only. No inference of creditworthiness, revenue or R$ volume.
export function companySignals(company = {}) {
  const text = normalizeName([company.company_name, company.description].filter(Boolean).join(" "));
  const indicators = [
    [/recebive|antecipac|securitiz|f idc|fidc/, "Recebíveis / estruturação", 40],
    [/credito|financiament|emprestim|consignad|lending/, "Produto de crédito", 25],
    [/pagament|cobranc|erp|saas|fintech/, "Ecossistema financeiro / software", 15],
  ];
  const signals = indicators.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  const base = indicators.filter(([pattern]) => pattern.test(text)).reduce((sum, entry) => sum + entry[2], 0);
  const site = /^https?:\/\//i.test(company.website || "") ? 10 : 0;
  const size = String(company.employee_count || "").trim() ? 10 : 0;
  const score = Math.min(100, base + site + size);
  return {
    score, signals,
    label: score >= 65 ? "Sinais fortes" : score >= 35 ? "Sinais moderados" : "Pouca evidência",
    note: "Triagem heurística; não comprova elegibilidade, volume de recebíveis ou capacidade de funding.",
  };
}

export function safeCsv(rows, columns) {
  const quote = (value) => {
    let text = String(value == null ? "" : value).replace(/\0/g, "");
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return "\uFEFF" + [columns.map((col) => quote(col.label)).join(";"),
    ...rows.map((row) => columns.map((col) => quote(row[col.key])).join(";"))].join("\r\n");
}
