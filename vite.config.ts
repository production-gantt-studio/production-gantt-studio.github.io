import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

// Phase 2: the Manus-specific plugins (vite-plugin-manus-runtime, and the
// Manus debug-log collector defined inline in this file previously) are
// removed from the independent build path entirely — this app no longer
// depends on the Manus platform at build time or at runtime. See
// docs/phase2_supabase_data_layer.md for the full list of what was stripped
// and why.
const plugins = [react(), tailwindcss(), jsxLocPlugin()];

// GitHub Pages serves this app from a repository subpath
// (https://<user>.github.io/production-gantt-studio/), not the domain root.
// Local development (`pnpm dev`) still runs at "/". Wouter's own base path
// (see client/src/App.tsx's `routerBase`) is derived from this same
// import.meta.env.BASE_URL at runtime, so both modes resolve routes
// (including /auth/callback) correctly with the same code.
export default defineConfig(({ mode }) => ({
  plugins,
  base: mode === "production" ? "/production-gantt-studio/" : "/",
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
}));
