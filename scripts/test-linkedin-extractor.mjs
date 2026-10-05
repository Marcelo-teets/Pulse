import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const script = fs.readFileSync("extensions/linkedin-capture/content.js", "utf8");
function node(text = "", children = [], attributes = {}) {
  const element = {
    innerText: text, textContent: text, children, attributes,
    getAttribute(key) { return this.attributes[key] || ""; },
    querySelectorAll(selector) {
      return this.children.flatMap(child => [child, ...child.querySelectorAll(selector)])
        .filter(child => selector.split(",").some(s => {
          s = s.trim();
          if (s === "h1" || s === "h2") return child.tag === s;
          if (s === "section" || s === "span" || s === "div") return child.tag === s;
          if (s.startsWith(".text-heading-xlarge")) return child.classes?.includes("text-heading-xlarge");
          if (s.includes("/company/")) return child.tag === "a" && child.href?.includes("/company/");
          if (s.includes("text-body-medium")) return child.classes?.includes("text-body-medium");
          if (s.includes("text-body-small")) return child.classes?.includes("text-body-small");
          return false;
        }));
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    closest(selector) { return selector.includes("section") ? this.section || null : null; }
  };
  for (const child of children) { child.parentElement = element; child.section = element.tag === "section" ? element : element.section; }
  return element;
}
function tagged(tag, text, children = [], attrs = {}, classes = []) {
  const n = node(text, children, attrs); n.tag = tag; n.classes = classes; if (attrs.href) n.href = attrs.href;
  if (tag === "section") for (const child of children) child.section = n;
  return n;
}
function capture({ name, title, place, company, slug, unrelated, omitName = false, modern = false }) {
  const nameNode = tagged("div", name, [], {}, modern ? [] : ["text-heading-xlarge"]);
  const header = tagged("section", "", [
    tagged("h1", "Foto do perfil"),
    ...omitName ? [] : [nameNode],
    tagged("div", title, [], {}, modern ? [] : ["text-body-medium"]),
    tagged("span", place, [], {}, modern ? [] : ["text-body-small"]),
    ...modern ? [tagged("span", "Dados de contato")] : [],
    tagged("a", `Ver empresa: ${company}`, [], {href:`https://www.linkedin.com/company/${slug}/`})
  ]);
  header.innerText = `${name}\n${title}\n${place}\n${modern ? "Dados de contato\n" : ""}${company}`;
  const activity = tagged("section", "Atividades", [tagged("a", unrelated, [], {href:"https://www.linkedin.com/company/unrelated/"})]);
  const main = tagged("main", "", [header, activity]);
  const document = {
    title: `${name} | LinkedIn`,
    querySelector(s) { if(s === "main") return main; if(s === 'link[rel="canonical"]') return {href:"https://www.linkedin.com/in/test/"}; return null; },
    querySelectorAll(s) { return main.querySelectorAll(s); }
  };
  let handler;
  const context = {document, location:{href:"https://www.linkedin.com/in/test/", origin:"https://www.linkedin.com"},
    URL, Date, chrome:{runtime:{onMessage:{addListener(fn){handler=fn;}}}}, window:{}};
  vm.runInNewContext(script, context);
  let response;
  handler({type:"EXTRACT_PROFILE"}, {}, value => response = value);
  return response;
}
const guilherme = capture({name:"Guilherme Rachid",title:"CEO & Founder",place:"São José dos Campos, São Paulo, Brasil",company:"Ayude",slug:"ayude",unrelated:"PIT – Parque de Inovação"});
assert.equal(guilherme.ok, true);
assert.equal(guilherme.profile.full_name, "Guilherme Rachid");
assert.equal(guilherme.profile.current_title, "CEO & Founder");
assert.equal(guilherme.profile.location, "São José dos Campos, São Paulo, Brasil");
assert.equal(guilherme.profile.current_company, "Ayude");
assert.equal(guilherme.profile._company_url, "https://www.linkedin.com/company/ayude");
const edisio = capture({name:"Edísio Pereira Neto",title:"CEO",place:"Brasil",company:"Z.ro Global Payments",slug:"zroglobal",unrelated:"Exame"});
assert.equal(edisio.profile.current_company, "Z.ro Global Payments");
assert.equal(edisio.profile.full_name, "Edísio Pereira Neto");
const missing = capture({name:"",title:"CEO",place:"Brasil",company:"Ayude",slug:"ayude",unrelated:"PIT",omitName:true});
assert.equal(missing.ok, false);
const daniela = capture({name:"Daniela Batista dos Santos",title:"CFO | Board Advisor | Conselheira Consultiva | Investidora Anjo",place:"São Paulo e Região",company:"Pagaleve",slug:"pagaleve",unrelated:"Outra empresa",modern:true});
assert.equal(daniela.ok, true);
assert.equal(daniela.profile.full_name, "Daniela Batista dos Santos");
assert.equal(daniela.profile.current_title, "CFO | Board Advisor | Conselheira Consultiva | Investidora Anjo");
assert.equal(daniela.profile.current_company, "Pagaleve");
assert.equal(daniela.profile.location, "São Paulo e Região");
console.log("Extractor regressions: Guilherme, Edísio, Daniela and missing-name guard OK");
