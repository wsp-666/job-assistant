import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function buildVersionPlugin(): Plugin {
  let buildVersion = "";
  return {
    name: "build-version",
    config() {
      buildVersion = new Date().toISOString();
    },
    transformIndexHtml(html) {
      return html.replace("%JA_BUILD_VERSION%", buildVersion);
    },
    closeBundle() {
      writeFileSync(join(__dirname, "dist", "build-version.txt"), buildVersion, "utf-8");
    },
  };
}

export default defineConfig({
  plugins: [react(), buildVersionPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000",
    },
  },
});
