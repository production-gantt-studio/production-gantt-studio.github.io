import { describe, expect, it } from "vitest";
import { getHandoffTone } from "./handoffAttention";

describe("getHandoffTone", () => {
  it("期限超過・期限接近・通常を担当変更の注意色へ分ける", () => {
    expect(getHandoffTone({ today: "2026-08-20", end: "2026-08-19", isUnscheduled: false })).toBe("overdue");
    expect(getHandoffTone({ today: "2026-08-20", end: "2026-08-26", isUnscheduled: false })).toBe("due");
    expect(getHandoffTone({ today: "2026-08-20", end: "2026-09-10", isUnscheduled: false })).toBe("normal");
  });

  it("日程未定の担当変更は通常の引継ぎとして表示する", () => {
    expect(getHandoffTone({ today: "2026-08-20", end: "2026-08-01", isUnscheduled: true })).toBe("normal");
  });
});
