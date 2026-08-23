import { describe, expect, it } from "vitest";
import {
  countLateTasks,
  filterMobileTasks,
  getAdjacentTasks,
  getNextTask,
  isLateTask,
  isThisWeekTask,
  sortMobileTasks,
  type FilterableTask,
} from "./mobileTaskFilters";

const TODAY = "2026-08-23";

function task(overrides: Partial<FilterableTask> & { id: string }): FilterableTask {
  return {
    name: overrides.id,
    start: "2026-08-23",
    end: "2026-08-25",
    status: "未着手",
    assignee: "佐藤",
    dependencies: [],
    ...overrides,
  };
}

const overdue = task({ id: "overdue", start: "2026-08-10", end: "2026-08-18" });
const overdueDone = task({ id: "overdue-done", start: "2026-08-10", end: "2026-08-18", status: "完了" });
const thisWeek = task({ id: "this-week", start: "2026-08-24", end: "2026-08-26" });
const spanning = task({ id: "spanning", start: "2026-08-01", end: "2026-09-30" });
const later = task({ id: "later", start: "2026-09-20", end: "2026-09-25", assignee: "高橋" });
const tbc = task({ id: "tbc", isUnscheduled: true, assignee: "高橋" });

const all = [overdue, overdueDone, thisWeek, spanning, later, tbc];

describe("late tasks", () => {
  it("counts only unfinished work whose end date has passed", () => {
    expect(isLateTask(overdue, TODAY)).toBe(true);
    expect(isLateTask(overdueDone, TODAY)).toBe(false);
    expect(isLateTask(thisWeek, TODAY)).toBe(false);
    expect(isLateTask(tbc, TODAY)).toBe(false);
    expect(countLateTasks(all, TODAY)).toBe(1);
  });
});

describe("this week", () => {
  it("includes anything whose schedule touches the next seven days", () => {
    expect(isThisWeekTask(thisWeek, TODAY)).toBe(true);
    expect(isThisWeekTask(spanning, TODAY)).toBe(true);
    expect(isThisWeekTask(later, TODAY)).toBe(false);
    expect(isThisWeekTask(overdue, TODAY)).toBe(false);
    expect(isThisWeekTask(tbc, TODAY)).toBe(false);
  });

  it("counts the seventh day as this week and the eighth as next", () => {
    expect(isThisWeekTask(task({ id: "day7", start: "2026-08-29", end: "2026-08-29" }), TODAY)).toBe(true);
    expect(isThisWeekTask(task({ id: "day8", start: "2026-08-30", end: "2026-08-30" }), TODAY)).toBe(false);
  });
});

describe("filterMobileTasks", () => {
  it("returns everything for すべて, in date order with undated last", () => {
    const result = filterMobileTasks(all, "all", { today: TODAY, assignee: "佐藤" });
    expect(result.map((item) => item.id)).toEqual(["spanning", "overdue", "overdue-done", "this-week", "later", "tbc"]);
  });

  it("filters by 遅れ / 今週 / 自分 / 日程未定", () => {
    const pick = (filter: Parameters<typeof filterMobileTasks>[1], assignee = "佐藤") =>
      filterMobileTasks(all, filter, { today: TODAY, assignee }).map((item) => item.id);
    expect(pick("late")).toEqual(["overdue"]);
    expect(pick("week")).toEqual(["spanning", "this-week"]);
    expect(pick("mine")).toEqual(["spanning", "overdue", "overdue-done", "this-week"]);
    expect(pick("mine", "高橋")).toEqual(["later", "tbc"]);
    expect(pick("unscheduled")).toEqual(["tbc"]);
  });

  it("shows nothing for 自分 while no name is selected", () => {
    expect(filterMobileTasks(all, "mine", { today: TODAY, assignee: "" })).toEqual([]);
  });
});

describe("sortMobileTasks", () => {
  it("does not mutate the given list", () => {
    const source = [later, overdue];
    const sorted = sortMobileTasks(source);
    expect(source.map((item) => item.id)).toEqual(["later", "overdue"]);
    expect(sorted.map((item) => item.id)).toEqual(["overdue", "later"]);
  });
});

describe("getNextTask", () => {
  it("puts the most overdue unfinished task first", () => {
    expect(getNextTask(all, TODAY)?.id).toBe("overdue");
  });

  it("falls back to the nearest deadline, then to undated work", () => {
    expect(getNextTask([later, thisWeek], TODAY)?.id).toBe("this-week");
    expect(getNextTask([tbc], TODAY)?.id).toBe("tbc");
    expect(getNextTask([task({ id: "done", status: "完了" })], TODAY)).toBeNull();
    expect(getNextTask([], TODAY)).toBeNull();
  });
});

describe("getAdjacentTasks", () => {
  const a = task({ id: "a" });
  const b = task({ id: "b", dependencies: ["a"] });
  const c = task({ id: "c", dependencies: ["b"] });

  it("reads the tasks before and after this one", () => {
    const adjacent = getAdjacentTasks([a, b, c], "b");
    expect(adjacent.previous.map((item) => item.id)).toEqual(["a"]);
    expect(adjacent.next.map((item) => item.id)).toEqual(["c"]);
  });

  it("returns empty lists for the ends of a chain and for a missing task", () => {
    expect(getAdjacentTasks([a, b, c], "a").previous).toEqual([]);
    expect(getAdjacentTasks([a, b, c], "c").next).toEqual([]);
    expect(getAdjacentTasks([a, b, c], "missing")).toEqual({ previous: [], next: [] });
  });
});
