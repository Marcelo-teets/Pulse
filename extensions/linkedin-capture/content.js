(() => {
  const normalize = (v) => (v || "").replace(/\s+/g, " ").trim();
  const text = (sel, root = document) => normalize(root.querySelector(sel)?.innerText);
  const firstText = (sels, root = document) => {
    for (const sel of sels) {
      const value = text(sel, root);
      if (value) return value;
    }
    return "";
  };
  const cleanLines = (value) => [...new Set((value || "").split("\n").map(normalize).filter(Boolean)
    .filter((line) => !/^(exibir|mostrar|show|ver|see)\b/i.test(line)))];

  const sectionByHeading = (labels) => {
    const wanted = labels.map((x) => x.toLowerCase());
    for (const heading of document.querySelectorAll("h2, h3")) {
      const headingText = normalize(heading.innerText).toLowerCase();
      if (wanted.some((label) => headingText === label || headingText.startsWith(label))) {
        return heading.closest("section") || heading.parentElement?.closest("section") || heading.parentElement;
      }
    }
    return null;
  };

  const canonicalUrl = () => {
    const raw = document.querySelector('link[rel="canonical"]')?.href || location.href;
    try {
      const url = new URL(raw);
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    } catch {
      return raw;
    }
  };

  const normalizeCompanyUrl = (href) => {
    if (!href) return "";
    try {
      const url = new URL(href, location.origin);
      const match = url.pathname.match(/^\/company\/[^/?#]+/i);
      return match ? `${url.origin}${match[0]}`.replace(/\/$/, "") : "";
    } catch {
      return "";
    }
  };

  const findCompanyLink = (root) => {
    for (const link of root.querySelectorAll('a[href*="/company/"]')) {
      const href = normalizeCompanyUrl(link.href);
      if (href) return href;
    }
    return "";
  };

  const parseRoleFromHeadline = (headline) => {
    for (const pattern of [/^(.+?)\s+(?:at|@)\s+(.+)$/i, /^(.+?)\s+(?:na|no|em)\s+(.+)$/i]) {
      const match = headline.match(pattern);
      if (match) return { current_title: normalize(match[1]), current_company: normalize(match[2]), company_url: "" };
    }
    return { current_title: "", current_company: "", company_url: "" };
  };

  const parseCurrentRole = (headline) => {
    const section = sectionByHeading(["Experiência", "Experience"]);
    if (section) {
      const items = [...section.querySelectorAll("li")].filter((li) => normalize(li.innerText).length > 5);
      for (const item of items) {
        const lines = cleanLines(item.innerText).filter((line) => !/^(experiência|experience)$/i.test(line)).slice(0, 12);
        if (!lines.length) continue;
        const looksCurrent = /(presente|present|o momento|atual)/i.test(lines.join(" "));
        if (!looksCurrent && items.length > 1) continue;
        const employmentTypeIndex = lines.findIndex((line) =>
          /\s·\s.*(tempo integral|meio per[ií]odo|aut[oô]nomo|freelance|contrato|est[aá]gio|aprendiz|full[- ]?time|part[- ]?time|self-employed|contract|internship|apprenticeship)/i.test(line));
        if (employmentTypeIndex >= 1) {
          return {
            current_title: lines[employmentTypeIndex - 1] || "",
            current_company: normalize((lines[employmentTypeIndex] || "").split(" · ")[0]),
            company_url: findCompanyLink(item)
          };
        }
        const dateLike = /(\b20\d{2}\b|\b19\d{2}\b|presente|present|o momento|atual)/i;
        if (lines.length >= 2 && !dateLike.test(lines[1])) {
          return {
            current_title: lines[0] || "",
            current_company: normalize((lines[1] || "").split(" · ")[0]),
            company_url: findCompanyLink(item)
          };
        }
      }
    }
    const fallback = parseRoleFromHeadline(headline);
    fallback.company_url = findCompanyLink(document.querySelector("main") || document);
    return fallback;
  };

  const extractProfile = () => {
    const root = document.querySelector("main section") || document.querySelector("main") || document;
    const headline = firstText([".text-body-medium.break-words","div.text-body-medium","main section div.text-body-medium"], root);
    const role = parseCurrentRole(headline);
    const capture = {
      full_name: firstText(["h1"], root) || firstText(["h1"]),
      linkedin_url: canonicalUrl(),
      location: firstText([".text-body-small.inline.t-black--light.break-words","span.text-body-small.inline","main section span.text-body-small"], root),
      current_title: role.current_title,
      current_company: role.current_company,
      captured_at: new Date().toISOString()
    };
    return { ...capture, raw_json: { ...capture }, _company_url: role.company_url || "" };
  };

  const companyLabelValue = (labels) => {
    const wanted = labels.map((x) => x.toLowerCase());
    for (const el of document.querySelectorAll("dt, h3, span, div")) {
      const label = normalize(el.innerText).toLowerCase();
      if (!wanted.some((w) => label === w)) continue;
      const parent = el.parentElement;
      if (!parent) continue;
      const siblingText = normalize(el.nextElementSibling?.innerText);
      if (siblingText) return { text: siblingText, root: parent };
      const lines = cleanLines(parent.innerText).filter((x) => !wanted.includes(x.toLowerCase()));
      if (lines[0]) return { text: lines[0], root: parent };
    }
    return { text: "", root: null };
  };

  const extractWebsite = () => {
    const labeled = companyLabelValue(["Website", "Site"]);
    if (labeled.root) {
      const link = labeled.root.querySelector('a[href^="http"]');
      if (link?.href && !/linkedin\.com/i.test(link.href)) return link.href;
    }
    for (const a of document.querySelectorAll('a[href^="http"]')) {
      if (!/linkedin\.com/i.test(a.href) && /(website|site|visitar|visit)/i.test(normalize(a.innerText))) return a.href;
    }
    return labeled.text && /^https?:\/\//i.test(labeled.text) ? labeled.text : "";
  };

  const extractEmployeeCount = () => {
    const labeled = companyLabelValue(["Company size", "Tamanho da empresa"]);
    if (labeled.text) return labeled.text;
    const body = normalize(document.body?.innerText);
    for (const pattern of [
      /([\d.,]+\s*[–-]\s*[\d.,]+\s+(?:employees|funcionários))/i,
      /([\d.,]+\+\s+(?:employees|funcionários))/i,
      /([\d.,]+\s+(?:associated members|funcionários associados))/i
    ]) {
      const match = body.match(pattern);
      if (match) return normalize(match[1]);
    }
    return "";
  };

  const extractCompanyDescription = () => {
    const about = sectionByHeading(["Sobre","About","Visão geral","Overview"]);
    if (about) {
      const paragraphs = [...about.querySelectorAll("p, div.break-words, span.break-words")]
        .map((el) => normalize(el.innerText)).filter((v) => v.length >= 40);
      if (paragraphs[0]) return paragraphs[0];
    }
    return [...document.querySelectorAll("main p, main div.break-words")]
      .map((el) => normalize(el.innerText))
      .find((v) => v.length >= 80 && !/(followers|seguidores|employees|funcionários)/i.test(v)) || "";
  };

  const extractCompany = () => ({
    company_name: firstText(["h1","main h1",".org-top-card-summary__title"]),
    description: extractCompanyDescription(),
    website: extractWebsite(),
    employee_count: extractEmployeeCount(),
    captured_at: new Date().toISOString()
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (message?.type === "EXTRACT_PROFILE") sendResponse({ ok: true, profile: extractProfile() });
      else if (message?.type === "EXTRACT_COMPANY") sendResponse({ ok: true, company: extractCompany() });
      else return;
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || "Falha ao extrair dados do LinkedIn" });
    }
    return true;
  });
})();