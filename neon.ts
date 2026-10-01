import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  preview: {
    buckets: {
      uploads: { access: "private" },
    },
    functions: {
      linkedin: {
        name: "Pulse LinkedIn Capture API",
        source: "./functions/linkedin/index.ts",
        env: {
          PULSE_EXTENSION_TOKEN: process.env.PULSE_EXTENSION_TOKEN!,
        },
      },
    },
  },
});