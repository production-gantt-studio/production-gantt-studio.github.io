import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { sdk, type AuthenticatedUser } from "./sdk";
import { recordSecurityAudit } from "../db";
import { hashIpAddress } from "../securityTokens";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: AuthenticatedUser | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: AuthenticatedUser | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    await recordSecurityAudit({
      eventType: "auth.session.invalid",
      outcome: "denied",
      metadata: { reason: "Session validation failed" },
      ipHash: hashIpAddress(opts.req.ip),
    });
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
