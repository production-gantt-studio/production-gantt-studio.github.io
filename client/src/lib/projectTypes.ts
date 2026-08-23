/**
 * 案件データの型は、案件画面（Home）とスマホ画面の両方が読む。片方にだけ置くと
 * もう片方から import できず、同じ形の型を二重に書くことになるので、ここを正とする。
 */
import type { HandoffRecord } from "@/lib/handoffQueue";
import type { TaskDateFormat } from "@/lib/taskDateDisplay";

export type Phase = string;

export type Status = "未着手" | "進行中" | "クライアント確認中" | "修正中" | "完了";

export type Task = {
  id: string;
  phase: Phase;
  name: string;
  start: string;
  end: string;
  status: Status;
  assignee: string;
  dependencies: string[];
  note?: string;
  isImportant?: boolean;
  isUnscheduled?: boolean;
  parentId?: string | null;
};

export type PhaseDefinition = {
  id: Phase;
  name: string;
  className: string;
};

export type Member = {
  id: string;
  name: string;
  role: string;
};

export type Milestone = {
  id: string;
  title: string;
  date: string;
};

export type ProjectData = {
  title: string;
  client: string;
  tasks: Task[];
  phases: PhaseDefinition[];
  phaseNames?: Record<string, string>;
  members: Member[];
  milestones: Milestone[];
  collapsedTaskIds: string[];
  collapsedPhaseIds?: string[];
  registeredMonth?: string;
  eventMonth?: string;
  taskDateFormat?: TaskDateFormat;
  importantCleanupVersion?: number;
  milestoneCleanupVersion?: number;
  handoffs?: HandoffRecord[];
  updatedAt: string;
};

export const statusOptions: Status[] = ["未着手", "進行中", "クライアント確認中", "修正中", "完了"];

export const statusMeta: Record<Status, { tone: string; dot: string }> = {
  未着手: { tone: "status-not-started", dot: "#8a95a5" },
  進行中: { tone: "status-active", dot: "#3976c7" },
  クライアント確認中: { tone: "status-review", dot: "#b77916" },
  修正中: { tone: "status-revision", dot: "#3976c7" },
  完了: { tone: "status-done", dot: "#287a5e" },
};
