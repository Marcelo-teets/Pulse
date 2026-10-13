// One canonical LinkedIn identity for captures, reviews and the Sheets mirror.
// Restrict to HTTPS LinkedIn profile/company URLs. Never trust a lookalike host.
export function canonicalLinkedinUrl(value, kind) {
  if (typeof value !== "string" || value.length > 2000) return null;
  const type = kind === "person" ? "in" : kind === "company" ? "company" : "";
  if (!type) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0]?.toLowerCase() !== type || !segments[1]) return null;
    if (type === "in" && segments.length !== 2) return null;
    // Company About and posts share the same underlying company identity.
    const slug = decodeURIComponent(segments[1]).toLowerCase();
    if (!/^[\p{L}\p{N}._-]{1,200}$/u.test(slug)) return null;
    return `https://www.linkedin.com/${type}/${encodeURIComponent(slug)}`;
  } catch {
    return null;
  }
}

export const canonicalPersonUrl = value => canonicalLinkedinUrl(value, "person");
export const canonicalCompanyUrl = value => canonicalLinkedinUrl(value, "company");
