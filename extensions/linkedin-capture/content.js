(() => {
  if (window.__pulseLinkedinCaptureLoaded) return;
  window.__pulseLinkedinCaptureLoaded = true;

  const norm = (v) => String(v || "").replace(/\s+/g, " ").trim();
  const txt = (el) => norm(el?.innerText || el?.textContent);
  const attr = (el, name) => norm(el?.getAttribute?.(name));
  const one = (selectors, root = document) => {
    for (const s of selectors) { const el = root.querySelector(s); if (txt(el)) return txt(el); }
    return "";
  };
  const oneAttr = (selectors, name, root = document) => {
    for (const s of selectors) { const el = root.querySelector(s); const value = attr(el, name); if (value) return value; }
    return "";
  };
  const canonical = () => {
    try {
      const u = new URL(document.querySelector('link[rel="canonical"]')?.href || location.href);
      u.search = ""; u.hash = ""; return u.toString().replace(/\/$/, "");
    } catch { return location.href; }
  };
  const companyUrl = (href) => {
    try { const u = new URL(href, location.origin); const m = u.pathname.match(/^\/company\/[^/?#]+/i); return m ? `${u.origin}${m[0]}` : ""; } catch { return ""; }
  };
  const lines = (el) => [...new Set(String(el?.innerText || el?.textContent || "").split("\n").map(norm).filter(Boolean))];
  const cleanCompany = (v) => norm(v).replace(/^(?:ver empresa|view company)\s*:\s*/i, "").replace(/\s*(?:\|\s*)?LinkedIn\s*$/i, "").replace(/\s+logo$/i, "");
  const cleanName = (v) => norm(v).replace(/\s*[·•]\s*\d+(?:º|st|nd|rd|th)?\s*$/i, "").replace(/\s+(?:visualizar perfil|view profile).*$/i, "");
  const cleanTitle = (v) => norm(v).replace(/\s+at\s+.+$/i, "").replace(/\s+(?:na|no|em)\s+.+$/i, "");
  const isNoise = (v) => /^(contato|contact info|conectar|connect|seguir|follow|enviar mensagem|message|mais|more|verificado|verified|grau|degree|seguidores|followers|conexões|connections)$/i.test(norm(v));
  const section = (names) => {
    const labels = names.map((n) => n.toLowerCase());
    for (const h of document.querySelectorAll("h1,h2,h3")) {
      const t = txt(h).toLowerCase();
      if (labels.some((x) => t === x || t.startsWith(x))) return h.closest("section") || h.parentElement?.closest("section") || h.parentElement;
    }
    return null;
  };

  const validName = (v) => /\p{L}/u.test(v) && !/^(?:foto do perfil|profile photo|linkedin|perfil|profile|atividades|activity)$/i.test(v) && !/^(?:ver empresa|view company)/i.test(v);
  const pageName = () => {
    const title = attr(document.querySelector('meta[property="og:title"],meta[name="title"]'), "content") || document.title;
    if (!/(?:\||[-–])\s+LinkedIn/i.test(title)) return "";
    const name = cleanName(title.replace(/\s+(?:\||[-–])\s+LinkedIn.*$/i, ""));
    return validName(name) ? name : "";
  };
  function profileTopCard() {
    const main = document.querySelector("main");
    if (!main) throw new Error("O cabeçalho do perfil não carregou. Aguarde o LinkedIn e tente novamente.");
    const expected = pageName();
    if (!expected) throw new Error("O LinkedIn ainda não informou o nome do perfil no título da página. Aguarde carregar e tente novamente.");
    const name = [...main.querySelectorAll(".text-heading-xlarge, h1, [data-anonymize='person-name'],span,div")]
      .find(el => {
        const value = cleanName(txt(el));
        return el.children?.length === 0 && validName(value) && (!expected || value === expected) && !el.closest("nav,aside");
      });
    const sections = [...main.querySelectorAll("section")];
    const isProfileCard = el => {
      const content = txt(el);
      return (!expected || content.includes(expected)) &&
        !/(?:^|\n)(?:Atividades|Activity|Experiência|Experience)(?:\n|$)/i.test(el.innerText || "") &&
        content.length < 1800 && (expected ? content.includes(expected) : !!name);
    };
    // Modern LinkedIn renders the name as plain nested text without its old CSS class.
    const bounded = sections.find(isProfileCard);
    // Never widen this scope to main: main also contains Activity and unrelated company links.
    let card = bounded || name?.closest("section,[data-view-name='profile-card']");
    if (!card && name) {
      card = name;
      while (card.parentElement && card.parentElement !== main && card.parentElement.parentElement !== main) card = card.parentElement;
    }
    if (!card || !isProfileCard(card)) throw new Error("Não foi possível isolar o cabeçalho do perfil. Aguarde a página carregar.");
    return card;
  }

  function topCardLines(top) {
    return lines(top).filter((x) => !isNoise(x));
  }

  function profileName(top) {
    const direct = cleanName(one([
      ".text-heading-xlarge",
      ".pv-text-details__left-panel h1",
      "h1",
      '[data-anonymize="person-name"]'
    ], top));
    if (validName(direct) && (!pageName() || direct === pageName())) return direct;
    const expected = pageName();
    if (expected && txt(top).includes(expected)) return expected;
    const imageAlt = cleanName(oneAttr([
      'img[alt*="Foto do perfil"]',
      'img[alt*="profile photo"]'
    ], "alt", top).replace(/^(?:Foto do perfil de|Profile photo of)\s+/i, ""));
    if (validName(imageAlt)) return imageAlt;
    const aria = cleanName(oneAttr([
      '[aria-label*="perfil"]',
      '[aria-label*="profile"]'
    ], "aria-label", top).replace(/^(?:Visualizar perfil de|View profile of|Perfil de|Profile of)\s+/i, ""));
    if (validName(aria)) return aria;
    return "";
  }

  function profileLocation(top) {
    const candidates = [
      ".text-body-small.inline.t-black--light.break-words",
      "span.text-body-small.inline",
      ".pv-text-details__left-panel span.text-body-small",
      '[data-view-name="profile-card"] .text-body-small',
      '.pv-text-details__left-panel span[aria-hidden="true"]'
    ];
    for (const s of candidates) {
      for (const el of top.querySelectorAll(s)) {
        const value = txt(el);
        if (value && !/(contato|contact info|seguidores|followers|conexões|connections|degree|grau)/i.test(value)) return value.replace(/\s*[·•]\s*(?:Dados de contato|Contact info).*$/i, "");
      }
    }
    const body = topCardLines(top).join(" · ");
    const m = body.match(/([A-ZÀ-Ú][^·\n]{2,80},\s*[A-ZÀ-Ú][^·\n]{2,80},\s*(?:Brasil|Brazil|Portugal|United States|USA))/i);
    if (m) return norm(m[1]);
    const all = topCardLines(top);
    const contact = all.findIndex(x => /(?:Dados de contato|Contact info)/i.test(x));
    if (contact > 0) {
      const value = all[contact - 1].replace(/\s*[·•]\s*(?:Dados de contato|Contact info).*$/i, "");
      if (value.length < 100 && !/(seguidores|followers|conexões|connections)/i.test(value)) return value;
    }
    return "";
  }

  function profileHeadline(top, fullName, location) {
    const candidates = [
      ".text-body-medium.break-words",
      "div.text-body-medium",
      ".pv-text-details__left-panel div.text-body-medium"
    ];
    for (const s of candidates) {
      for (const el of top.querySelectorAll(s)) {
        const value = txt(el);
        if (value && value !== fullName && value !== location && !isNoise(value)) return value;
      }
    }
    const rows = topCardLines(top);
    const index = rows.findIndex(x => cleanName(x) === fullName || x.startsWith(`${fullName} ·`));
    if (index >= 0) {
      const next = rows[index + 1];
      if (next && next !== location && next.length < 240 && !/(?:Dados de contato|Contact info|followers|seguidores)/i.test(next)) return next;
    }
    return "";
  }

  function topCardCompany(top, headline) {
    const links = [...top.querySelectorAll('a[href*="/company/"]')];
    for (const link of links) {
      const company = cleanCompany((txt(link) || attr(link, "aria-label") || attr(link.querySelector("img"), "alt")).split(" · ")[0]);
      const url = companyUrl(link.href);
      if (company && url && !/^ver empresa$/i.test(company)) return { current_title: headline, current_company: company, company_url: url };
    }
    const patterns = [/^(.+?)\s+(?:at|@)\s+(.+)$/i, /^(.+?)\s+(?:na|no|em)\s+(.+)$/i];
    for (const p of patterns) {
      const m = headline.match(p);
      if (m) return { current_title: norm(m[1]), current_company: cleanCompany(m[2]), company_url: "" };
    }
    return null;
  }

  function currentRole(headline) {
    const exp = document.querySelector("main #experience")?.closest("section") || section(["Experiência", "Experience"]);
    if (exp) {
      const companyLinks = [...exp.querySelectorAll('a[href*="/company/"]')];
      for (const link of companyLinks) {
        const card = link.closest("li") || link.parentElement?.closest("li") || link.parentElement;
        if (!card) continue;
        const cardLines = lines(card).slice(0, 16);
        const body = cardLines.join(" ");
        const isCurrent = /(?:^|\s)(?:presente|present|o momento|atual)(?:\s|$)/i.test(body);
        if (!isCurrent) continue;
        const company = cleanCompany((txt(link) || attr(link, "aria-label") || attr(link.querySelector("img"), "alt")).split(" · ")[0]);
        const likelyTitle = cleanTitle(cardLines.find((x) => x !== company && !/(presente|present|\b20\d{2}\b|tempo integral|full[- ]?time|localidade|location|meses|anos|yrs|mos)/i.test(x)) || "");
        if (company && companyUrl(link.href)) return { current_title: likelyTitle || headline, current_company: company, company_url: companyUrl(link.href) };
      }
    }
    const patterns = [/^(.+?)\s+(?:at|@)\s+(.+)$/i, /^(.+?)\s+(?:na|no|em)\s+(.+)$/i];
    for (const p of patterns) {
      const m = headline.match(p); if (m) return { current_title: norm(m[1]), current_company: cleanCompany(m[2]), company_url: "" };
    }
    return { current_title: headline, current_company: "", company_url: "" };
  }

  function extractProfile() {
    const top = profileTopCard();
    const full_name = profileName(top);
    const location = profileLocation(top);
    const headline = profileHeadline(top, full_name, location);
    const role = topCardCompany(top, headline) || currentRole(headline);
    const captured_at = new Date().toISOString();
    const base = { full_name, linkedin_url: canonical(), location, current_title: role.current_title, current_company: role.current_company, captured_at };
    return { ...base, raw_json: { ...base }, _company_url: role.company_url };
  }

  function jsonLdOrganization() {
    for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(el.textContent || "null");
        const candidates = Array.isArray(data) ? data : data?.['@graph'] || [data];
        for (const x of candidates) {
          if (x && /Organization|Corporation/i.test(String(x['@type'] || ""))) return x;
        }
      } catch {}
    }
    return null;
  }

  function labelValue(labels) {
    const wanted = labels.map((x) => x.toLowerCase());
    for (const el of document.querySelectorAll("dt,h3,span,div")) {
      if (!wanted.includes(txt(el).toLowerCase())) continue;
      const parent = el.parentElement;
      const sibling = el.nextElementSibling;
      if (txt(sibling)) return { value: txt(sibling), root: parent };
      const rest = lines(parent).filter((x) => !wanted.includes(x.toLowerCase()));
      if (rest[0]) return { value: rest[0], root: parent };
    }
    return { value: "", root: null };
  }

  function website(ld) {
    if (ld?.url && !/linkedin\.com/i.test(ld.url)) return String(ld.url);
    const lab = labelValue(["Website", "Site"]);
    const link = lab.root?.querySelector('a[href^="http"]');
    if (link?.href && !/linkedin\.com/i.test(link.href)) return link.href;
    for (const a of document.querySelectorAll('a[href^="http"]')) {
      if (!/linkedin\.com/i.test(a.href) && /(website|site|visitar|visit)/i.test(txt(a))) return a.href;
    }
    return /^https?:\/\//i.test(lab.value) ? lab.value : "";
  }

  function employeeCount() {
    const lab = labelValue(["Company size", "Tamanho da empresa"]);
    if (lab.value) return lab.value;
    const body = txt(document.body);
    for (const re of [
      /([\d.,]+\s*[–-]\s*[\d.,]+\s+(?:employees|funcionários))/i,
      /([\d.,]+\+\s+(?:employees|funcionários))/i,
      /([\d.,]+\s+(?:associated members|funcionários associados))/i
    ]) { const m = body.match(re); if (m) return norm(m[1]); }
    return "";
  }

  function description(ld) {
    if (norm(ld?.description).length >= 40) return norm(ld.description);
    const about = section(["Sobre", "About", "Visão geral", "Overview"]);
    if (about) {
      const vals = [...about.querySelectorAll("p,div.break-words,span.break-words")].map(txt).filter((v) => v.length >= 40);
      if (vals[0]) return vals[0];
    }
    return [...document.querySelectorAll("main p,main div.break-words")].map(txt).find((v) => v.length >= 80 && !/(followers|seguidores|employees|funcionários)/i.test(v)) || "";
  }

  function extractCompany() {
    const ld = jsonLdOrganization();
    return {
      company_name: norm(ld?.name) || one(["h1","main h1",".org-top-card-summary__title"]),
      description: description(ld),
      website: website(ld),
      employee_count: employeeCount(),
      captured_at: new Date().toISOString()
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (message?.type === "EXTRACT_PROFILE") sendResponse({ ok: true, profile: extractProfile() });
      else if (message?.type === "EXTRACT_COMPANY") sendResponse({ ok: true, company: extractCompany() });
      else return false;
    } catch (e) { sendResponse({ ok: false, error: e?.message || "Falha ao extrair dados." }); }
    return true;
  });
})();
