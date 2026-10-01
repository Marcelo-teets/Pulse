import fs from "node:fs/promises";
import path from "node:path";

const src = path.resolve("extensions/linkedin-capture");
const dist = path.resolve("dist/linkedin-capture");
await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

for (const name of ["manifest.json","background.js","content.js","popup.html","popup.css","popup.js","README.md"]) {
  await fs.copyFile(path.join(src, name), path.join(dist, name));
}

console.log(dist);
