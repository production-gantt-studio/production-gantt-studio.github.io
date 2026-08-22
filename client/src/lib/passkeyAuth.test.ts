import { describe, expect, it } from "vitest";
import { passkeyErrorMessage } from "./passkeyAuth";

describe("passkeyErrorMessage", () => {
  it("turns a user-cancelled ceremony into a clear Japanese message", () => {
    expect(passkeyErrorMessage(new Error("NotAllowedError: The operation was cancelled"))).toContain("取り消されました");
  });

  it("keeps a safe fallback message when no error text exists", () => {
    expect(passkeyErrorMessage(undefined)).toBe("Passkeyの処理に失敗しました。");
  });
});
