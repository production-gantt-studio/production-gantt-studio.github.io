import { describe, expect, it } from "vitest";
import { isTrustedMutationOrigin } from "./security";

function request({ method, origin, host = "gantstudio.example.test", protocol = "https" }: {
  method: string;
  origin?: string;
  host?: string;
  protocol?: string;
}) {
  return {
    method,
    protocol,
    get: (name: string) => name.toLowerCase() === "host" ? host : name.toLowerCase() === "origin" ? origin : undefined,
  } as any;
}

describe("isTrustedMutationOrigin", () => {
  it("allows safe reads without an Origin header", () => {
    expect(isTrustedMutationOrigin(request({ method: "GET" }))).toBe(true);
  });

  it("allows same-origin writes", () => {
    expect(isTrustedMutationOrigin(request({ method: "POST", origin: "https://gantstudio.example.test" }))).toBe(true);
  });

  it("rejects cross-site and origin-less writes", () => {
    expect(isTrustedMutationOrigin(request({ method: "POST", origin: "https://evil.example.test" }))).toBe(false);
    expect(isTrustedMutationOrigin(request({ method: "POST" }))).toBe(false);
  });
});
