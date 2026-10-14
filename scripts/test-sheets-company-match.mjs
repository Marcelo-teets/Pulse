import assert from "node:assert/strict";
import { companyLinkedinKey, findCompanySheetRow, indexPeopleSheetRows, appendedSheetRow } from "../lib/sheets-company-match.js";

const company = (name, website, linkedinUrl = "") => ["1", "2", name, "", website, "", "", linkedinUrl];
const input = (name, website, linkedinUrl = "") => ({
  company_name: name,
  company_website: website,
  company_linkedin_url: linkedinUrl,
});

assert.equal(companyLinkedinKey("https://br.linkedin.com/company/VitalCura/about/?x=1"), "linkedin:vitalcura");
assert.equal(companyLinkedinKey("https://www.linkedin.com/company/vitalcura"), "linkedin:vitalcura");
assert.equal(companyLinkedinKey("https://example.com/company/vitalcura"), "");

const two = [
  company("Acme", "https://acme-a.com", "https://www.linkedin.com/company/acme-a"),
  company("Acme", "https://acme-b.com", "https://www.linkedin.com/company/acme-b"),
];
assert.equal(findCompanySheetRow(two, input("Acme", "https://acme-b.com", "https://br.linkedin.com/company/acme-b/about")), 3);
assert.equal(findCompanySheetRow(two, input("Acme", "https://new-acme.com", "https://www.linkedin.com/company/acme-c")), null);
assert.equal(findCompanySheetRow(two, input("Acme", "https://acme-a.com")), null);

const legacy = [company("VitalCura", "https://vitalcura.com")];
assert.equal(findCompanySheetRow(legacy, input("VitalCura", "https://vitalcura.com", "https://www.linkedin.com/company/vitalcura")), 2);
assert.equal(findCompanySheetRow(legacy, input("VitalCura", "https://other-company.com", "https://www.linkedin.com/company/other")), null);
assert.equal(findCompanySheetRow(legacy, input("VitalCura", "", "")), null);

const ambiguousLegacy = [company("Acme", "https://acme-a.com"), company("Acme", "https://acme-b.com")];
assert.equal(findCompanySheetRow(ambiguousLegacy, input("Acme", "https://acme-a.com", "https://www.linkedin.com/company/acme")), null);

assert.throws(
  () => findCompanySheetRow([company("A", "", "https://www.linkedin.com/company/a"), company("A", "", "https://br.linkedin.com/company/a")], input("A", "", "https://www.linkedin.com/company/a")),
  /LinkedIn duplicado/,
);
console.log("Sheets canonical-company matching regressions: OK");

const people=[
  ["1","Ana Silva","https://br.linkedin.com/in/ANA-Silva/?trk=foo"],
  ["2","Bruno Souza","https://www.linkedin.com/in/bruno-souza/"]
];
const indexed=indexPeopleSheetRows(people);
assert.equal(indexed.get("https://www.linkedin.com/in/ana-silva"),2);
assert.equal(indexed.get("https://www.linkedin.com/in/bruno-souza"),3);
assert.throws(()=>indexPeopleSheetRows([...people,["3","Outra Ana","https://www.linkedin.com/in/ana-silva"]]),/LinkedIn duplicado em Pessoas/);
assert.throws(()=>indexPeopleSheetRows([["1","Evil","https://linkedin.com.evil.example/in/ana"]]),/LinkedIn inválido/);
assert.equal(appendedSheetRow({updates:{updatedRange:"'Pessoas'!A12:H12"}},"Pessoas"),12);
assert.equal(appendedSheetRow({updates:{updatedRange:"Empresas!A4:H4"}},"Empresas"),4);
assert.throws(()=>appendedSheetRow({updates:{updatedRange:"Empresas!A4:H4"}},"Pessoas"),/não confirmou/);
assert.throws(()=>appendedSheetRow({updates:{updatedRange:"Pessoas!A1:H1"}},"Pessoas"),/não confirmou/);
assert.throws(()=>appendedSheetRow({},"Empresas"),/não confirmou/);
console.log("Sheets person identity and real append row regressions: OK");
