import { describe, expect, it } from "vitest";
import { getCompactStatusLabel, getStatusSummary, getTaskTone } from "./statusPresentation";

describe("getStatusSummary", () => {
  it("修正中を進行中として集計し、判断に必要な4区分を返す", () => {
    expect(getStatusSummary(["進行中", "修正中", "クライアント確認中", "完了", "未着手"])).toEqual([
      { id: "active", label: "進行中", count: 2 },
      { id: "review", label: "確認待ち", count: 1 },
      { id: "done", label: "完了", count: 1 },
      { id: "not-started", label: "未着手", count: 1 },
    ]);
  });

  it("短いバーでは状態名を誤解のない短縮表示にする", () => {
    expect(getCompactStatusLabel("進行中")).toBe("進行");
    expect(getCompactStatusLabel("クライアント確認中")).toBe("確認");
    expect(getCompactStatusLabel("完了")).toBe("完了");
  });
});

describe("getTaskTone", () => {
  it("面で塗る色を状態ごとに1つへ決める", () => {
    expect(getTaskTone("未着手")).toBe("idle");
    expect(getTaskTone("進行中")).toBe("progress");
    expect(getTaskTone("修正中")).toBe("progress");
    expect(getTaskTone("クライアント確認中")).toBe("review");
    expect(getTaskTone("完了")).toBe("done");
  });

  it("重要タスクは状態より優先して赤で出す", () => {
    expect(getTaskTone("完了", true)).toBe("danger");
    expect(getTaskTone("未着手", true)).toBe("danger");
  });
});
