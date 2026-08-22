import { describe, expect, it, vi } from "vitest";
import { toAppUrl } from "./appUrl";

// The production build serves the SPA from /production-gantt-studio/ (see
// vite.config.ts `base`), while BASE_URL is "/" in dev and in this test env.
// Both cases have to produce a link that actually opens the app.

function withBase(base: string, run: () => void) {
  vi.stubGlobal("window", { location: { origin: "https://rikufujita1229-sudo.github.io" } });
  const original = import.meta.env.BASE_URL;
  (import.meta.env as Record<string, unknown>).BASE_URL = base;
  try {
    run();
  } finally {
    (import.meta.env as Record<string, unknown>).BASE_URL = original;
    vi.unstubAllGlobals();
  }
}

describe("toAppUrl", () => {
  it("re-anchors an origin-rooted share URL onto the app base path", () => {
    withBase("/production-gantt-studio/", () => {
      expect(toAppUrl("https://rikufujita1229-sudo.github.io/project?share=abc")).toBe(
        "https://rikufujita1229-sudo.github.io/production-gantt-studio/project?share=abc",
      );
    });
  });

  it("re-anchors a relative path onto the app base path", () => {
    withBase("/production-gantt-studio/", () => {
      expect(toAppUrl("/project?share=abc")).toBe(
        "https://rikufujita1229-sudo.github.io/production-gantt-studio/project?share=abc",
      );
    });
  });

  it("leaves a URL that already carries the base path untouched", () => {
    withBase("/production-gantt-studio/", () => {
      expect(toAppUrl("https://rikufujita1229-sudo.github.io/production-gantt-studio/project?share=abc")).toBe(
        "https://rikufujita1229-sudo.github.io/production-gantt-studio/project?share=abc",
      );
    });
  });

  it("is a no-op at the root base path used in development", () => {
    withBase("/", () => {
      expect(toAppUrl("/project?share=abc")).toBe("https://rikufujita1229-sudo.github.io/project?share=abc");
    });
  });

  it("keeps the token query string intact", () => {
    withBase("/production-gantt-studio/", () => {
      const out = new URL(toAppUrl("https://rikufujita1229-sudo.github.io/project?share=tok-123&x=1"));
      expect(out.searchParams.get("share")).toBe("tok-123");
      expect(out.searchParams.get("x")).toBe("1");
    });
  });
});
