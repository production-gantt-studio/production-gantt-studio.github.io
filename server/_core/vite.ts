import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfigExport from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  // vite.config.ts exports `defineConfig(() => ({...}))` — a FUNCTION, not a
  // plain object (this is the documented/recommended form so the CLI can
  // resolve it against mode/command). Spreading a function directly
  // (`{...viteConfig}`) silently produces `{}` (functions have no relevant
  // own-enumerable properties), which drops `root`, `plugins`,
  // `resolve.alias`, and `envDir` entirely and makes the dev server fall
  // back to Vite's defaults (root = process.cwd(), i.e. the repo root
  // instead of client/). The symptom was every asset under client/
  // (`/src/main.tsx`, files in client/public/) 404-ing inside Vite's own
  // middleware and silently falling through to this file's SPA-fallback
  // handler below, which then served the index.html shell for every
  // request — including JS module requests, which the browser then
  // rejected for a MIME-type mismatch. Resolve the function to its actual
  // config object before handing it to createViteServer().
  const resolvedViteConfig =
    typeof viteConfigExport === "function"
      ? await viteConfigExport({ mode: process.env.NODE_ENV ?? "development", command: "serve" })
      : viteConfigExport;

  const vite = await createViteServer({
    ...resolvedViteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("/{*splat}", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*splat}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
