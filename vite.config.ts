import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import agents from "agents/vite";
const local = process.env.GAME_LOCAL === "1";
export default defineConfig({
  define: { __FIXTURE_MODE__: JSON.stringify(local) },
  plugins: [
    agents(),
    react(),
    cloudflare({
      configPath: local ? "wrangler.local.jsonc" : "wrangler.jsonc",
      persistState: {
        path: local ? ".wrangler/fixture-state" : ".wrangler/live-state"
      }
    })
  ]
});
