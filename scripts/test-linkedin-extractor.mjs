import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const script = fs.readFileSync("extensions/linkedin-capture/content.js", "utf8");
function node(text = "", children = [], attributes = {}) {
  const element = {
    innerText: text, textContent: text, children, attributes, tagName: "", clicked: false,
    click() { this.clicked = true; },
    scrollIntoView() {},
    getAttribute(key) { return this.attributes[key] || ""; },
    querySelectorAll(selector) {
      return this.children.flatMap(child => [child, ...child.querySelectorAll(selector)])
        .filter(child => selector.split(",").some(s => {
          s = s.trim();
          if (s === "h1" || s === "h2" || s === "h3") return child.tag === s;
          if (s === "section" || s === "span" || s === "div" || s === "button" || s === "a" || s === "dt" || s === "p") return child.tag === s;
          if (s === "a[href]" || s === 'a[href^="http"]') return child.tag === "a" && !!child.href;
          if (s === '[role="button"]' || s === "[role='button']") return child.attributes?.role === "button";
          if (s.startsWith(".text-heading-xlarge")) return child.classes?.includes("text-heading-xlarge");
          if (s.includes("/company/")) return child.tag === "a" && child.href?.includes("/company/");
          if (s.includes("text-body-medium")) return child.classes?.includes("text-body-medium");
          if (s.includes("text-body-small")) return child.classes?.includes("text-body-small");
          return false;
        }));
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    closest(selector) { if (selector.includes("section")) return this.tag === "section" ? this : this.section || null; if (selector.includes("li")) return this.tag === "li" ? this : null; return null; }
  };
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    child.parentElement = element;
    child.section = element.tag === "section" ? element : element.section;
    child.nextElementSibling = children[i + 1] || null;
  }
  return element;
}
function tagged(tag, text, children = [], attrs = {}, classes = []) {
  const n = node(text, children, attrs); n.tag = tag; n.tagName = tag.toUpperCase(); n.classes = classes; if (attrs.href) n.href = attrs.href;
  if (tag === "section") for (const child of children) child.section = n;
  return n;
}
function capture({ name, title, place, company, slug, unrelated, omitName = false, omitCompany = false, modern = false, includeContact = modern, pageTitle = null, prependNoise = false, companyAsButton = false, school = "", includeExperience = false, messageType = "EXTRACT_PROFILE", expectedCompany = "", attemptIndex = 0 }) {
  const nameNode = tagged("div", name, [], {}, modern ? [] : ["text-heading-xlarge"]);
  const header = tagged("section", "", [
    tagged("h1", "Foto do perfil"),
    ...omitName ? [] : [nameNode],
    tagged("div", title, [], {}, modern ? [] : ["text-body-medium"]),
    tagged("span", place, [], {}, modern ? [] : ["text-body-small"]),
    ...includeContact ? [tagged("span", "Dados de contato")] : [],
    ...omitCompany ? [] : [companyAsButton
      ? tagged("button", company, [], {role:"button"})
      : tagged("a", `Ver empresa: ${company}`, [], {href:`https://www.linkedin.com/company/${slug}/`})],
    ...school ? [tagged("button", school, [], {role:"button"})] : []
  ]);
  header.innerText = `${name}\n${title}\n${place}\n${includeContact ? "Dados de contato\n" : ""}${omitCompany ? "" : company}`;
  const activity = tagged("section", "Atividades", [tagged("a", unrelated, [], {href:"https://www.linkedin.com/company/unrelated/"})]);
  const experience = tagged("section", "Experiência", [
    tagged("h2", "Experiência"),
    tagged("li", `${title}\n${company}\njan de 2020 - Presente`, [
      tagged("a", company, [], {href:`https://www.linkedin.com/company/${slug}/`})
    ])
  ]);
  const noise = tagged("section", "Experimente o Premium por 30 dias", [tagged("div", "Tenha acesso a recursos exclusivos")]);
  const main = tagged("main", "", [...prependNoise ? [noise] : [], header, activity, ...includeExperience ? [experience] : []]);
  const document = {
    title: pageTitle === null ? `${name} | LinkedIn` : pageTitle,
    querySelector(s) { if(s === "main") return main; if(s === 'link[rel="canonical"]') return {href:"https://www.linkedin.com/in/test/"}; return null; },
    querySelectorAll(s) { return main.querySelectorAll(s); }
  };
  let handler;
  const context = {document, location:{href:"https://www.linkedin.com/in/test/", origin:"https://www.linkedin.com"},
    URL, Date, chrome:{runtime:{onMessage:{addListener(fn){handler=fn;}}}}, window:{}};
  vm.runInNewContext(script, context);
  let response;
  const message = messageType === "RESOLVE_COMPANY_LINK"
    ? {type:messageType, expectedCompany, headline:title}
    : messageType === "CLICK_COMPANY_AFFILIATION"
      ? {type:messageType, expectedCompany, attemptIndex}
      : {type:messageType};
  handler(message, {}, value => response = value);
  return response;
}

function captureCompanyPage() {
  const descriptionText = "VitalCura acredita que viver bem é encontrar o equilíbrio entre corpo, mente e natureza. Somos uma empresa brasileira dedicada a promover saúde e vitalidade.";
  const siteLink = tagged("a", "vitalcura.com.br", [], {href:"https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fvitalcura.com.br%2F"});
  const overview = tagged("section", "", [
    tagged("h2", "Visão geral"),
    tagged("div", descriptionText),
    tagged("h3", "Site"),
    siteLink,
  ]);
  overview.innerText = `Visão geral\n${descriptionText}\nSite\nvitalcura.com.br`;

  const header = tagged("section", "", [
    tagged("h1", "VitalCura"),
    tagged("div", "Serviços de alimentação e bebidas · São Paulo, SP · 216 seguidores · 0-1 funcionários"),
  ]);
  header.innerText = "VitalCura\nMais Vitalidade, mais Saúde, mais Você\nServiços de alimentação e bebidas · São Paulo, SP · 216 seguidores · 0-1 funcionários";

  const sidebar = tagged("section", "páginas que as pessoas também viram", [
    tagged("a", "The Provantech Technologies", [], {href:"https://www.linkedin.com/company/unrelated/"})
  ]);
  const main = tagged("main", "", [header, overview, sidebar]);
  main.innerText = header.innerText + "\n" + overview.innerText + "\n" + sidebar.innerText;

  const document = {
    title: "VitalCura | LinkedIn",
    body: main,
    querySelector(selector) {
      if (selector === "main") return main;
      if (selector === 'link[rel="canonical"]') return {href:"https://www.linkedin.com/company/vitalcura/about/"};
      return main.querySelector(selector);
    },
    querySelectorAll(selector) { return main.querySelectorAll(selector); }
  };

  let handler;
  const context = {
    document,
    location:{href:"https://www.linkedin.com/company/vitalcura/about/", origin:"https://www.linkedin.com"},
    URL, Date,
    chrome:{runtime:{onMessage:{addListener(fn){handler=fn;}}}},
    window:{}
  };
  vm.runInNewContext(script, context);
  let response;
  handler({type:"EXTRACT_COMPANY"}, {}, value => response = value);
  return response;
}

const vitalCuraCompany = captureCompanyPage();
assert.equal(vitalCuraCompany.ok, true);
assert.equal(vitalCuraCompany.company.company_name, "VitalCura");
assert.match(vitalCuraCompany.company.description, /equilíbrio entre corpo, mente e natureza/);
assert.equal(vitalCuraCompany.company.website, "https://vitalcura.com.br/");
assert.equal(vitalCuraCompany.company.employee_count, "0-1 funcionários");

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

const danielaNoTitle = capture({name:"Daniela Batista dos Santos",title:"CFO | Board Advisor | Conselheira Consultiva | Investidora Anjo",place:"São Paulo e Região",company:"Pagaleve",slug:"pagaleve",unrelated:"Outra empresa",modern:true,pageTitle:"LinkedIn"});
assert.equal(danielaNoTitle.ok, true);
assert.equal(danielaNoTitle.profile.full_name, "Daniela Batista dos Santos");
assert.equal(danielaNoTitle.profile.current_company, "Pagaleve");
assert.equal(danielaNoTitle.profile.location, "São Paulo e Região");

const titleWithRole = capture({name:"Daniela Batista dos Santos",title:"CFO | Board Advisor | Conselheira Consultiva | Investidora Anjo",place:"São Paulo e Região",company:"Pagaleve",slug:"pagaleve",unrelated:"Outra empresa",pageTitle:"Daniela Batista dos Santos - CFO | LinkedIn"});
assert.equal(titleWithRole.ok, true);
assert.equal(titleWithRole.profile.full_name, "Daniela Batista dos Santos");
assert.equal(titleWithRole.profile.current_company, "Pagaleve");

const noisyDaniela = capture({name:"Daniela Batista dos Santos",title:"CFO | Board Advisor | Conselheira Consultiva | Investidora Anjo",place:"São Paulo e Região",company:"Pagaleve",slug:"pagaleve",unrelated:"Outra empresa",modern:true,pageTitle:"LinkedIn",prependNoise:true});
assert.equal(noisyDaniela.ok, true);
assert.equal(noisyDaniela.profile.full_name, "Daniela Batista dos Santos");
assert.equal(noisyDaniela.profile.current_company, "Pagaleve");

const missingHeadline = capture({name:"Daniela Batista dos Santos",title:"",place:"São Paulo e Região",company:"Pagaleve",slug:"pagaleve",unrelated:"Outra empresa",modern:true,pageTitle:"LinkedIn"});
assert.equal(missingHeadline.ok, false);

const missingNameGenericTitle = capture({name:"",title:"Finance Executive",place:"São Paulo e Região",company:"Pagaleve",slug:"pagaleve",unrelated:"Outra empresa",modern:true,pageTitle:"LinkedIn",omitName:true});
assert.equal(missingNameGenericTitle.ok, false);

const missingLocation = capture({name:"Daniela Batista dos Santos",title:"CFO",place:"",company:"Pagaleve",slug:"pagaleve",unrelated:"Outra empresa",modern:true,pageTitle:"LinkedIn"});
assert.equal(missingLocation.ok, true);
assert.equal(missingLocation.profile.location, "");
assert.equal(missingLocation.profile.current_title, "CFO");

const missingCompanyEvidence = capture({name:"Daniela Batista dos Santos",title:"CFO",place:"São Paulo e Região",company:"Pagaleve",slug:"pagaleve",unrelated:"Outra empresa",modern:true,pageTitle:"LinkedIn",omitCompany:true});
assert.equal(missingCompanyEvidence.ok, false);

const weakSingleSignal = capture({name:"Daniela Batista dos Santos",title:"CFO",place:"São Paulo e Região",company:"Pagaleve",slug:"pagaleve",unrelated:"Outra empresa",modern:true,includeContact:false,pageTitle:"LinkedIn"});
assert.equal(weakSingleSignal.ok, false);

const danielHrefLess = capture({name:"Daniel Brandão",title:"Founder | CEO | Banker | Board Member | CFO | Cyclist",place:"Brasil",company:"VitalCura",slug:"vitalcura",unrelated:"Outra empresa",modern:true,companyAsButton:true,school:"Universidade de São Paulo",includeExperience:true});
assert.equal(danielHrefLess.ok, true);
assert.equal(danielHrefLess.profile.full_name, "Daniel Brandão");
assert.equal(danielHrefLess.profile.current_company, "VitalCura");
assert.equal(danielHrefLess.profile._company_url, "");

const danielResolved = capture({name:"Daniel Brandão",title:"Founder | CEO | Banker | Board Member | CFO | Cyclist",place:"Brasil",company:"VitalCura",slug:"vitalcura",unrelated:"Outra empresa",modern:true,companyAsButton:true,school:"Universidade de São Paulo",includeExperience:true,messageType:"RESOLVE_COMPANY_LINK",expectedCompany:"VitalCura"});
assert.equal(danielResolved.ok, true);
assert.equal(danielResolved.role.current_company, "VitalCura");
assert.equal(danielResolved.role.company_url, "https://www.linkedin.com/company/vitalcura");

const danielClicked = capture({name:"Daniel Brandão",title:"Founder | CEO | Banker | Board Member | CFO | Cyclist",place:"Brasil",company:"VitalCura",slug:"vitalcura",unrelated:"Outra empresa",modern:true,companyAsButton:true,school:"Universidade de São Paulo",includeExperience:false,messageType:"CLICK_COMPANY_AFFILIATION",expectedCompany:"VitalCura"});
assert.equal(danielClicked.ok, true);
assert.equal(danielClicked.clicked, true);
assert.equal(danielClicked.reason, "clicked_visible_affiliation");
assert.equal(danielClicked.attempt_index, 0);
assert.ok(danielClicked.target_count >= 1);

console.log("Extractor regressions: VitalCura company About page, legacy, classless, title-less, noisy top-card, ranked href-less-current-company resolution, missing-name/title/company, generic-title and missing-location guards OK");
