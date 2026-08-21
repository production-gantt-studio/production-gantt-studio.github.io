import { describe, expect, it } from "vitest";
import { cloneTemplateTasks } from "./projectCreationTemplate";

describe("cloneTemplateTasks", () => {
  it("依存関係と親子関係を新しいIDへ付け替え、すべてを未着手・日程未定で複製する", () => {
    let sequence = 0;
    const copied = cloneTemplateTasks([
      { id: "parent", status: "完了", isUnscheduled: false, dependencies: [] },
      { id: "child", parentId: "parent", status: "進行中", isUnscheduled: false, dependencies: ["parent"] },
    ], () => `new-${++sequence}`);

    expect(copied).toEqual([
      { id: "new-1", status: "未着手", isUnscheduled: true, dependencies: [], parentId: null },
      { id: "new-2", parentId: "new-1", status: "未着手", isUnscheduled: true, dependencies: ["new-1"] },
    ]);
  });
});
