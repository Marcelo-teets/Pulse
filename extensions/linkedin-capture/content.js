(() => {
  const CONTENT_VERSION = chrome.runtime?.getManifest?.().version || "dev";
  if (window.__pulseLinkedinCaptureLoaded === CONTENT_VERSION) return;
  window.__pulseLinkedinCaptureLoaded = CONTENT_VERSION;

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
  const looksLikeLocation = (v) => {
    const value = norm(v);
    if (!value || value.length > 120) return false;
    if (/[|@]/.test(value)) return false;
    if (/(?:CEO|CFO|CTO|COO|Chief|Founder|Co-Founder|Director|Diretor|Diretora|Manager|Gerente|Head|Board|Advisor|Conselheir|Investidor|Investidora|President|Presidente|Partner|Sócio|Sócia)/i.test(value)) return false;
    return /,|\b(?:Brasil|Brazil|Portugal|United States|USA|Região|Region|Area|Área|Metropolitana|Metropolitan|Greater|State|Estado|Distrito Federal|DF)\b/i.test(value);
  };
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
  const looksLikePersonName = (v) => {
    const value = cleanName(v);
    const words = value.split(/\s+/).filter(Boolean);
    if (!validName(value) || words.length < 2 || words.length > 8) return false;
    if (/[|@,:;]|\d/.test(value) || looksLikeLocation(value)) return false;
    if (/(?:CEO|CFO|CTO|COO|Chief|Founder|Co-Founder|Director|Diretor|Diretora|Manager|Gerente|Head|Board|Advisor|Conselheir|Investidor|Investidora|President|Presidente|Partner|Sócio|Sócia|Executive|Executiv|Finance|Financial|Marketing|Sales|Operations|Technology|Engineer|Engenheir|Consultant|Consultor|Analyst|Analista|Specialist|Especialista|Vice President|\bVP\b)/i.test(value)) return false;
    return words.every((word) => /^(?:[\p{L}][\p{L}'’.-]*|da|de|do|das|dos|e)$/u.test(word));
  };

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
    const sections = [...main.querySelectorAll("section")];
    const score = (el, index) => {
      const content = txt(el);
      if (!content || content.length > 2600) return -100;
      const rows = lines(el);
      const startsAsOtherSection = /^(?:Sobre|About|Atividades|Activity|Experiência|Experience|Formação acadêmica|Education|Licenças|Licenses)\b/i.test(rows[0] || "");
      if (startsAsOtherSection) return -100;

      let points = Math.max(0, 2 - Math.min(index, 2));
      let evidence = 0;
      const directName = one([".text-heading-xlarge", ".pv-text-details__left-panel h1", "h1", "[data-anonymize='person-name']"], el);
      if (directName && validName(cleanName(directName))) { points += 6; evidence += 1; }
      if (expected && content.includes(expected)) { points += 8; evidence += 1; }
      if (el.querySelector('img[alt*="Foto do perfil"],img[alt*="profile photo"]')) { points += 3; evidence += 1; }
      if (/(?:Dados de contato|Contact info|conexões|connections)/i.test(content)) { points += 3; evidence += 1; }
      if (el.querySelector('a[href*="/company/"]')) { points += 2; evidence += 1; }
      return evidence >= 2 ? points : -100;
    };

    let best = null;
    let bestScore = -100;
    sections.forEach((el, index) => {
      const value = score(el, index);
      if (value > bestScore) { best = el; bestScore = value; }
    });
    if (best && bestScore >= 4) return best;

    const nameNode = [...main.querySelectorAll(".text-heading-xlarge, h1, [data-anonymize='person-name'],span,div")]
      .find(el => {
        const value = cleanName(txt(el));
        return el.children?.length === 0 && validName(value) && (!expected || value === expected) && !el.closest("nav,aside");
      });
    const bounded = nameNode?.closest("section,[data-view-name='profile-card']");
    if (bounded) {
      const boundedText = txt(bounded);
      const boundedEvidence = [
        !!expected && cleanName(txt(nameNode)) === expected,
        !!bounded.querySelector('a[href*="/company/"]'),
        !!bounded.querySelector('img[alt*="Foto do perfil"],img[alt*="profile photo"]'),
        /(?:Dados de contato|Contact info|conexões|connections)/i.test(boundedText),
      ].filter(Boolean).length;
      if (boundedEvidence >= 2) return bounded;
    }

    throw new Error("Não foi possível isolar o cabeçalho do perfil com evidência suficiente. Aguarde a página carregar.");
  }

  function topCardLines(top) {
    return lines(top).filter((x) => !isNoise(x));
  }

  function profileName(top) {
    const expected = pageName();
    const directCandidates = [
      ".text-heading-xlarge",
      ".pv-text-details__left-panel h1",
      "h1",
      '[data-anonymize="person-name"]'
    ];
    for (const selector of directCandidates) {
      for (const el of top.querySelectorAll(selector)) {
        const value = cleanName(txt(el));
        if (looksLikePersonName(value) && (!expected || value === expected || expected.includes(value) || value.includes(expected))) return value;
      }
    }
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

    const firstRow = cleanName(topCardLines(top)[0] || "");
    if (looksLikePersonName(firstRow)) return firstRow;

    const leafCandidates = [...top.querySelectorAll("h1,span,div")]
      .filter(el => !el.children?.length)
      .map(el => cleanName(txt(el)))
      .filter(looksLikePersonName)
      .filter(value => !/(?:Dados de contato|Contact info|University|Universidade|conexões|connections)/i.test(value));
    return leafCandidates[0] || "";
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
        const cleaned = value.replace(/\s*[·•]\s*(?:Dados de contato|Contact info).*$/i, "");
        if (cleaned && looksLikeLocation(cleaned) && !/(contato|contact info|seguidores|followers|conexões|connections|degree|grau)/i.test(cleaned)) return cleaned;
      }
    }
    const body = topCardLines(top).join(" · ");
    const m = body.match(/([A-ZÀ-Ú][^·\n]{2,80},\s*[A-ZÀ-Ú][^·\n]{2,80},\s*(?:Brasil|Brazil|Portugal|United States|USA))/i);
    if (m) return norm(m[1]);
    const all = topCardLines(top);
    const contactLine = all.find(x => /(?:Dados de contato|Contact info)/i.test(x));
    if (contactLine) {
      const inline = contactLine.replace(/\s*[·•]?\s*(?:Dados de contato|Contact info).*$/i, "").trim();
      if (inline && looksLikeLocation(inline) && !/(seguidores|followers|conexões|connections)/i.test(inline)) return inline;
      const contact = all.indexOf(contactLine);
      if (contact > 0) {
        const previous = all[contact - 1];
        if (looksLikeLocation(previous) && !/(seguidores|followers|conexões|connections)/i.test(previous)) return previous;
      }
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
        if (value && value !== fullName && value !== location && !looksLikeLocation(value) && !isNoise(value)) return value;
      }
    }
    const rows = topCardLines(top);
    const index = rows.findIndex(x => cleanName(x) === fullName || x.startsWith(`${fullName} ·`));
    if (index >= 0) {
      const next = rows[index + 1];
      if (next && next !== location && !looksLikeLocation(next) && next.length < 240 && !/(?:Dados de contato|Contact info|followers|seguidores)/i.test(next)) return next;
    }
    return "";
  }

  const companyKey = (v) => cleanCompany(v).toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const likelyAffiliationName = (v) => {
    const value = cleanCompany(v);
    if (!value || value.length < 2 || value.length > 120) return "";
    if (/^(?:seguir|follow|conectar|connect|enviar mensagem|message|mais|more|dados de contato|contact info)$/i.test(value)) return "";
    if (/\b(?:seguidores|followers|conexões|connections)\b/i.test(value)) return "";
    return value;
  };
  function topCardCompany(top, headline) {
    const links = [...top.querySelectorAll('a[href*="/company/"]')];
    for (const link of links) {
      const company = cleanCompany((txt(link) || attr(link, "aria-label") || attr(link.querySelector("img"), "alt")).split(" · ")[0]);
      const url = companyUrl(link.href);
      if (company && url && !/^ver empresa$/i.test(company)) return { current_title: headline, current_company: company, company_url: url };
    }

    // LinkedIn's 2026 top card can render the current employer as a button/chip
    // without an href. Preserve the visible employer name and resolve its URL
    // from Experience in a background profile tab before saving.
    for (const el of top.querySelectorAll('a,button,[role="button"]')) {
      const href = attr(el, "href");
      if (/\/school\//i.test(href)) continue;
      const raw = txt(el) || attr(el, "aria-label") || attr(el.querySelector?.("img"), "alt");
      const company = likelyAffiliationName(raw);
      if (!company) continue;
      if (companyKey(company) === companyKey(headline)) continue;
      if (/^(?:foto do perfil|profile photo)/i.test(company)) continue;
      const url = companyUrl(href);
      return { current_title: headline, current_company: company, company_url: url };
    }

    const patterns = [/^(.+?)\s+(?:at|@)\s+(.+)$/i, /^(.+?)\s+(?:na|no|em)\s+(.+)$/i];
    for (const p of patterns) {
      const m = headline.match(p);
      if (m) return { current_title: norm(m[1]), current_company: cleanCompany(m[2]), company_url: "" };
    }
    return null;
  }

  function resolveCompanyLink(expectedCompany, headline = "") {
    const expectedKey = companyKey(expectedCompany);
    if (!expectedKey) return { current_title: headline, current_company: expectedCompany || "", company_url: "" };

    const expRole = currentRole(headline);
    if (expRole?.company_url && companyKey(expRole.current_company) === expectedKey) return expRole;

    for (const link of document.querySelectorAll('main a[href*="/company/"],a[href*="/company/"]')) {
      const raw = txt(link) || attr(link, "aria-label") || attr(link.querySelector?.("img"), "alt");
      const company = cleanCompany(String(raw || "").split(" · ")[0]);
      if (companyKey(company) === expectedKey) {
        return { current_title: expRole?.current_title || headline, current_company: company || expectedCompany, company_url: companyUrl(link.href) };
      }
    }
    return { current_title: expRole?.current_title || headline, current_company: expectedCompany, company_url: "" };
  }

  function clickCompanyAffiliation(expectedCompany, attemptIndex = 0) {
    const expectedKey = companyKey(expectedCompany);
    if (!expectedKey) return { clicked: false, reason: "empty_company" };
    const top = profileTopCard();

    const starts = [...top.querySelectorAll("a,button,[role='button'],span,div")]
      .filter((el) => {
        const value = likelyAffiliationName(txt(el) || attr(el, "aria-label"));
        return value && companyKey(value) === expectedKey;
      });

    const targets = [];
    const seen = new Set();
    for (const start of starts) {
      let el = start;
      for (let depth = 0; el && depth < 7; depth += 1, el = el.parentElement) {
        if (seen.has(el)) continue;
        seen.add(el);
        const href = attr(el, "href");
        const direct = companyUrl(href);
        if (direct) return { clicked: false, company_url: direct, reason: "direct_href" };

        const tag = String(el.tagName || "").toUpperCase();
        const role = attr(el, "role").toLowerCase();
        const tabindex = attr(el, "tabindex");
        const interactive =
          tag === "A" ||
          tag === "BUTTON" ||
          role === "button" ||
          role === "link" ||
          tabindex === "0" ||
          /(?:button|link|top-card|experience)/i.test(attr(el, "data-view-name") + " " + attr(el, "class"));
        if (!interactive && depth < 1) continue;

        const score =
          (tag === "A" ? 100 : 0) +
          (tag === "BUTTON" ? 90 : 0) +
          (role === "link" ? 80 : 0) +
          (role === "button" ? 70 : 0) +
          (tabindex === "0" ? 50 : 0) +
          Math.max(0, 20 - depth * 3);
        targets.push({ el, score });
      }
    }

    targets.sort((a, b) => b.score - a.score);
    const target = targets[Math.max(0, Number(attemptIndex) || 0)];
    if (!target) return { clicked: false, company_url: "", reason: "company_affiliation_not_clickable" };

    try {
      target.el.scrollIntoView?.({ block: "center", inline: "nearest" });
      target.el.click?.();
      return {
        clicked: true,
        company_url: "",
        reason: "clicked_visible_affiliation",
        attempt_index: Math.max(0, Number(attemptIndex) || 0),
        target_count: targets.length
      };
    } catch {
      return { clicked: false, company_url: "", reason: "company_affiliation_click_failed" };
    }
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
    if (!full_name) throw new Error("Não encontrei o nome no cabeçalho do perfil. Aguarde a página carregar.");
    if (!headline) throw new Error("Não encontrei o cargo/headline no cabeçalho do perfil. Aguarde a página carregar.");
    if (!role.current_company) throw new Error("Não encontrei a empresa atual no perfil.");
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

  function companyScope() {
    return section(["Sobre", "About", "Visão geral", "Overview"]) || document.querySelector("main") || document.body;
  }

  function labelValue(labels, root = document) {
    const wanted = labels.map((x) => x.toLowerCase());
    for (const el of root.querySelectorAll("dt,h3,span,div")) {
      if (!wanted.includes(txt(el).toLowerCase())) continue;
      const parent = el.parentElement;
      const sibling = el.nextElementSibling;
      if (txt(sibling)) return { value: txt(sibling), root: parent };
      const rest = lines(parent).filter((x) => !wanted.includes(x.toLowerCase()));
      if (rest[0]) return { value: rest[0], root: parent };
    }
    return { value: "", root: null };
  }

  function website(ld, root) {
    if (ld?.url && !/linkedin\.com/i.test(ld.url)) return String(ld.url);
    const lab = labelValue(["Website", "Site"], root);
    const link = lab.root?.querySelector('a[href^="http"]');
    if (link?.href && !/linkedin\.com/i.test(link.href)) return link.href;
    for (const a of root.querySelectorAll('a[href^="http"]')) {
      if (!/linkedin\.com/i.test(a.href) && /(website|site|visitar|visit)/i.test(txt(a))) return a.href;
    }
    return /^https?:\/\//i.test(lab.value) ? lab.value : "";
  }

  function employeeCount(root) {
    const lab = labelValue(["Company size", "Tamanho da empresa"], root);
    if (lab.value) return lab.value;
    const body = txt(root);
    for (const re of [
      /([\d.,]+\s*[–-]\s*[\d.,]+\s+(?:employees|funcionários))/i,
      /([\d.,]+\+\s+(?:employees|funcionários))/i,
      /([\d.,]+\s+(?:associated members|funcionários associados))/i
    ]) { const m = body.match(re); if (m) return norm(m[1]); }
    return "";
  }

  function description(ld, root) {
    const vals = [...root.querySelectorAll("p,div.break-words,span.break-words")]
      .map(txt)
      .filter((v) => v.length >= 40 && !/(followers|seguidores|employees|funcionários)/i.test(v));
    if (vals[0]) return vals[0];
    if (norm(ld?.description).length >= 40) return norm(ld.description);
    return "";
  }

  function extractCompany() {
    const root = companyScope();
    const visibleName = cleanCompany(one(["main h1",".org-top-card-summary__title","h1"]));
    const ld = jsonLdOrganization();
    const ldName = cleanCompany(norm(ld?.name));
    const trustedLd = !visibleName || !ldName || visibleName.toLocaleLowerCase() === ldName.toLocaleLowerCase() ? ld : null;
    const company_name = visibleName || ldName;
    if (!company_name) throw new Error("Não encontrei o nome da empresa na página.");
    return {
      company_name,
      description: description(trustedLd, root),
      website: website(trustedLd, root),
      employee_count: employeeCount(root),
      captured_at: new Date().toISOString()
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (message?.type === "EXTRACT_PROFILE") sendResponse({ ok: true, profile: extractProfile() });
      else if (message?.type === "RESOLVE_COMPANY_LINK") sendResponse({ ok: true, role: resolveCompanyLink(message.expectedCompany, message.headline) });
      else if (message?.type === "CLICK_COMPANY_AFFILIATION") sendResponse({ ok: true, ...clickCompanyAffiliation(message.expectedCompany, message.attemptIndex) });
      else if (message?.type === "EXTRACT_COMPANY") sendResponse({ ok: true, company: extractCompany() });
      else return false;
    } catch (e) { sendResponse({ ok: false, error: e?.message || "Falha ao extrair dados." }); }
    return true;
  });
})();
