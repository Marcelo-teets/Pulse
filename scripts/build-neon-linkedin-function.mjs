import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const outDir = path.resolve("dist/neon-linkedin");
const entry = path.join(outDir, "index.mjs");
const archive = path.resolve("dist/pulse-linkedin-api-v0.7.2.zip");

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });
await fs.rm(archive, { force: true });

const banner = "import{createRequire as ___cr}from'module';import{fileURLToPath as ___f}from'url';import{dirname as ___d}from'path';const require=___cr(import.meta.url);const __filename=___f(import.meta.url);const __dirname=___d(__filename);";

execFileSync("npx", [
  "--yes",
  "esbuild@0.25.10",
  "functions/linkedin/index.ts",
  "--bundle",
  "--platform=node",
  "--target=node24",
  "--format=esm",
  `--banner:js=${banner}`,
  `--outfile=${entry}`,
], { stdio: "inherit" });

execFileSync("zip", ["-j", archive, entry], { stdio: "inherit" });
console.log(archive);
