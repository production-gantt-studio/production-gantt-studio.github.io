import { describe, expect, it } from "vitest";
import { isObsoleteQuickSample, normalizeSampleProjectIdentity } from "./sampleProjectIdentity";

describe("normalizeSampleProjectIdentity", () => {
  it("過去の実在名を含むサンプル案件を一般名へ移行する", () => {
    expect(normalizeSampleProjectIdentity("Suntory × OUTDOOR LIVING", "SUNTORY / BRAND COMMUNICATION")).toEqual({ title: "動画案件サンプル", client: "Sample" });
  });

  it("既存の英語サンプル名を用途別の日本語名称へ移行する", () => {
    expect(normalizeSampleProjectIdentity("Sample Event", "Sample", 8)).toEqual({ title: "イベント案件サンプル", client: "Sample" });
    expect(normalizeSampleProjectIdentity("Sample Graphic", "Sample", 8)).toEqual({ title: "グラフィック案件サンプル", client: "Sample" });
    expect(normalizeSampleProjectIdentity("Sample", "Sample", 15)).toEqual({ title: "動画案件サンプル", client: "Sample" });
  });

  it("実在名を含まない案件情報は変更しない", () => {
    expect(normalizeSampleProjectIdentity("春季キャンペーン", "Acme Studio")).toEqual({ title: "春季キャンペーン", client: "Acme Studio" });
  });

  it("タスクが2件だけでクライアント未設定の不要なSampleを削除対象として判定する", () => {
    expect(isObsoleteQuickSample("Sample", "クライアント未設定", 2)).toBe(true);
    expect(isObsoleteQuickSample("Sample", "Sample", 15)).toBe(false);
  });
});
