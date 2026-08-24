export type TimelineDisplay = "days" | "weeks" | "months";

export const DAY_UNIT_WIDTH = 34;
export const WEEK_UNIT_WIDTH = 126;
export const MONTH_DAY_UNIT_WIDTH = 8;
export const TASK_COLUMN_MIN_WIDTH = 260;
export const TASK_COLUMN_MAX_WIDTH = 520;
// 360px は、タスク行のアイコンボタン群・状態ピルぶんを差し引くと、実際に
// タスク名へ回る幅が100px未満しかなく、8〜9文字の日本語タスク名で早くも
// 省略されていた(実測)。480pxなら、社内の実サンプルより長い12〜15文字級の
// 名前まで省略なしで収まる。20文字級の極端に長い名前は、ドラッグでMAX幅
// (520px)まで広げれば収まる — 実測値を踏まえた根拠は
// client/src/simplify.css の .timeline-card .task-title 側のコメント参照。
export const TASK_COLUMN_DEFAULT_WIDTH = 480;

export function getTimelineDisplayMetrics(display: TimelineDisplay, dayCount: number) {
  const daysPerUnit = display === "weeks" ? 7 : 1;
  return {
    daysPerUnit,
    unitWidth: display === "weeks" ? WEEK_UNIT_WIDTH : display === "months" ? MONTH_DAY_UNIT_WIDTH : DAY_UNIT_WIDTH,
    unitCount: Math.max(1, Math.ceil(dayCount / daysPerUnit)),
  };
}

export function clampTaskColumnWidth(width: number) {
  return Math.max(TASK_COLUMN_MIN_WIDTH, Math.min(TASK_COLUMN_MAX_WIDTH, Math.round(width)));
}

// タイムラインの拡大縮小(+/-)。日ごと・週ごと・月ごとそれぞれの基準幅
// (DAY_UNIT_WIDTH等)に、この倍率を掛けて実際の表示幅にする。0.6倍を下限に
// しているのは、これより縮めるとバー内の文字が確実に読めなくなるため。1.8倍を
// 上限にしているのは、これより伸ばすと日ごと表示で数日先すら画面に収まらず
// 実用にならないため(いずれも実測しての判断)。
export const TIMELINE_ZOOM_MIN = 0.6;
export const TIMELINE_ZOOM_MAX = 1.8;
export const TIMELINE_ZOOM_STEP = 0.15;
export const TIMELINE_ZOOM_DEFAULT = 1;

export function clampTimelineZoom(zoom: number) {
  return Math.round(Math.max(TIMELINE_ZOOM_MIN, Math.min(TIMELINE_ZOOM_MAX, zoom)) * 100) / 100;
}

