(() => {
  if (window.__pulseLinkedinCaptureLoaded) return;
  window.__pulseLinkedinCaptureLoaded = true;

  const norm = (v) => String(v || "").replace(/\s+/g, " ").trim();
  const txt = (el) => norm(el?.innerText || el?.textContent);
  const one = (selectors, root = document) => {
    for (const s of selectors) { const el = root.querySelector(s); if (txt(el)) return txt(el); }
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
  const lines = (el) => [...new Set(String(el?.innerText || "").split("\n").map(norm).filter(Boolean))];
  const section = (names) => {
    const labels = names.map((n) => n.toLowerCase());
    for (const h of document.querySelectorAll("h1,h2,h3")) {
      const t = txt(h).toLowerCase();
      if (labels.some((x) => t === x || t.startsWith(x))) return h.closest("section") || h.parentElement?.closest("section") || h.parentElement;
    }
    return null;
  };

  function currentRole(headline) {
    const exp = section(["Experiência", "Experience"]);
    if (exp) {
      const companyLinks = [...exp.querySelectorAll('a[href*="/company/"]')];
      for (const link of companyLinks) {
        const card = link.closest("li") || link.parentElement?.closest("li") || link.parentElement;
        if (!card) continue;
        const cardLines = lines(card).slice(0, 16);
        const body = cardLines.join(" ");
        const isCurrent = /(presente|present|o momento|atual)/i.test(body);
        if (!isCurrent && companyLinks.indexOf(link) > 0) continue;
        const company = txt(link).split(" · ")[0];
        const likelyTitle = cardLines.find((x) => x !== company && !/(presente|present|\b20\d{2}\b|tempo integral|full[- ]?time|localidade|location)/i.test(x)) || "";
        if (company) return { current_title: likelyTitle, current_company: company, company_url: companyUrl(link.href) };
      }
    }
    const patterns = [/^(.+?)\s+(?:at|@)\s+(.+)$/i, /^(.+?)\s+(?:na|no|em)\s+(.+)$/i];
    for (const p of patterns) {
      const m = headline.match(p); if (m) return { current_title: norm(m[1]), current_company: norm(m[2]), company_url: "" };
    }
    const link = document.querySelector('main a[href*="/company/"]');
    return { current_title: headline, current_company: txt(link), company_url: companyUrl(link?.href) };
  }

  function extractProfile() {
    const main = document.querySelector("main") || document;
    const full_name = one(["h1"], main) || one(["h1"]);
    const location = one([
      ".text-body-small.inline.t-black--light.break-words",
      "span.text-body-small.inline",
      "main section span.text-body-small",
      '[data-view-name="profile-card"] .text-body-small'
    ], main);
    const headline = one([".text-body-medium.break-words", "div.text-body-medium", "main section div.text-body-medium"], main);
    const role = currentRole(headline);
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
