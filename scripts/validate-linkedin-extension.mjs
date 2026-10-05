import fs from "node:fs";

const root = "extensions/linkedin-capture";
const required = ["manifest.json","background.js","content.js","popup.html","popup.css","popup.js"];
for (const f of required) {
  if (!fs.existsSync(`${root}/${f}`)) throw new Error(`missing ${f}`);
}
const manifest = JSON.parse(fs.readFileSync(`${root}/manifest.json`, "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Manifest V3 required");
if (manifest.version !== "0.8.0") throw new Error("Expected v0.8.0");
const bg = fs.readFileSync(`${root}/background.js`, "utf8");
for (const forbidden of ["BUILD_API_TOKEN","__PULSE_EXTENSION_TOKEN__","x-extension-token"]) {
  if (bg.includes(forbidden)) throw new Error(`Static legacy credential marker found: ${forbidden}`);
}
if (!bg.includes("PAIR_DEVICE") || !bg.includes("x-pulse-device-token")) throw new Error("Device pairing auth missing");
if (!bg.includes("completePerson") || !bg.includes("nameFromTitle")) throw new Error("Tab-title name fallback missing");
console.log("LinkedIn extension validation: OK");
