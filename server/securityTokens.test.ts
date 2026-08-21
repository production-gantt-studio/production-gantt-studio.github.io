import { describe, expect, it } from "vitest";
import { createOpaqueToken, hashIpAddress, hashOpaqueToken } from "./securityTokens";

describe("security tokens", () => {
  it("issues unique URL-safe tokens and stores only their deterministic hash", () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(hashOpaqueToken(first)).toHaveLength(64);
    expect(hashOpaqueToken(first)).toBe(hashOpaqueToken(first));
    expect(hashOpaqueToken(first)).not.toBe(first);
  });

  it("does not produce an IP fingerprint without the deployment secret", () => {
    const prior = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(hashIpAddress("127.0.0.1")).toBeNull();
    if (prior) process.env.JWT_SECRET = prior;
  });
});
