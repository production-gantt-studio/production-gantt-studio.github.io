/**
 * 進行メンバー(role = "viewer")に許した編集範囲の境界テスト。
 * ここが通らなくなったら、閲覧しかできないはずの人がタスクを消せる/日程を動かせる
 * 状態になっている可能性がある。
 */
import { describe, expect, it } from "vitest";
import { applyTaskProgressOverlay, describeTaskProgressChange } from "./taskProgress";

const NOW = "2026-08-24T12:00:00.000Z";

function storedProject() {
  return {
    title: "撮影案件",
    client: "サンプル",
    tasks: [
      { id: "t1", phase: "plan", name: "企画", start: "2026-09-01", end: "2026-09-03", status: "未着手", assignee: "A", dependencies: [], isImportant: false, parentId: null },
      { id: "t2", phase: "shoot", name: "撮影", start: "2026-09-10", end: "2026-09-11", status: "進行中", assignee: "B", dependencies: ["t1"], note: "香盤確認", parentId: null },
    ],
    phases: [{ id: "plan", name: "企画", className: "phase-a" }, { id: "shoot", name: "撮影", className: "phase-b" }],
    members: [{ id: "m1", name: "A", role: "PM" }],
    milestones: [{ id: "ms1", title: "撮影日", date: "2026-09-10" }],
    collapsedTaskIds: [],
    collapsedPhaseIds: [],
    handoffs: [],
    eventMonth: "2026-09",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("applyTaskProgressOverlay: 許可された2項目", () => {
  it("状態の変更を保存済みデータへ反映する", () => {
    const stored = storedProject();
    const incoming = clone(stored);
    incoming.tasks[0].status = "完了";

    const result = applyTaskProgressOverlay(stored, incoming, NOW);

    expect(result.changed).toBe(true);
    expect(result.statusChanges).toBe(1);
    expect((result.data.tasks as any[])[0].status).toBe("完了");
    expect(result.data.updatedAt).toBe(NOW);
  });

  it("担当者の変更を保存済みデータへ反映する", () => {
    const stored = storedProject();
    const incoming = clone(stored);
    incoming.tasks[1].assignee = "C";

    const result = applyTaskProgressOverlay(stored, incoming, NOW);

    expect(result.changed).toBe(true);
    expect(result.assigneeChanges).toBe(1);
    expect((result.data.tasks as any[])[1].assignee).toBe("C");
  });

  it("状態と担当者を同時に変更できる", () => {
    const stored = storedProject();
    const incoming = clone(stored);
    incoming.tasks[0].status = "進行中";
    incoming.tasks[0].assignee = "C";
    incoming.tasks[1].status = "完了";

    const result = applyTaskProgressOverlay(stored, incoming, NOW);

    expect(result.statusChanges).toBe(2);
    expect(result.assigneeChanges).toBe(1);
  });

  it("一覧に無い状態文字列は受け付けない", () => {
    const stored = storedProject();
    const incoming = clone(stored) as any;
    incoming.tasks[0].status = "勝手なステータス";

    const result = applyTaskProgressOverlay(stored, incoming, NOW);

    expect(result.changed).toBe(false);
    expect((result.data.tasks as any[])[0].status).toBe("未着手");
  });

  it("異常に長い担当者名・制御文字入りの担当者名は受け付けない", () => {
    const stored = storedProject();
    const tooLong = clone(stored) as any;
    tooLong.tasks[0].assignee = "あ".repeat(200);
    expect(applyTaskProgressOverlay(stored, tooLong, NOW).changed).toBe(false);

    const controlChars = clone(stored) as any;
    controlChars.tasks[0].assignee = "A\u0007B";
    expect(applyTaskProgressOverlay(stored, controlChars, NOW).changed).toBe(false);
  });
});

describe("applyTaskProgressOverlay: 許可していない操作は無視される", () => {
  it("タスクを追加しても保存されない", () => {
    const stored = storedProject();
    const incoming = clone(stored) as any;
    incoming.tasks.push({ id: "t3", phase: "plan", name: "勝手に追加", start: "2026-09-20", end: "2026-09-21", status: "未着手", assignee: "A", dependencies: [] });
    incoming.tasks[0].status = "完了"; // 許可された変更を混ぜても、追加だけは通らない

    const result = applyTaskProgressOverlay(stored, incoming, NOW);

    expect((result.data.tasks as any[]).map((t) => t.id)).toEqual(["t1", "t2"]);
    expect((result.data.tasks as any[])[0].status).toBe("完了");
  });

  it("タスクを削除しても保存されない", () => {
    const stored = storedProject();
    const incoming = clone(stored) as any;
    incoming.tasks = [incoming.tasks[0]];
    incoming.tasks[0].status = "完了";

    const result = applyTaskProgressOverlay(stored, incoming, NOW);

    expect((result.data.tasks as any[]).map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("日程を動かしても保存されない", () => {
    const stored = storedProject();
    const incoming = clone(stored) as any;
    incoming.tasks[1].start = "2026-10-01";
    incoming.tasks[1].end = "2026-10-05";
    incoming.tasks[1].status = "完了";

    const result = applyTaskProgressOverlay(stored, incoming, NOW);

    expect((result.data.tasks as any[])[1].start).toBe("2026-09-10");
    expect((result.data.tasks as any[])[1].end).toBe("2026-09-11");
    expect((result.data.tasks as any[])[1].status).toBe("完了");
  });

  it("タスク名・メモ・フェーズ・親子・依存・重要フラグを変えても保存されない", () => {
    const stored = storedProject();
    const incoming = clone(stored) as any;
    incoming.tasks[1].name = "改ざん";
    incoming.tasks[1].note = "改ざん";
    incoming.tasks[1].phase = "plan";
    incoming.tasks[1].parentId = "t1";
    incoming.tasks[1].dependencies = [];
    incoming.tasks[1].isImportant = true;
    incoming.tasks[1].assignee = "C";

    const result = applyTaskProgressOverlay(stored, incoming, NOW);
    const task = (result.data.tasks as any[])[1];

    expect(task.assignee).toBe("C");
    expect(task.name).toBe("撮影");
    expect(task.note).toBe("香盤確認");
    expect(task.phase).toBe("shoot");
    expect(task.parentId).toBe(null);
    expect(task.dependencies).toEqual(["t1"]);
    expect(task.isImportant).toBeUndefined();
  });

  it("案件名・クライアント名・開催月・フェーズ表・メンバー表・重要な日を変えても保存されない", () => {
    const stored = storedProject();
    const incoming = clone(stored) as any;
    incoming.title = "改ざん案件";
    incoming.client = "改ざん";
    incoming.eventMonth = "2027-01";
    incoming.phases = [];
    incoming.members = [];
    incoming.milestones = [];
    incoming.tasks[0].status = "完了";

    const result = applyTaskProgressOverlay(stored, incoming, NOW);

    expect(result.data.title).toBe("撮影案件");
    expect(result.data.client).toBe("サンプル");
    expect(result.data.eventMonth).toBe("2026-09");
    expect(result.data.phases).toHaveLength(2);
    expect(result.data.members).toHaveLength(1);
    expect(result.data.milestones).toHaveLength(1);
  });

  it("タスクの並び順を入れ替えても保存されない", () => {
    const stored = storedProject();
    const incoming = clone(stored) as any;
    incoming.tasks.reverse();
    incoming.tasks[0].status = "完了"; // 並べ替え後の先頭 = t2

    const result = applyTaskProgressOverlay(stored, incoming, NOW);

    expect((result.data.tasks as any[]).map((t) => t.id)).toEqual(["t1", "t2"]);
    expect((result.data.tasks as any[])[1].status).toBe("完了");
  });

  it("何も許可された変更が無ければ書き込み不要と判定する", () => {
    const stored = storedProject();
    const incoming = clone(stored) as any;
    incoming.title = "改ざん";
    incoming.tasks.push({ id: "t9", name: "x", status: "未着手", assignee: "A" });

    const result = applyTaskProgressOverlay(stored, incoming, NOW);

    expect(result.changed).toBe(false);
    expect(result.data).toBe(stored);
  });
});

describe("applyTaskProgressOverlay: 保存済みデータを土台にする(巻き戻さない)", () => {
  it("進行メンバーの手元が古くても、他の人が加えた変更を消さない", () => {
    // 進行メンバーが画面を開いたときのデータ
    const openedAt = storedProject();
    // その間に編集者がタスクを1件追加し、別タスクの日程を変えた
    const stored = storedProject() as any;
    stored.tasks.push({ id: "t3", phase: "shoot", name: "編集者が追加", start: "2026-09-15", end: "2026-09-16", status: "未着手", assignee: "A", dependencies: [], parentId: null });
    stored.tasks[0].end = "2026-09-05";

    // 進行メンバーは古い手元データのまま、状態だけ変えて保存した
    const incoming = clone(openedAt) as any;
    incoming.tasks[0].status = "完了";

    const result = applyTaskProgressOverlay(stored, incoming, NOW);

    expect((result.data.tasks as any[]).map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect((result.data.tasks as any[])[0].end).toBe("2026-09-05");
    expect((result.data.tasks as any[])[0].status).toBe("完了");
  });
});

describe("applyTaskProgressOverlay: 担当引継ぎの記録", () => {
  it("担当者を変えたときの引継ぎ記録を追加できる", () => {
    const stored = storedProject();
    const incoming = clone(stored) as any;
    incoming.tasks[0].assignee = "C";
    incoming.handoffs = [{ id: "h1", taskId: "t1", taskName: "企画", previousAssignee: "A", nextAssignee: "C", dueDate: "2026-09-03", isUnscheduled: false, changedBy: "C", createdAt: NOW, acknowledgedAt: null }];

    const result = applyTaskProgressOverlay(stored, incoming, NOW);

    expect(result.handoffAdditions).toBe(1);
    expect((result.data.handoffs as any[])[0].id).toBe("h1");
  });

  it("既にある引継ぎ記録を書き換えたり消したりはできない", () => {
    const stored = storedProject() as any;
    stored.handoffs = [{ id: "h1", taskId: "t1", taskName: "企画", previousAssignee: "A", nextAssignee: "B", createdAt: NOW, acknowledgedAt: null }];
    const incoming = clone(stored) as any;
    incoming.handoffs = [{ id: "h1", taskId: "t1", taskName: "改ざん", previousAssignee: "X", nextAssignee: "Y", createdAt: NOW, acknowledgedAt: null }];
    incoming.tasks[0].status = "完了";

    const result = applyTaskProgressOverlay(stored, incoming, NOW);

    expect(result.data.handoffs).toHaveLength(1);
    expect((result.data.handoffs as any[])[0].taskName).toBe("企画");
    expect((result.data.handoffs as any[])[0].nextAssignee).toBe("B");
  });

  it("未確認の引継ぎを確認済みにはできる(一方向のみ)", () => {
    const stored = storedProject() as any;
    stored.handoffs = [{ id: "h1", taskId: "t1", taskName: "企画", createdAt: NOW, acknowledgedAt: null }];
    const incoming = clone(stored) as any;
    incoming.handoffs[0].acknowledgedAt = NOW;

    const result = applyTaskProgressOverlay(stored, incoming, NOW);
    expect(result.handoffAcknowledgements).toBe(1);
    expect((result.data.handoffs as any[])[0].acknowledgedAt).toBe(NOW);

    // 確認済みを未確認へ戻すことはできない
    const revert = clone(result.data) as any;
    revert.handoffs[0].acknowledgedAt = null;
    const reverted = applyTaskProgressOverlay(result.data, revert, NOW);
    expect(reverted.changed).toBe(false);
  });
});

describe("applyTaskProgressOverlay: 壊れた入力", () => {
  it("保存済みデータがタスク配列を持たないときは何もしない", () => {
    expect(applyTaskProgressOverlay({}, { tasks: [{ id: "t1", status: "完了" }] }, NOW).changed).toBe(false);
    expect(applyTaskProgressOverlay(null, { tasks: [] }, NOW).changed).toBe(false);
    expect(applyTaskProgressOverlay(storedProject(), null, NOW).changed).toBe(false);
    expect(applyTaskProgressOverlay(storedProject(), "文字列", NOW).changed).toBe(false);
  });
});

describe("describeTaskProgressChange", () => {
  it("変更件数を日本語で要約する", () => {
    expect(describeTaskProgressChange({ data: {}, changed: true, statusChanges: 2, assigneeChanges: 1, handoffAdditions: 1, handoffAcknowledgements: 0 })).toBe("状態 2件 / 担当者 1件を更新しました。");
    expect(describeTaskProgressChange({ data: {}, changed: false, statusChanges: 0, assigneeChanges: 0, handoffAdditions: 0, handoffAcknowledgements: 0 })).toBe("更新はありませんでした。");
  });
});
