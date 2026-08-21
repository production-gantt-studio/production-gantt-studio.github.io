const LEGACY_SAMPLE_IDENTITIES = new Set([
  "Suntory × OUTDOOR LIVING",
  "SUNTORY / BRAND COMMUNICATION",
]);

const SAMPLE_TITLES = {
  video: "動画案件サンプル",
  event: "イベント案件サンプル",
  graphic: "グラフィック案件サンプル",
} as const;

export function normalizeSampleProjectIdentity(title: string, client: string, taskCount = 0) {
  if (LEGACY_SAMPLE_IDENTITIES.has(title) || LEGACY_SAMPLE_IDENTITIES.has(client)) {
    return { title: SAMPLE_TITLES.video, client: "Sample" };
  }
  if (title === "Sample Event") return { title: SAMPLE_TITLES.event, client };
  if (title === "Sample Graphic") return { title: SAMPLE_TITLES.graphic, client };
  if (title === "Sample" && client === "Sample" && taskCount >= 10) return { title: SAMPLE_TITLES.video, client };
  return { title, client };
}

export function isObsoleteQuickSample(title: string, client: string, taskCount = 0): boolean {
  return title === "Sample" && client === "クライアント未設定" && taskCount === 2;
}
