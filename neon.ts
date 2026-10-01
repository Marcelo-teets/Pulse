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
          PULSE_EXTENSION_TOKEN_LEGACY_CURRENT: process.env.PULSE_EXTENSION_TOKEN_LEGACY_CURRENT!,
          PULSE_EXTENSION_TOKEN_LEGACY_PREVIOUS: process.env.PULSE_EXTENSION_TOKEN_LEGACY_PREVIOUS!,
          PULSE_LEGACY_AUTH_UNTIL: process.env.PULSE_LEGACY_AUTH_UNTIL!,
        },
      },
    },
  },
});
