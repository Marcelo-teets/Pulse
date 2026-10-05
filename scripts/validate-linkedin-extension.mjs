import fs from "node:fs";

const root = "extensions/linkedin-capture";
const required = ["manifest.json","background.js","content.js","popup.html","popup.css","popup.js"];
for (const f of required) {
  if (!fs.existsSync(`${root}/${f}`)) throw new Error(`missing ${f}`);
}
const manifest = JSON.parse(fs.readFileSync(`${root}/manifest.json`, "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Manifest V3 required");
if (manifest.version !== "0.8.3") throw new Error("Expected v0.8.3");
const bg = fs.readFileSync(`${root}/background.js`, "utf8");
for (const forbidden of ["BUILD_API_TOKEN","__PULSE_EXTENSION_TOKEN__","x-extension-token"]) {
  if (bg.includes(forbidden)) throw new Error(`Static legacy credential marker found: ${forbidden}`);
}
if (!bg.includes("PAIR_DEVICE") || !bg.includes("x-pulse-device-token")) throw new Error("Device pairing auth missing");
if (!bg.includes("completePerson")) throw new Error("Profile completion guard missing");
if (bg.includes("nameFromTitle")) throw new Error("Unsafe tab-title name fallback must not exist");
if (!bg.includes("clearDeviceAuth")) throw new Error("Expired device auth recovery missing");
if (!bg.includes("actual.url?.startsWith")) throw new Error("Verified company URL guard missing");
if (!bg.includes("nome canônico da empresa no LinkedIn")) throw new Error("Canonical company-name reconciliation missing");
const content = fs.readFileSync(`${root}/content.js`, "utf8");
if (!content.includes("__pulseLinkedinCaptureLoaded === CONTENT_VERSION")) throw new Error("Version-aware content-script reload guard missing");
if (!content.includes('if (!full_name) throw new Error')) throw new Error("Fail-closed missing-name guard missing");
if (!content.includes('if (!headline) throw new Error')) throw new Error("Fail-closed headline guard missing");
if (!content.includes('if (!role.current_company || !role.company_url)')) throw new Error("Fail-closed company guard missing");
console.log("LinkedIn extension validation: OK");
