import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  let localProjectId = env.VITE_WALLETCONNECT_PROJECT_ID?.trim();
  if (!localProjectId) {
    try {
      localProjectId = readFileSync(resolve(process.cwd(), "../launch-inputs/02-reown-project-id.txt"), "utf8").trim();
    } catch {
      localProjectId = "";
    }
  }
  return {
    define: localProjectId
      ? { "import.meta.env.VITE_WALLETCONNECT_PROJECT_ID": JSON.stringify(localProjectId) }
      : undefined,
    plugins: [react(), tailwindcss()],
    server: {
      port: 4173,
      strictPort: true,
    },
    preview: {
      port: 4174,
    },
  };
});
