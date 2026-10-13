import assert from "node:assert/strict";
import { assessCapture, canonicalLinkedInUrl, companySignals, safeCsv } from "../lib/pulse-intelligence.js";

const complete = {
  full_name: "Daniela Batista", linkedin_url: "https://br.linkedin.com/in/daniela?trk=test",
  location: "São Paulo", current_title: "CFO", current_company: "Pagaleve",
};
const company = { company_name: "Pagaleve", linkedin_url: "https://www.linkedin.com/company/pagaleve/",
  website: "https://pagaleve.com.br", employee_count: "51-200", description: "Plataforma de crédito" };
const good = assessCapture(complete, company, { identity_confidence: 100, field_sources: { person: "linkedin_profile_page" } });
assert.equal(good.state, "ready");
assert.equal(good.completeness, 100);
assert.equal(good.provenance.person, "linkedin_profile_page");
assert.equal(canonicalLinkedInUrl(company.linkedin_url, "company"), "https://www.linkedin.com/company/pagaleve");
assert.equal(canonicalLinkedInUrl("https://evil.example/company/pagaleve", "company"), "");
assert.equal(canonicalLinkedInUrl("http://linkedin.com/in/person"), "");

const wrong = assessCapture(complete, { ...company, company_name: "Universidade Federal" }, {});
assert.equal(wrong.state, "blocked");
assert.match(wrong.issues.join(" "), /Divergência/);
assert.equal(assessCapture(complete, { ...company, linkedin_url: "" }).state, "review");
assert.equal(assessCapture(complete, company, { identity_confidence: 60 }).state, "review");
assert.equal(companySignals(company).note.includes("não comprova"), true);
const csv = safeCsv([{ name: "=IMPORTXML(A1)", company: "Pagaleve" }], [{ key: "name", label: "Nome" }, { key: "company", label: "Empresa" }]);
assert.ok(csv.includes("'=IMPORTXML(A1)"));
assert.ok(!csv.includes(';"=IMPORTXML(A1)"'));
const roles = ["CFO", "CEO", "Head of Credit", "Analista de Risco"];
for (let i = 0; i < 40; i++) {
  const person = { ...complete, current_title: roles[i % roles.length], location: i % 4 ? "São Paulo" : "" };
  const current = { ...company, company_name: i % 5 ? "Pagaleve" : "Empregador diferente" };
  const assessed = assessCapture(person, current, { identity_confidence: 100 });
  assert.equal(assessed.state, i % 5 === 0 ? "blocked" : "ready");
  assert.ok(assessed.completeness >= 90);
}
console.log("Pulse quality and signal regressions: OK (40 synthetic fixtures + edge cases)");
