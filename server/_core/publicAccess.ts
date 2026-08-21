import type { RequestHandler } from "express";

/**
 * Production deployments stay closed until the owner explicitly enables public
 * access. Development previews remain available for maintenance and handoff.
 */
export const blockClosedProductionSite: RequestHandler = (_req, res, next) => {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PUBLIC_SITE !== "true") {
    res.status(404).type("text/plain").send("このサイトは現在公開していません。");
    return;
  }
  next();
};
