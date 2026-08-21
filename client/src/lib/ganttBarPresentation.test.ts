import { describe, expect, it } from "vitest";
import { getGanttBarDisplayMode } from "./ganttBarPresentation";

describe("getGanttBarDisplayMode", () => {
  it("優先的にタスク名を読ませる幅を判定する", () => {
    expect(getGanttBarDisplayMode(127)).toBe("task");
    expect(getGanttBarDisplayMode(260)).toBe("task");
  });

  it("短いバーでは状態、極短いバーでは短縮状態へ切り替える", () => {
    expect(getGanttBarDisplayMode(126)).toBe("status");
    expect(getGanttBarDisplayMode(79)).toBe("status");
    expect(getGanttBarDisplayMode(78)).toBe("compact-status");
  });
});
