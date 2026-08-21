import { afterEach, describe, expect, it, vi } from "vitest";
import { blockClosedProductionSite } from "./publicAccess";

const originalNodeEnv = process.env.NODE_ENV;
const originalPublicAccess = process.env.ALLOW_PUBLIC_SITE;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalPublicAccess === undefined) delete process.env.ALLOW_PUBLIC_SITE;
  else process.env.ALLOW_PUBLIC_SITE = originalPublicAccess;
});

describe("blockClosedProductionSite", () => {
  it("blocks the production site by default", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_PUBLIC_SITE;
    const status = vi.fn().mockReturnThis();
    const type = vi.fn().mockReturnThis();
    const send = vi.fn();
    const next = vi.fn();

    blockClosedProductionSite({} as never, { status, type, send } as never, next);

    expect(status).toHaveBeenCalledWith(404);
    expect(send).toHaveBeenCalledWith("このサイトは現在公開していません。");
    expect(next).not.toHaveBeenCalled();
  });

  it("allows development preview and explicitly approved public access", () => {
    const next = vi.fn();
    process.env.NODE_ENV = "development";
    blockClosedProductionSite({} as never, {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);

    process.env.NODE_ENV = "production";
    process.env.ALLOW_PUBLIC_SITE = "true";
    blockClosedProductionSite({} as never, {} as never, next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
