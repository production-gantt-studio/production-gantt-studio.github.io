import { describe, expect, it } from "vitest";
import { exceedsEventMonth } from "./projectSchedulePeriod";

describe("exceedsEventMonth", () => {
  it("登録月より前に完了するタスクは警告対象にしない", () => {
    expect(exceedsEventMonth("2026-08-31", "2026-10-31")).toBe(false);
  });

  it("開催月内で完了するタスクは警告対象にしない", () => {
    expect(exceedsEventMonth("2026-10-31", "2026-10-31")).toBe(false);
  });

  it("開催月を超えるタスクだけを警告対象にする", () => {
    expect(exceedsEventMonth("2026-11-01", "2026-10-31")).toBe(true);
  });
});
