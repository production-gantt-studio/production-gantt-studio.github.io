/**
 * スマホのガントは横スクロールしない。案件の初日から最終日を画面の横幅に必ず
 * 収めるため、目盛り・帯・今日の線をすべて「同じ期間に対する日数の割合(%)」で
 * 置く。px を混ぜると、目盛りと帯が別基準になってズレる。
 */

export type TimelineRange = {
  start: string;
  end: string;
  totalDays: number;
};

export type TimelineTick = {
  id: string;
  date: string;
  label: string;
  sublabel?: string;
  /** 目盛りの文字を置く位置。 */
  percent: number;
  /** 目盛り線を引く位置。文字は中央寄せ・線はその日の始まり、と役割を分けても基準は同じ。 */
  gridPercent: number;
};

export type BarPlacement = {
  left: number;
  width: number;
  visible: boolean;
};

export type SchedulableTask = {
  start: string;
  end: string;
  isUnscheduled?: boolean;
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function toDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function toIso(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number) {
  const date = toDate(value);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

export function diffDays(start: string, end: string) {
  return Math.round((toDate(end).getTime() - toDate(start).getTime()) / 86_400_000);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function makeRange(start: string, end: string): TimelineRange {
  const totalDays = Math.max(1, diffDays(start, end) + 1);
  return { start, end: addDays(start, totalDays - 1), totalDays };
}

/** 案件の初日から最終日。日程未定のタスクは期間を持たないので除く。 */
export function getScheduledRange(tasks: SchedulableTask[], fallbackDate: string): TimelineRange {
  const scheduled = tasks.filter((task) => !task.isUnscheduled && task.start && task.end);
  if (!scheduled.length) return makeRange(fallbackDate, fallbackDate);
  const start = scheduled.reduce((earliest, task) => (task.start < earliest ? task.start : earliest), scheduled[0].start);
  const end = scheduled.reduce((latest, task) => (task.end > latest ? task.end : latest), scheduled[0].end);
  return makeRange(start, end < start ? start : end);
}

/** 「今週」は今日からの7日間。案件トップの絞り込みと同じ意味にそろえる。 */
export function getWeekRange(today: string): TimelineRange {
  return makeRange(today, addDays(today, 6));
}

export function dayStartPercent(range: TimelineRange, date: string) {
  return clampPercent((diffDays(range.start, date) / range.totalDays) * 100);
}

export function dayCenterPercent(range: TimelineRange, date: string) {
  return clampPercent(((diffDays(range.start, date) + 0.5) / range.totalDays) * 100);
}

export function isWithinRange(range: TimelineRange, date: string) {
  return date >= range.start && date <= range.end;
}

export function overlapsRange(range: TimelineRange, start: string, end: string) {
  return start <= range.end && end >= range.start;
}

/** 帯の位置と長さ。期間の外へはみ出す分は切り落として、必ず枠内に収める。 */
export function getBarPlacement(range: TimelineRange, start: string, end: string): BarPlacement {
  const rawLeft = (diffDays(range.start, start) / range.totalDays) * 100;
  const rawRight = ((diffDays(range.start, end) + 1) / range.totalDays) * 100;
  const left = clampPercent(rawLeft);
  const right = clampPercent(rawRight);
  return { left, width: Math.max(0, right - left), visible: rawRight > 0 && rawLeft < 100 };
}

function monthLabel(date: string) {
  return `${Number(date.slice(5, 7))}月`;
}

export function monthDayLabel(date: string) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function firstOfNextMonth(date: string) {
  const current = toDate(date);
  current.setDate(1);
  current.setMonth(current.getMonth() + 1);
  return toIso(current);
}

/**
 * 「全体」の目盛り。スマホの幅に置ける本数（4〜7本）に収まるよう、週の倍数で
 * 間隔を広げる。200日を超える長い案件だけ、月の変わり目に切り替える。
 */
export function buildOverviewTicks(range: TimelineRange): TimelineTick[] {
  if (range.totalDays <= 200) {
    const step = 7 * Math.max(1, Math.ceil(range.totalDays / 49));
    const ticks: TimelineTick[] = [];
    for (let offset = 0; offset < range.totalDays; offset += step) {
      const date = addDays(range.start, offset);
      const percent = dayStartPercent(range, date);
      ticks.push({ id: date, date, label: monthDayLabel(date), percent, gridPercent: percent });
    }
    return ticks;
  }

  const first = range.start;
  const ticks: TimelineTick[] = [{ id: first, date: first, label: monthDayLabel(first), percent: 0, gridPercent: 0 }];
  let cursor = firstOfNextMonth(first);
  while (cursor <= range.end) {
    const percent = dayStartPercent(range, cursor);
    // 初日のすぐ隣に月ラベルが来ると文字が重なるので、その月は飛ばす。
    if (percent >= 7) ticks.push({ id: cursor, date: cursor, label: monthLabel(cursor), percent, gridPercent: percent });
    cursor = firstOfNextMonth(cursor);
  }
  return ticks;
}

/** 「今週」の目盛り。曜日つきで7日ぶん。 */
export function buildWeekTicks(range: TimelineRange): TimelineTick[] {
  return Array.from({ length: range.totalDays }, (_, index) => {
    const date = addDays(range.start, index);
    return {
      id: date,
      date,
      label: String(Number(date.slice(8, 10))),
      sublabel: WEEKDAY_LABELS[toDate(date).getDay()],
      percent: dayCenterPercent(range, date),
      gridPercent: dayStartPercent(range, date),
    };
  });
}

export function formatRangeLabel(range: TimelineRange) {
  return `${monthDayLabel(range.start)} — ${monthDayLabel(range.end)}`;
}

export function countDays(start: string, end: string) {
  return Math.max(1, diffDays(start, end) + 1);
}
