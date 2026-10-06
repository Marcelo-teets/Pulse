import fs from "node:fs";

const root = "extensions/linkedin-capture";
const required = ["manifest.json","background.js","content.js","popup.html","popup.css","popup.js"];
for (const f of required) {
  if (!fs.existsSync(`${root}/${f}`)) throw new Error(`missing ${f}`);
}
const manifest = JSON.parse(fs.readFileSync(`${root}/manifest.json`, "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Manifest V3 required");
if (manifest.version !== "0.8.8") throw new Error("Expected v0.8.8");
const bg = fs.readFileSync(`${root}/background.js`, "utf8");
for (const forbidden of ["BUILD_API_TOKEN","__PULSE_EXTENSION_TOKEN__","x-extension-token"]) {
  if (bg.includes(forbidden)) throw new Error(`Static legacy credential marker found: ${forbidden}`);
}
if (!bg.includes("PAIR_DEVICE") || !bg.includes("x-pulse-device-token")) throw new Error("Device pairing auth missing");
if (!bg.includes("completePerson")) throw new Error("Profile completion guard missing");
if (bg.includes("nameFromTitle")) throw new Error("Unsafe tab-title name fallback must not exist");
if (!bg.includes("clearDeviceAuth")) throw new Error("Expired device auth recovery missing");
if (!bg.includes("actualUrl.origin!==expected.origin") || !bg.includes("actualPath!==expectedPath")) throw new Error("Exact company URL identity guard missing");
if (!bg.includes("nome canônico da empresa no LinkedIn")) throw new Error("Canonical company-name reconciliation missing");
if (!bg.includes("safeEndpoint") || !bg.includes('candidate.protocol==="https:"&&candidate.origin===expected.origin')) throw new Error("Pinned API endpoint guard missing");
const content = fs.readFileSync(`${root}/content.js`, "utf8");
if (!content.includes("__pulseLinkedinCaptureLoaded === CONTENT_VERSION")) throw new Error("Version-aware content-script reload guard missing");
if (!content.includes('if (!full_name) throw new Error')) throw new Error("Fail-closed missing-name guard missing");
if (!content.includes('if (!headline) throw new Error')) throw new Error("Fail-closed headline guard missing");
if (!content.includes('if (!role.current_company) throw new Error')) throw new Error("Fail-closed company-name guard missing");
if (!content.includes("RESOLVE_COMPANY_LINK") || !content.includes("resolveCompanyLink")) throw new Error("Href-less company resolver missing");
if (!content.includes("CLICK_COMPANY_AFFILIATION") || !content.includes("clickCompanyAffiliation")) throw new Error("Visible company click fallback missing");
if (!content.includes("attemptIndex = 0") || !content.includes("targets.sort((a, b) => b.score - a.score)")) throw new Error("Ranked company click retry missing");
if (!bg.includes("resolveCompanyLinkFromProfile") || !bg.includes("Encontrei a empresa atual no perfil, mas não consegui resolver")) throw new Error("Background Experience fallback missing");
if (!bg.includes("CLICK_COMPANY_AFFILIATION") || !bg.includes("click?.clicked")) throw new Error("Background click-navigation fallback missing");
if (!bg.includes("for(let attemptIndex=0;attemptIndex<6;attemptIndex++)")) throw new Error("Multiple company click retries missing");
console.log("LinkedIn extension validation: OK");
