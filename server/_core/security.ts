import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getRequestOrigin(req: Request) {
  const proto = req.protocol;
  const host = req.get("host");
  return host ? `${proto}://${host}` : null;
}

export function isTrustedMutationOrigin(req: Request) {
  if (SAFE_METHODS.has(req.method)) return true;
  const origin = req.get("origin");
  const requestOrigin = getRequestOrigin(req);
  return Boolean(origin && requestOrigin && origin === requestOrigin);
}

export function rejectUntrustedMutations(req: Request, res: Response, next: NextFunction) {
  if (isTrustedMutationOrigin(req)) {
    next();
    return;
  }

  res.status(403).json({ error: "Cross-site request blocked" });
}

export function issueCsrfToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: { error: "Too many requests. Please retry later." },
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many authentication requests. Please retry later." },
});

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      // Supabase(認証・データ保存)への通信を許可する。本番のGitHub Pages配信
      // (静的ホスティング)にはこのヘッダー自体が付かないため実害は無かったが、
      // このExpressサーバーを経由するローカル開発・検証時は 'self' のみだと
      // Supabaseへの全リクエストがブラウザのCSPでブロックされ、ログインが
      // 一切機能しない状態になっていた(2026-08-24 発見・修正)。
      connectSrc: ["'self'", "https://*.supabase.co"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      objectSrc: ["'none'"],
      scriptSrc: process.env.NODE_ENV === "production" ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-site" },
  hsts: process.env.NODE_ENV === "production"
    ? { maxAge: 31_536_000, includeSubDomains: true, preload: false }
    : false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
});
