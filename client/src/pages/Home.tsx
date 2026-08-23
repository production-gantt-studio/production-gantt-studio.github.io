/**
 * Edit Suite design reminder: treat time as the primary surface. Keep this page
 * concise, editorial, and operational; Signal Lime only marks actionable change.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useNarrowViewport } from "@/hooks/useNarrowViewport";
import MobileProject from "@/components/mobile/MobileProject";
import type { Member, Milestone, Phase, PhaseDefinition, ProjectData, Status, Task } from "@/lib/projectTypes";
import { statusMeta, statusOptions } from "@/lib/projectTypes";
import { trpc } from "@/lib/trpc";
import { getProjectAccessPresentation } from "@/lib/accessControl";
import { toAppUrl } from "@/lib/appUrl";
import { isShareLinkUnusable } from "@/lib/shareLinkState";
import { normalizeInlineName } from "@/lib/inlineEditing";
import { insertItemAfter } from "@/lib/phaseEditing";
import { selectPdfScopeTasks } from "@/lib/pdfScope";
import { buildTaskAlerts } from "@/lib/taskAlerts";
import { filterAlertsByTab, getAlertTabs, type AlertTab } from "@/lib/alertTabs";
import { summarizeAlerts } from "@/lib/alertSummary";
import { getHandoffTone } from "@/lib/handoffAttention";
import { acknowledgeHandoff, appendHandoff, getPendingHandoffs, type HandoffRecord } from "@/lib/handoffQueue";
import { getAssignedOpenTasks, type AssignedTaskScope } from "@/lib/assignedTasks";
import { isAccordionExpanded, toggleAccordionId } from "@/lib/accordionState";
import { toggleBulkSelectionMode } from "@/lib/bulkSelection";
import { getCompactStatusLabel, getStatusSummary } from "@/lib/statusPresentation";
import { getGanttBarDisplayMode } from "@/lib/ganttBarPresentation";
import { formatTaskDateRange, normalizeTaskDateFormat, taskDateFormatOptions, type TaskDateFormat } from "@/lib/taskDateDisplay";
import { toggleImportantFlag } from "@/lib/importantFlag";
import { reorderTaskGroup } from "@/lib/taskReorder";
import { normalizeSampleProjectIdentity } from "@/lib/sampleProjectIdentity";
import { syncParentTaskStatus } from "@/lib/parentTaskStatus";
import { exceedsEventMonth } from "@/lib/projectSchedulePeriod";
import { clampTaskColumnWidth, getTimelineDisplayMetrics, TASK_COLUMN_DEFAULT_WIDTH } from "@/lib/timelineLayout";
import {
  BellRing,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCopy,
  Download,
  Eye,
  Flag,
  FileText,
  FileUp,
  FolderKanban,
  GripVertical,
  Menu,
  Mail,
  MoreHorizontal,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Settings2,
  Share2,
  SlidersHorizontal,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const DAY_WIDTH = 34;
const STORAGE_KEY = "production-gantt-studio-v1";
const PROJECTS_STORAGE_KEY = "production-gantt-studio-projects-v1";
const VIEW_START = "2026-08-17";
const VIEW_DAYS = 42;

function localTodayIso() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const TODAY = localTodayIso();

const phaseClassNames = ["phase-pre", "phase-production", "phase-post", "phase-cyan", "phase-rose", "phase-slate"];

const defaultPhases: PhaseDefinition[] = [
  { id: "pre", name: "PRE-PRODUCTION", className: "phase-pre" },
  { id: "production", name: "PRODUCTION", className: "phase-production" },
  { id: "post", name: "POST-PRODUCTION", className: "phase-post" },
];

const legacyPhaseNames: Record<Phase, string> = {
  pre: "企画・設計",
  production: "撮影・現場",
  post: "編集・納品",
};

const initialMembers: Member[] = [
  { id: "m-producer", name: "佐藤 佑介", role: "プロデューサー" },
  { id: "m-director", name: "高橋 梓", role: "ディレクター" },
  { id: "m-pm", name: "山本 凌", role: "プロダクションマネージャー" },
  { id: "m-editor", name: "川村 綾", role: "エディター" },
];

const initialMilestones: Milestone[] = [];
const legacyDefaultMilestoneIds = new Set(["ms-client-review", "ms-shoot"]);

const initialTasks: Task[] = [
  { id: "t1", phase: "pre", name: "企画骨子", start: "2026-08-17", end: "2026-08-19", status: "完了", assignee: "佐藤 佑介", dependencies: [] },
  { id: "t2", phase: "pre", name: "コンペプレゼン", start: "2026-08-20", end: "2026-08-21", status: "完了", assignee: "佐藤 佑介", dependencies: ["t1"] },
  { id: "t3", phase: "pre", name: "絵コンテ・演出プラン", start: "2026-08-22", end: "2026-08-26", status: "クライアント確認中", assignee: "高橋 梓", dependencies: ["t2"], note: "9/26 午前までに初稿確認" },
  { id: "t4", phase: "production", name: "ロケハン", start: "2026-08-27", end: "2026-08-28", status: "進行中", assignee: "山本 凌", dependencies: ["t3"] },
  { id: "t5", phase: "production", name: "キャスト / 機材決定", start: "2026-08-27", end: "2026-08-30", status: "進行中", assignee: "佐藤 佑介", dependencies: ["t3"] },
  { id: "t6", phase: "production", name: "香盤・撮影準備", start: "2026-08-31", end: "2026-09-02", status: "未着手", assignee: "山本 凌", dependencies: ["t4", "t5"] },
  { id: "t7", phase: "production", name: "撮影", start: "2026-09-03", end: "2026-09-05", status: "未着手", assignee: "高橋 梓", dependencies: ["t6"] },
  { id: "t8", phase: "post", name: "素材整理", start: "2026-09-06", end: "2026-09-07", status: "未着手", assignee: "川村 綾", dependencies: ["t7"] },
  { id: "t9", phase: "post", name: "仮編集", start: "2026-09-08", end: "2026-09-11", status: "未着手", assignee: "川村 綾", dependencies: ["t8"] },
  { id: "t10", phase: "post", name: "クライアント確認", start: "2026-09-12", end: "2026-09-14", status: "未着手", assignee: "佐藤 佑介", dependencies: ["t9"] },
  { id: "t11", phase: "post", name: "修正編集", start: "2026-09-15", end: "2026-09-17", status: "未着手", assignee: "川村 綾", dependencies: ["t10"] },
  { id: "t12", phase: "post", name: "MA / カラーグレーディング", start: "2026-09-18", end: "2026-09-20", status: "未着手", assignee: "川村 綾", dependencies: ["t11"] },
  { id: "t13", phase: "post", name: "納品データ作成", start: "2026-09-21", end: "2026-09-22", status: "未着手", assignee: "佐藤 佑介", dependencies: ["t12"] },
  { id: "t14", phase: "post", name: "最終納品", start: "2026-09-23", end: "2026-09-23", status: "未着手", assignee: "佐藤 佑介", dependencies: ["t13"] },
];

const legacyDefaultImportantTaskIds = new Set(["t3", "t7", "t14"]);

const fallbackProject: ProjectData = {
  title: "動画案件サンプル",
  client: "Sample",
  tasks: initialTasks,
  phases: defaultPhases,
  members: initialMembers,
  milestones: initialMilestones,
  collapsedTaskIds: [],
  collapsedPhaseIds: [],
  handoffs: [],
  registeredMonth: "2026-08",
  eventMonth: "2026-09",
  taskDateFormat: "compact",
  updatedAt: "2026-08-19T08:42:00.000Z",
};

const builtInSampleProjects: Record<string, ProjectData> = {
  "sample-video-production": {
    title: "動画案件サンプル", client: "Sample", phases: [{ id: "pre", name: "企画・準備", className: "phase-pre" }, { id: "production", name: "制作・撮影", className: "phase-production" }, { id: "post", name: "編集・納品", className: "phase-post" }],
    members: [{ id: "video-producer", name: "プロデューサー", role: "プロデューサー" }, { id: "video-director", name: "ディレクター", role: "ディレクター" }, { id: "video-pm", name: "プロダクションマネージャー", role: "プロダクションマネージャー" }, { id: "video-editor", name: "エディター", role: "エディター" }],
    tasks: [
      { id: "video-1", phase: "pre", name: "企画骨子", start: "2026-09-01", end: "2026-09-02", status: "完了", assignee: "プロデューサー", dependencies: [] },
      { id: "video-2", phase: "pre", name: "コンペプレゼン", start: "2026-09-03", end: "2026-09-03", status: "完了", assignee: "プロデューサー", dependencies: ["video-1"] },
      { id: "video-3", phase: "pre", name: "絵コンテ・演出プラン", start: "2026-09-04", end: "2026-09-08", status: "進行中", assignee: "ディレクター", dependencies: ["video-2"] },
      { id: "video-4", phase: "production", name: "ロケハン", start: "2026-09-09", end: "2026-09-10", status: "クライアント確認中", assignee: "プロダクションマネージャー", dependencies: ["video-3"] },
      { id: "video-5", phase: "production", name: "キャスト・機材決定", start: "2026-09-09", end: "2026-09-11", status: "未着手", assignee: "プロデューサー", dependencies: ["video-3"] },
      { id: "video-6", phase: "production", name: "香盤・撮影準備", start: "2026-09-12", end: "2026-09-14", status: "未着手", assignee: "プロダクションマネージャー", dependencies: ["video-4", "video-5"] },
      { id: "video-7", phase: "production", name: "撮影", start: "2026-09-15", end: "2026-09-16", status: "未着手", assignee: "ディレクター", dependencies: ["video-6"], isImportant: true },
      { id: "video-8", phase: "post", name: "素材整理", start: "2026-09-17", end: "2026-09-17", status: "未着手", assignee: "エディター", dependencies: ["video-7"] },
      { id: "video-9", phase: "post", name: "仮編集", start: "2026-09-18", end: "2026-09-21", status: "未着手", assignee: "エディター", dependencies: ["video-8"] },
      { id: "video-10", phase: "post", name: "クライアント確認", start: "2026-09-22", end: "2026-09-23", status: "未着手", assignee: "プロデューサー", dependencies: ["video-9"] },
      { id: "video-11", phase: "post", name: "修正編集", start: "2026-09-24", end: "2026-09-25", status: "未着手", assignee: "エディター", dependencies: ["video-10"] },
      { id: "video-12", phase: "post", name: "MA・カラー調整", start: "2026-09-26", end: "2026-09-27", status: "未着手", assignee: "エディター", dependencies: ["video-11"] },
      { id: "video-13", phase: "post", name: "納品データ作成", start: "2026-09-28", end: "2026-09-28", status: "未着手", assignee: "プロデューサー", dependencies: ["video-12"] },
      { id: "video-14", phase: "post", name: "最終納品", start: "2026-09-29", end: "2026-09-29", status: "未着手", assignee: "プロデューサー", dependencies: ["video-13"] },
    ],
    milestones: [{ id: "video-shoot-day", title: "撮影日", date: "2026-09-15" }], collapsedTaskIds: [], collapsedPhaseIds: [], handoffs: [], registeredMonth: "2026-09", eventMonth: "2026-09", taskDateFormat: "compact", updatedAt: "2026-08-01T08:55:00.000Z",
  },
  "sample-event-production": {
    title: "イベント案件サンプル", client: "Sample", phases: [{ id: "pre", name: "企画・準備", className: "phase-pre" }, { id: "production", name: "制作・実施", className: "phase-production" }, { id: "post", name: "事後対応", className: "phase-post" }],
    members: [{ id: "event-producer", name: "プロデューサー", role: "プロデューサー" }, { id: "event-director", name: "ディレクター", role: "ディレクター" }, { id: "event-designer", name: "デザイナー", role: "デザイナー" }],
    tasks: [
      { id: "event-1", phase: "pre", name: "イベント概要確定", start: "2026-09-01", end: "2026-09-03", status: "完了", assignee: "プロデューサー", dependencies: [] },
      { id: "event-2", phase: "pre", name: "会場レイアウト作成", start: "2026-09-04", end: "2026-09-08", status: "進行中", assignee: "ディレクター", dependencies: ["event-1"] },
      { id: "event-3", phase: "pre", name: "出演者・協力会社確認", start: "2026-09-09", end: "2026-09-11", status: "クライアント確認中", assignee: "プロデューサー", dependencies: ["event-2"] },
      { id: "event-4", phase: "production", name: "運営台本・進行表", start: "2026-09-14", end: "2026-09-18", status: "未着手", assignee: "ディレクター", dependencies: ["event-3"] },
      { id: "event-5", phase: "production", name: "設営", start: "2026-09-24", end: "2026-09-24", status: "未着手", assignee: "プロデューサー", dependencies: ["event-4"] },
      { id: "event-6", phase: "production", name: "本番", start: "2026-09-25", end: "2026-09-25", status: "未着手", assignee: "プロデューサー", dependencies: ["event-5"], isImportant: true },
      { id: "event-7", phase: "post", name: "撤去・精算", start: "2026-09-26", end: "2026-09-28", status: "未着手", assignee: "プロデューサー", dependencies: ["event-6"] },
      { id: "event-8", phase: "post", name: "実施報告書", start: "2026-09-29", end: "2026-10-02", status: "未着手", assignee: "ディレクター", dependencies: ["event-7"] },
    ],
    milestones: [{ id: "event-day", title: "開催日", date: "2026-09-25" }], collapsedTaskIds: [], collapsedPhaseIds: [], handoffs: [], registeredMonth: "2026-09", eventMonth: "2026-10", taskDateFormat: "compact", updatedAt: "2026-08-01T09:00:00.000Z",
  },
  "sample-graphic-production": {
    title: "グラフィック案件サンプル", client: "Sample", phases: [{ id: "pre", name: "企画・方向性", className: "phase-pre" }, { id: "production", name: "デザイン制作", className: "phase-production" }, { id: "post", name: "入稿・納品", className: "phase-post" }],
    members: [{ id: "graphic-producer", name: "プロデューサー", role: "プロデューサー" }, { id: "graphic-designer", name: "デザイナー", role: "デザイナー" }],
    tasks: [
      { id: "graphic-1", phase: "pre", name: "制作目的・要件整理", start: "2026-09-01", end: "2026-09-02", status: "完了", assignee: "プロデューサー", dependencies: [] },
      { id: "graphic-2", phase: "pre", name: "ビジュアル方向性提案", start: "2026-09-03", end: "2026-09-08", status: "進行中", assignee: "デザイナー", dependencies: ["graphic-1"] },
      { id: "graphic-3", phase: "pre", name: "初稿確認", start: "2026-09-09", end: "2026-09-10", status: "クライアント確認中", assignee: "プロデューサー", dependencies: ["graphic-2"] },
      { id: "graphic-4", phase: "production", name: "デザイン制作", start: "2026-09-11", end: "2026-09-17", status: "未着手", assignee: "デザイナー", dependencies: ["graphic-3"] },
      { id: "graphic-5", phase: "production", name: "コピー・素材反映", start: "2026-09-18", end: "2026-09-21", status: "未着手", assignee: "デザイナー", dependencies: ["graphic-4"] },
      { id: "graphic-6", phase: "post", name: "最終校正", start: "2026-09-22", end: "2026-09-23", status: "未着手", assignee: "プロデューサー", dependencies: ["graphic-5"], isImportant: true },
      { id: "graphic-7", phase: "post", name: "入稿データ作成", start: "2026-09-24", end: "2026-09-25", status: "未着手", assignee: "デザイナー", dependencies: ["graphic-6"] },
      { id: "graphic-8", phase: "post", name: "納品", start: "2026-09-26", end: "2026-09-26", status: "未着手", assignee: "プロデューサー", dependencies: ["graphic-7"] },
    ],
    milestones: [{ id: "graphic-delivery", title: "納品日", date: "2026-09-26" }], collapsedTaskIds: [], collapsedPhaseIds: [], handoffs: [], registeredMonth: "2026-09", eventMonth: "2026-09", taskDateFormat: "compact", updatedAt: "2026-08-01T09:05:00.000Z",
  },
};

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function addWeeks(value: string, weeks: number) {
  return addDays(value, weeks * 7);
}

function startOfMonth(value: string) {
  const date = parseDate(value);
  date.setDate(1);
  return isoDate(date);
}

function endOfMonth(value: string) {
  const date = parseDate(value);
  date.setMonth(date.getMonth() + 1, 0);
  return isoDate(date);
}

function addMonths(value: string, months: number) {
  const date = parseDate(value);
  date.setMonth(date.getMonth() + months);
  return isoDate(date);
}

function diffMonths(start: string, end: string) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  return (endDate.getFullYear() - startDate.getFullYear()) * 12 + endDate.getMonth() - startDate.getMonth();
}

function diffDays(start: string, end: string) {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000);
}

function formatMonthDay(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(parseDate(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(parseDate(value));
}

function todayPosition() {
  return Math.max(0, Math.min(VIEW_DAYS - 1, diffDays(VIEW_START, "2026-08-26")));
}

function restoreProject(): ProjectData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as ProjectData;
  } catch {
    // A malformed browser value should not block the planning workspace.
  }
  return fallbackProject;
}

function restoreManagedProject(projectId: string | null): ProjectData {
  if (!projectId) return restoreProject();
  try {
    const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);
    const collection = stored ? JSON.parse(stored) as Array<{ id: string; project: ProjectData }> : [];
    const existing = collection.find((item) => item.id === projectId)?.project;
    if (existing) return existing;
    const builtIn = builtInSampleProjects[projectId];
    if (builtIn) return JSON.parse(JSON.stringify(builtIn)) as ProjectData;
    return restoreProject();
  } catch {
    const builtIn = builtInSampleProjects[projectId];
    return builtIn ? JSON.parse(JSON.stringify(builtIn)) as ProjectData : restoreProject();
  }
}

function normalizeProject(project: Partial<ProjectData> & { tasks: Task[] }): ProjectData {
  const identity = normalizeSampleProjectIdentity(project.title ?? fallbackProject.title, project.client ?? fallbackProject.client, project.tasks.length);
  const existingMembers = project.members?.length ? project.members : initialMembers;
  const knownNames = new Set(existingMembers.map((member) => member.name));
  const memberNamesFromTasks = project.tasks.map((task) => task.assignee).filter((name) => name && name !== "未設定");
  const missingMembers = Array.from(new Set(memberNamesFromTasks.filter((name) => !knownNames.has(name)))).map((name) => ({
    id: `m-import-${name}`,
    name,
    role: "担当者",
  }));
  const declaredPhases = Array.isArray(project.phases) && project.phases.length ? project.phases : defaultPhases;
  const phaseIds = new Set<string>();
  const phases = declaredPhases.reduce<PhaseDefinition[]>((items, phase, index) => {
    const id = phase.id?.trim() || `phase-${index + 1}`;
    if (phaseIds.has(id)) return items;
    phaseIds.add(id);
    const legacyName = project.phaseNames?.[id];
    const defaultPhase = defaultPhases.find((item) => item.id === id);
    const name = phase.name?.trim() || legacyName || defaultPhase?.name || "NEW PHASE";
    items.push({ id, name: legacyName === legacyPhaseNames[id] ? defaultPhase?.name ?? name : name, className: phase.className || phaseClassNames[index % phaseClassNames.length] });
    return items;
  }, []);
  Array.from(new Set(project.tasks.map((task) => task.phase))).forEach((phaseId) => {
    if (!phaseIds.has(phaseId)) {
      phaseIds.add(phaseId);
      phases.push({ id: phaseId, name: project.phaseNames?.[phaseId] || "IMPORTED PHASE", className: phaseClassNames[phases.length % phaseClassNames.length] });
    }
  });
  return {
    title: identity.title,
    client: identity.client,
    tasks: project.tasks.map((task) => ({ ...task, dependencies: [...task.dependencies], isImportant: project.importantCleanupVersion !== 1 && legacyDefaultImportantTaskIds.has(task.id) ? false : Boolean(task.isImportant), isUnscheduled: Boolean(task.isUnscheduled), parentId: task.parentId || null })),
    phases,
    members: [...existingMembers.map((member) => ({ ...member })), ...missingMembers],
    milestones: (project.milestones ?? initialMilestones)
      .filter((milestone) => project.milestoneCleanupVersion === 1 || !legacyDefaultMilestoneIds.has(milestone.id))
      .map((milestone, index) => ({ id: milestone.id || `milestone-${index + 1}`, title: milestone.title || "IMPORTANT DATE", date: milestone.date || TODAY })),
    collapsedTaskIds: (project.collapsedTaskIds ?? []).filter((id) => project.tasks.some((task) => task.id === id && !task.parentId)),
    collapsedPhaseIds: (project.collapsedPhaseIds ?? []).filter((id) => phaseIds.has(id)),
    registeredMonth: /^\d{4}-\d{2}$/.test(project.registeredMonth ?? "") ? project.registeredMonth : (project.updatedAt ?? VIEW_START).slice(0, 7),
    eventMonth: /^\d{4}-\d{2}$/.test(project.eventMonth ?? "") ? project.eventMonth : project.tasks.filter((task) => !task.isUnscheduled).map((task) => task.end).sort().at(-1)?.slice(0, 7),
    taskDateFormat: normalizeTaskDateFormat(project.taskDateFormat),
    importantCleanupVersion: 1,
    milestoneCleanupVersion: 1,
    handoffs: (project.handoffs ?? []).filter((handoff) => handoff.id && handoff.taskId && handoff.taskName && handoff.createdAt).map((handoff) => ({ ...handoff, acknowledgedAt: handoff.acknowledgedAt ?? null })),
    updatedAt: project.updatedAt ?? new Date().toISOString(),
  };
}

function dependencyChainIds(source: Task[], originId: string) {
  const links = new Map<string, Set<string>>();
  const connect = (from: string, to: string) => {
    if (!links.has(from)) links.set(from, new Set());
    links.get(from)!.add(to);
  };

  source.forEach((task) => {
    task.dependencies.forEach((dependencyId) => {
      connect(task.id, dependencyId);
      connect(dependencyId, task.id);
    });
  });

  const connected = new Set<string>([originId]);
  const queue = [originId];
  while (queue.length) {
    const currentId = queue.shift()!;
    links.get(currentId)?.forEach((nextId) => {
      if (!connected.has(nextId)) {
        connected.add(nextId);
        queue.push(nextId);
      }
    });
  }
  return connected;
}

function shiftDependencyChain(source: Task[], changedId: string, delta: number) {
  if (!delta) return source;
  const connected = dependencyChainIds(source, changedId);
  return source.map((task) => (
    connected.has(task.id) && !task.isUnscheduled
      ? { ...task, start: addDays(task.start, delta), end: addDays(task.end, delta), dependencies: [...task.dependencies] }
      : { ...task, dependencies: [...task.dependencies] }
  ));
}

function cascadeSuccessors(source: Task[], changedId: string) {
  const updated = source.map((task) => ({ ...task, dependencies: [...task.dependencies] }));
  const queue = [changedId];
  const visited = new Set<string>();

  while (queue.length) {
    const predecessorId = queue.shift()!;
    if (visited.has(predecessorId)) continue;
    visited.add(predecessorId);

    updated
      .filter((task) => task.dependencies.includes(predecessorId) && !task.isUnscheduled)
      .forEach((dependent) => {
        const predecessorEnds = dependent.dependencies
          .map((id) => updated.find((task) => task.id === id && !task.isUnscheduled)?.end)
          .filter((value): value is string => Boolean(value));
        const requiredStart = addDays(predecessorEnds.sort().at(-1)!, 1);
        const duration = diffDays(dependent.start, dependent.end);
        if (dependent.start !== requiredStart) {
          dependent.start = requiredStart;
          dependent.end = addDays(requiredStart, duration);
          queue.push(dependent.id);
        }
      });
  }
  return updated;
}

function cascadeSelectedSuccessors(source: Task[], selectedIds: Set<string>) {
  let updated = source.map((task) => ({ ...task, dependencies: [...task.dependencies] }));
  selectedIds.forEach((id) => {
    updated = cascadeSuccessors(updated, id).map((task) => selectedIds.has(task.id) ? source.find((item) => item.id === task.id) ?? task : task);
  });
  return updated;
}

function orderTasksByHierarchy(source: Task[]) {
  const roots = source.filter((task) => !task.parentId || !source.some((candidate) => candidate.id === task.parentId));
  return roots.flatMap((task) => [task, ...source.filter((candidate) => candidate.parentId === task.id)]);
}

function downloadFile(contents: string, filename: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  // The useAuth hook provides authentication state.
  // To implement login/logout, call logout(), or start login from an event
  // handler: onClick={() => startLogin()} (imported from "@/const"). Never call
  // startLogin() during render (no href={startLogin()}) — it mints a one-time
  // nonce cookie and must run only at the moment of navigation.
  const { isAuthenticated, user } = useAuth();

  // 760px以下は専用のスマホ画面に差し替える。それより広い画面はこれまでのまま。
  const isNarrow = useNarrowViewport();
  const [, setLocation] = useLocation();
  const shareToken = new URLSearchParams(window.location.search).get("share");
  const sharedView = Boolean(shareToken);
  const blankPreview = new URLSearchParams(window.location.search).get("start") === "blank";
  const startWithTemplate = new URLSearchParams(window.location.search).get("template") === "advertising";
  const projectId = new URLSearchParams(window.location.search).get("id");
  const inviteToken = new URLSearchParams(window.location.search).get("invite");
  const initialProject = normalizeProject(blankPreview ? { ...fallbackProject, tasks: [] } : restoreManagedProject(projectId));
  const [project, setProject] = useState<ProjectData>(initialProject);
  const remoteProjectQuery = trpc.projects.get.useQuery({ publicId: projectId ?? "" }, { enabled: Boolean(projectId && isAuthenticated) });
  const remoteShareQuery = trpc.projects.sharePreview.useQuery({ token: shareToken ?? "" }, { enabled: Boolean(shareToken) });
  const viewerInviteQuery = trpc.projects.invitePreview.useQuery({ token: inviteToken ?? "" }, { enabled: Boolean(inviteToken) });
  const remoteUpdateProject = trpc.projects.update.useMutation();
  const projectMembersQuery = trpc.projects.members.useQuery({ publicId: projectId ?? "" }, { enabled: Boolean(projectId && isAuthenticated && remoteProjectQuery.data?.project) });
  const projectActivityQuery = trpc.projects.activity.useQuery({ publicId: projectId ?? "" }, { enabled: Boolean(projectId && isAuthenticated && remoteProjectQuery.data?.project) });
  const inviteProjectMember = trpc.projects.invite.useMutation();
  const revokeProjectMember = trpc.projects.revokeInvite.useMutation();
  const createProjectShare = trpc.projects.createShare.useMutation();
  const revokeProjectShare = trpc.projects.revokeShare.useMutation();
  const projectSharesQuery = trpc.projects.shares.useQuery({ publicId: projectId ?? "" }, { enabled: Boolean(projectId && isAuthenticated && remoteProjectQuery.data?.accessRole !== "viewer") });
  const accessPresentation = getProjectAccessPresentation({ accountRole: user?.role, projectAccessRole: remoteProjectQuery.data?.accessRole, sharedView, invitePreview: Boolean(inviteToken) });
  const { readOnly, roleLabel, roleDescription, canEditInline, showDetailSettings } = accessPresentation;
  const [activePhase, setActivePhase] = useState<Phase | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | "outside">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInspector, setShowInspector] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [workspacePanel, setWorkspacePanel] = useState<"members" | "phases" | "project" | "share" | "activity" | null>(() => {
    const panel = new URLSearchParams(window.location.search).get("panel");
    return panel === "activity" || panel === "project" ? panel : null;
  });
  const [shareCopied, setShareCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [timelineMode, setTimelineMode] = useState<"days" | "weeks" | "months">(() => {
    const timeline = new URLSearchParams(window.location.search).get("timeline");
    return timeline === "weeks" || timeline === "months" ? timeline : "days";
  });
  const [alertTab, setAlertTab] = useState<AlertTab>("all");
  const [alertExpanded, setAlertExpanded] = useState(false);
  const [showTaskFilters, setShowTaskFilters] = useState(false);
  const [showTaskUtilities, setShowTaskUtilities] = useState(false);
  const [myTasksAssignee, setMyTasksAssignee] = useState("");
  const [myTasksScope, setMyTasksScope] = useState<AssignedTaskScope>("all");
  const [dayRangeDays, setDayRangeDays] = useState(VIEW_DAYS);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [pdfScope, setPdfScope] = useState<"all" | "phase" | "selected">("all");
  const [barGesture, setBarGesture] = useState<{ id: string; mode: "move" | "start" | "end"; originX: number; start: string; end: string; snapshot: Task[] } | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<{ tasks: Task[]; label: string } | null>(null);
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [editingGanttTaskId, setEditingGanttTaskId] = useState<string | null>(null);
  const [taskColumnWidth, setTaskColumnWidth] = useState(() => {
    const stored = Number(localStorage.getItem("production-gantt-task-column-width"));
    return Number.isFinite(stored) ? clampTaskColumnWidth(stored) : TASK_COLUMN_DEFAULT_WIDTH;
  });
  const barGestureMovedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const pdfExportRef = useRef<HTMLDivElement>(null);

  const tasks = project.tasks;
  const members = project.members;
  const phases = project.phases;
  const milestones = project.milestones;

  useEffect(() => {
    const remote = remoteProjectQuery.data?.project;
    if (!remote) return;
    try { setProject(normalizeProject(JSON.parse(remote.data) as ProjectData)); } catch { toast.error("案件データを読み込めませんでした。"); }
  }, [remoteProjectQuery.data]);
  useEffect(() => {
    const remote = viewerInviteQuery.data?.project;
    if (!remote) return;
    try { setProject(normalizeProject(JSON.parse(remote.data) as ProjectData)); } catch { toast.error("招待された案件を読み込めませんでした。"); }
  }, [viewerInviteQuery.data]);
  useEffect(() => {
    const remote = remoteShareQuery.data?.project;
    if (!remote) return;
    try { setProject(normalizeProject(JSON.parse(remote.data) as ProjectData)); } catch { toast.error("共有された案件データを読み込めませんでした。"); }
  }, [remoteShareQuery.data]);
  const phaseById = useMemo(() => new Map(phases.map((phase) => [phase.id, phase])), [phases]);
  const phaseName = (phase: Phase) => phaseById.get(phase)?.name || "UNTITLED PHASE";
  const phaseClass = (phase: Phase) => phaseById.get(phase)?.className || "phase-slate";
  const selectedTask = tasks.find((task) => task.id === selectedId) ?? null;
  const pdfTasks = useMemo(() => selectPdfScopeTasks(tasks, pdfScope, activePhase, selectedTaskIds), [tasks, pdfScope, selectedTaskIds, activePhase]);
  const pdfPhases = useMemo(() => phases.filter((phase) => pdfTasks.some((task) => task.phase === phase.id)), [phases, pdfTasks]);
  const pdfScopeLabel = pdfScope === "selected" ? "選択タスク" : pdfScope === "phase" && activePhase !== "all" ? `${phaseName(activePhase)}のタスク` : "全タスク";
  const childTasksByParent = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.filter((task) => task.parentId).forEach((task) => {
      const children = map.get(task.parentId!) ?? [];
      children.push(task);
      map.set(task.parentId!, children);
    });
    return map;
  }, [tasks]);
  // 親子の完了率は通常画面・共有・PDFへ出さない。状態だけを表示する。
  const parentProgressById = useMemo(() => new Map<string, number>(), []);
  const parentTaskIds = useMemo(() => new Set(childTasksByParent.keys()), [childTasksByParent]);
  const assignees = useMemo(() => Array.from(new Set([...members.map((member) => member.name), ...tasks.map((task) => task.assignee)])).filter(Boolean), [members, tasks]);
  useEffect(() => {
    if (myTasksAssignee && assignees.includes(myTasksAssignee)) return;
    const signedInName = user?.name ?? "";
    setMyTasksAssignee(assignees.includes(signedInName) ? signedInName : assignees[0] ?? "");
  }, [assignees, myTasksAssignee, user?.name]);
  const scheduledTasks = useMemo(() => tasks.filter((task) => !task.isUnscheduled), [tasks]);
  const progressTasks = useMemo(() => tasks.filter((task) => !parentTaskIds.has(task.id)), [tasks, parentTaskIds]);
  const projectProgress = progressTasks.length ? Math.round((progressTasks.filter((task) => task.status === "完了").length / progressTasks.length) * 100) : 0;
  const statusSummary = useMemo(() => getStatusSummary(tasks.map((task) => task.status)), [tasks]);
  const registrationMonth = /^\d{4}-\d{2}$/.test(project.registeredMonth ?? "") ? project.registeredMonth! : VIEW_START.slice(0, 7);
  const scheduleRange = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" });
    const fallbackMonth = scheduledTasks.length ? [...scheduledTasks].sort((a, b) => a.end.localeCompare(b.end)).at(-1)!.end.slice(0, 7) : registrationMonth;
    const endMonth = project.eventMonth || fallbackMonth;
    return `登録 ${formatter.format(parseDate(`${registrationMonth}-01`))} — ${project.eventMonth ? "開催" : "予定終了"} ${formatter.format(parseDate(`${endMonth}-01`))}`;
  }, [project.eventMonth, registrationMonth, scheduledTasks]);
  const timelineStartDate = `${registrationMonth}-01`;
  const lastTaskEnd = useMemo(() => scheduledTasks.length ? [...scheduledTasks].sort((a, b) => a.end.localeCompare(b.end)).at(-1)!.end : VIEW_START, [scheduledTasks]);
  const timelineEndMonth = project.eventMonth && project.eventMonth >= registrationMonth ? project.eventMonth : startOfMonth(lastTaskEnd).slice(0, 7);
  const timelineEndDate = endOfMonth(`${timelineEndMonth}-01`);
  const projectStartMonth = timelineStartDate;
  const dailyRangeLimit = Math.max(1, diffDays(projectStartMonth, timelineEndDate) + 1);
  const monthTimelineStart = projectStartMonth;
  const monthlyUnitCount = Math.max(1, diffMonths(monthTimelineStart, `${timelineEndMonth}-01`) + 1);
  const isOutsideProjectPeriod = (end: string) => exceedsEventMonth(end, timelineEndDate);
  const outOfPeriodTasks = useMemo(() => tasks.filter((task) => !task.isUnscheduled && isOutsideProjectPeriod(task.end)), [tasks, timelineEndDate]);
  const outOfPeriodTaskIds = useMemo(() => new Set(outOfPeriodTasks.map((task) => task.id)), [outOfPeriodTasks]);
  const visibleTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const matchesPhase = activePhase === "all" || task.phase === activePhase;
        const matchesAssignee = assigneeFilter === "all" || task.assignee === assigneeFilter;
        const matchesStatus = statusFilter === "all" || task.status === statusFilter;
        const matchesPeriod = periodFilter === "all" || outOfPeriodTaskIds.has(task.id);
        const matchesSearch = task.name.toLowerCase().includes(search.toLowerCase());
        return matchesPhase && matchesAssignee && matchesStatus && matchesPeriod && matchesSearch;
      }),
    [tasks, activePhase, assigneeFilter, statusFilter, periodFilter, outOfPeriodTaskIds, search],
  );
  const visibleDayCount = Math.min(dayRangeDays, dailyRangeLimit);
  const timelineMetrics = getTimelineDisplayMetrics(timelineMode, visibleDayCount);
  const timelineUnitWidth = timelineMetrics.unitWidth;
  const timelineUnitCount = timelineMetrics.unitCount;
  const timelineUnits = useMemo(() => Array.from({ length: timelineUnitCount }, (_, index) => timelineMode === "weeks" ? addWeeks(projectStartMonth, index) : addDays(projectStartMonth, index)), [timelineUnitCount, timelineMode, projectStartMonth]);
  const timelineMonths = useMemo(() => timelineUnits.reduce<{ label: string; count: number }[]>((items, date) => {
    const label = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(parseDate(date));
    const current = items.at(-1);
    if (current?.label === label) current.count += 1;
    else items.push({ label, count: 1 });
    return items;
  }, []), [timelineUnits]);
  const timelineOffsetForDate = (date: string) => diffDays(projectStartMonth, date) / timelineMetrics.daysPerUnit;
  const timelineDateForIndex = (index: number) => addDays(projectStartMonth, index * timelineMetrics.daysPerUnit);
  const timelineDurationForTask = (task: Task) => (diffDays(task.start, task.end) + 1) / timelineMetrics.daysPerUnit;
  const shiftTimelineDate = (date: string, days: number) => addDays(date, days);
  const todayOffset = Math.max(0, Math.min(timelineUnitCount - 1, timelineOffsetForDate(TODAY)));
  const taskAlerts = useMemo(() => buildTaskAlerts(tasks, TODAY), [tasks]);
  const announcementItems = useMemo(() => [
    ...taskAlerts,
    ...milestones.filter((milestone) => diffDays(TODAY, milestone.date) >= 0).map((milestone) => ({ id: milestone.id, type: "重要日" as const, title: milestone.title, date: milestone.date, taskId: null, isUnscheduled: false, assignee: "", priority: 4 })),
  ].sort((a, b) => a.priority - b.priority || a.date.localeCompare(b.date)), [milestones, taskAlerts]);
  const alertTabs = useMemo(() => getAlertTabs([...assignees, ...taskAlerts.map((alert) => alert.assignee)]), [assignees, taskAlerts]);
  const visibleAnnouncementItems = useMemo(() => filterAlertsByTab(announcementItems, alertTab).slice(0, 5), [announcementItems, alertTab]);
  const alertSummary = useMemo(() => summarizeAlerts(announcementItems), [announcementItems]);
  const pendingHandoffs = useMemo(() => getPendingHandoffs(project.handoffs ?? []), [project.handoffs]);
  const assignedOpenTasks = useMemo(() => getAssignedOpenTasks(tasks, myTasksAssignee, TODAY, myTasksScope), [tasks, myTasksAssignee, myTasksScope]);
  const showExpandedAlerts = alertSummary.hasUrgent || alertExpanded;
  const monthlyWeekSegments = useMemo(() => {
    if (timelineMode !== "months") return [];
    const segments: Array<{ id: string; label: string; width: number }> = [];
    let monthStart = projectStartMonth;
    while (monthStart <= timelineEndDate) {
      const visibleEnd = endOfMonth(monthStart) < timelineEndDate ? endOfMonth(monthStart) : timelineEndDate;
      let weekStart = monthStart;
      let weekIndex = 1;
      while (weekStart <= visibleEnd) {
        const weekEnd = addDays(weekStart, Math.min(6, diffDays(weekStart, visibleEnd)));
        segments.push({ id: `${weekStart}-${weekEnd}`, label: `${weekIndex}週`, width: (diffDays(weekStart, weekEnd) + 1) * timelineUnitWidth });
        weekStart = addDays(weekStart, 7);
        weekIndex += 1;
      }
      monthStart = addMonths(monthStart, 1);
    }
    return segments;
  }, [timelineMode, projectStartMonth, timelineEndDate, timelineUnitWidth]);

  useEffect(() => {
    if (!alertTabs.includes(alertTab)) setAlertTab("all");
  }, [alertTabs, alertTab]);

  useEffect(() => {
    if (!outOfPeriodTasks.length || readOnly) return;
    toast.warning(`開催月を超える日程が ${outOfPeriodTasks.length} 件あります。開催月またはタスク日程を確認してください。`);
  }, [outOfPeriodTasks, readOnly]);

  useEffect(() => {
    if (!readOnly && !blankPreview) {
      const nextProject = { ...project, updatedAt: new Date().toISOString() };
      if (isAuthenticated && projectId && remoteProjectQuery.data?.project) {
        const timer = window.setTimeout(() => {
          remoteUpdateProject.mutate({ publicId: projectId, title: nextProject.title, client: nextProject.client, eventMonth: nextProject.eventMonth ?? null, data: JSON.stringify(nextProject) });
        }, 450);
        return () => window.clearTimeout(timer);
      }
      if (projectId) {
        try {
          const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);
          const collection = stored ? JSON.parse(stored) as Array<{ id: string; project: ProjectData; createdAt: string }> : [];
          const nextCollection = collection.some((item) => item.id === projectId)
            ? collection.map((item) => item.id === projectId ? { ...item, project: nextProject } : item)
            : [...collection, { id: projectId, project: nextProject, createdAt: nextProject.updatedAt }];
          localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(nextCollection));
        } catch {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProject));
        }
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProject));
      }
    }
  }, [project, readOnly, blankPreview, isAuthenticated, projectId, remoteProjectQuery.data?.project]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("task-search")?.focus();
      }
      if (event.key === "Escape") {
        setShowInspector(false);
        setShowShortcuts(false);
        setWorkspacePanel(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const applyBarGesture = (current: ProjectData, gesture: NonNullable<typeof barGesture>, unitDelta: number) => {
    const original = gesture.snapshot.find((task) => task.id === gesture.id);
    if (!original || !unitDelta) return current;
    if (gesture.mode === "move") {
      const nextStart = shiftTimelineDate(gesture.start, unitDelta);
      return { ...current, tasks: shiftDependencyChain(gesture.snapshot, gesture.id, diffDays(original.start, nextStart)) };
    }
    if (gesture.mode === "start") {
      const nextStart = shiftTimelineDate(gesture.start, unitDelta);
      if (nextStart > original.end) return current;
      const resized = gesture.snapshot.map((task) => task.id === gesture.id ? { ...task, start: nextStart } : task);
      return { ...current, tasks: shiftDependencyChain(resized, gesture.id, diffDays(original.start, nextStart)) };
    }
    const nextEnd = shiftTimelineDate(gesture.end, unitDelta);
    if (nextEnd < original.start) return current;
    const resized = gesture.snapshot.map((task) => task.id === gesture.id ? { ...task, end: nextEnd } : task);
    return { ...current, tasks: cascadeSuccessors(resized, gesture.id) };
  };

  useEffect(() => {
    if (!barGesture) return;
    const getDelta = (clientX: number) => {
      const dayPixelWidth = timelineUnitWidth / timelineMetrics.daysPerUnit;
      return Math.round((clientX - barGesture.originX) / dayPixelWidth);
    };
    const onMove = (event: PointerEvent) => {
      const delta = getDelta(event.clientX);
      if (!delta) return;
      barGestureMovedRef.current = true;
      setProject((current) => applyBarGesture(current, barGesture, delta));
    };
    const onUp = (event: PointerEvent) => {
      const delta = getDelta(event.clientX);
      if (delta) {
        const preview = applyBarGesture({ ...project, tasks: barGesture.snapshot }, barGesture, delta);
        const changed = preview.tasks.find((task) => task.id === barGesture.id);
        if (changed && isOutsideProjectPeriod(changed.end)) toast.warning("操作後の日程が開催月を超えています。");
        setProject((current) => applyBarGesture(current, barGesture, delta));
        toast.success(barGesture.mode === "move" ? "タスクと連動工程を移動しました" : "タスク期間を更新しました");
      }
      setBarGesture(null);
      window.setTimeout(() => { barGestureMovedRef.current = false; }, 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [barGesture, timelineUnitWidth, timelineMetrics.daysPerUnit]);

  const startTaskColumnResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const originX = event.clientX;
    const originWidth = taskColumnWidth;
    const onMove = (moveEvent: PointerEvent) => setTaskColumnWidth(clampTaskColumnWidth(originWidth + moveEvent.clientX - originX));
    const onUp = () => {
      setTaskColumnWidth((width) => {
        localStorage.setItem("production-gantt-task-column-width", String(width));
        return width;
      });
      window.removeEventListener("pointermove", onMove);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const startBarGesture = (event: React.PointerEvent<HTMLElement>, task: Task, mode: "move" | "start" | "end") => {
    if (readOnly || task.isUnscheduled || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    barGestureMovedRef.current = false;
    setUndoSnapshot({ tasks: tasks.map((item) => ({ ...item, dependencies: [...item.dependencies] })), label: mode === "move" ? "タスク移動" : "期間変更" });
    setBarGesture({ id: task.id, mode, originX: event.clientX, start: task.start, end: task.end, snapshot: tasks.map((item) => ({ ...item, dependencies: [...item.dependencies] })) });
  };

  const handleGanttBarClick = (event: React.MouseEvent, taskId: string) => {
    event.stopPropagation();
    if (barGestureMovedRef.current) {
      barGestureMovedRef.current = false;
      return;
    }
    if (!readOnly && event.detail >= 2) setEditingGanttTaskId(taskId);
  };

  const undoLastScheduleChange = () => {
    if (!undoSnapshot || readOnly) return;
    setProject((current) => ({ ...current, tasks: undoSnapshot.tasks.map((task) => ({ ...task, dependencies: [...task.dependencies] })) }));
    toast.success(`${undoSnapshot.label}を元に戻しました`);
    setUndoSnapshot(null);
  };

  const toggleTaskSelection = (taskId: string) => {
    if (readOnly) return;
    setSelectedTaskIds((current) => current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]);
  };

  const applyBulkScheduleChange = (type: "move-back" | "move-forward" | "shorten" | "extend") => {
    if (readOnly || !selectedTaskIds.length) return;
    const selected = new Set(selectedTaskIds);
    const snapshot = tasks.map((task) => ({ ...task, dependencies: [...task.dependencies] }));
    setUndoSnapshot({ tasks: snapshot, label: "一括日程変更" });
    const dayDelta = type === "move-back" || type === "shorten" ? -1 : 1;
    setProject((current) => {
      const selectedDates = new Map<string, Task>();
      let changed = current.tasks.map((task) => {
        if (!selected.has(task.id) || task.isUnscheduled) return task;
        if (type === "shorten" && task.end === task.start) return task;
        const next = type === "shorten" ? { ...task, end: addDays(task.end, dayDelta) } : type === "extend" ? { ...task, end: addDays(task.end, dayDelta) } : { ...task, start: addDays(task.start, dayDelta), end: addDays(task.end, dayDelta) };
        selectedDates.set(task.id, next);
        return next;
      });
      selected.forEach((id) => { changed = cascadeSuccessors(changed, id); });
      changed = changed.map((task) => selectedDates.get(task.id) ?? task);
      return { ...current, tasks: changed };
    });
    const nextOutside = tasks.filter((task) => selected.has(task.id) && !task.isUnscheduled && isOutsideProjectPeriod(addDays(task.end, dayDelta)));
    if (nextOutside.length) toast.warning("一括変更後に開催月を超えるタスクがあります。");
    else toast.success(`${selectedTaskIds.length}件のタスクを一括変更しました`);
  };

  const updateTask = (id: string, patch: Partial<Task>, cascade = false) => {
    if (readOnly) return;
    const currentTask = tasks.find((task) => task.id === id);
    if (currentTask && !(patch.isUnscheduled ?? currentTask.isUnscheduled)) {
      const end = patch.end ?? currentTask.end;
      if (isOutsideProjectPeriod(end)) toast.warning("指定した日程が開催月を超えています。");
    }
    const handoff = currentTask && patch.assignee !== undefined && patch.assignee !== currentTask.assignee ? {
      id: `handoff-${crypto.randomUUID()}`,
      taskId: currentTask.id,
      taskName: currentTask.name,
      previousAssignee: currentTask.assignee || "未設定",
      nextAssignee: patch.assignee || "未設定",
      dueDate: currentTask.end,
      isUnscheduled: Boolean(currentTask.isUnscheduled),
      changedBy: user?.name || "編集者",
      createdAt: new Date().toISOString(),
      acknowledgedAt: null,
    } satisfies HandoffRecord : null;
    if (handoff) toast.success(`担当を「${handoff.nextAssignee}」へ変更しました。引継ぎ一覧に追加しています。`);
    setProject((current) => {
      const changed = current.tasks.map((task) => (task.id === id ? { ...task, ...patch } : patch.phase && task.parentId === id ? { ...task, phase: patch.phase } : task));
      const withParentStatus = patch.status ? syncParentTaskStatus(changed, id) : changed;
      return { ...current, tasks: cascade ? cascadeSuccessors(withParentStatus, id) : withParentStatus, handoffs: handoff ? appendHandoff(current.handoffs ?? [], handoff) : current.handoffs };
    });
  };

  const reorderTask = (sourceId: string, targetId: string) => {
    if (readOnly || sourceId === targetId) return;
    const result = reorderTaskGroup(tasks, sourceId, targetId);
    if (!result.moved) {
      if (result.reason === "different-phase") toast.warning("並び替えは同じフェーズ内で行えます。");
      else if (result.reason === "different-level") toast.warning("親タスクと詳細タスクは別々に並び替えます。");
      return;
    }
    setUndoSnapshot({ tasks: tasks.map((task) => ({ ...task, dependencies: [...task.dependencies] })), label: "タスクの並び替え" });
    setProject((current) => ({ ...current, tasks: reorderTaskGroup(current.tasks, sourceId, targetId).tasks }));
    toast.success("タスクの順序を変更しました。");
  };

  const markHandoffAcknowledged = (handoffId: string) => {
    if (readOnly) return;
    setProject((current) => ({ ...current, handoffs: acknowledgeHandoff(current.handoffs ?? [], handoffId, new Date().toISOString()) }));
    toast.success("引継ぎを確認済みにしました。");
  };

  const toggleTaskImportance = (id: string) => {
    if (readOnly) return;
    setProject((current) => ({ ...current, tasks: toggleImportantFlag(current.tasks, id) }));
    toast.success("重要フラグを切り替えました");
  };

  const toggleTaskCollapsed = (id: string) => {
    setProject((current) => {
      return { ...current, collapsedTaskIds: toggleAccordionId(current.collapsedTaskIds, id) };
    });
  };

  const togglePhaseCollapsed = (phaseId: string) => {
    setProject((current) => ({ ...current, collapsedPhaseIds: toggleAccordionId(current.collapsedPhaseIds, phaseId) }));
    window.requestAnimationFrame(() => {
      const scroll = timelineScrollRef.current;
      if (!scroll) return;
      scroll.scrollTop = Math.min(scroll.scrollTop, Math.max(0, scroll.scrollHeight - scroll.clientHeight));
    });
  };

  const moveTaskWithDependencies = (id: string, newStart: string) => {
    if (readOnly) return;
    const moving = tasks.find((task) => task.id === id);
    if (moving) {
      const nextEnd = addDays(newStart, diffDays(moving.start, moving.end));
      if (isOutsideProjectPeriod(nextEnd)) toast.warning("移動先の日程が開催月を超えています。");
    }
    setProject((current) => {
      const moving = current.tasks.find((task) => task.id === id);
      if (!moving) return current;
      return { ...current, tasks: shiftDependencyChain(current.tasks, id, diffDays(moving.start, newStart)) };
    });
  };

  const openTask = (id: string) => {
    setSelectedId(id);
    setShowInspector(true);
  };

  // 削除はPCの詳細パネルとスマホのタスク詳細で同じ手順を使う。配下タスクは
  // 消さずに最上位へ移し、この工程を指していた依存も外す。
  const deleteTask = (id: string) => {
    if (readOnly) return;
    setProject((current) => ({
      ...current,
      tasks: current.tasks
        .filter((task) => task.id !== id)
        .map((task) => ({
          ...task,
          parentId: task.parentId === id ? null : task.parentId,
          dependencies: task.dependencies.filter((dependencyId) => dependencyId !== id),
        })),
    }));
    setShowInspector(false);
    toast.success("タスクを削除しました。配下タスクは最上位へ移しました");
  };

  const extendDailyTimeline = () => {
    setDayRangeDays((current) => Math.min(dailyRangeLimit, current + VIEW_DAYS));
  };

  const jumpToDate = (date: string) => {
    const dayOffset = Math.max(0, diffDays(projectStartMonth, date));
    setTimelineMode("days");
    setDayRangeDays((current) => Math.min(dailyRangeLimit, Math.max(current, Math.ceil((dayOffset + 1) / VIEW_DAYS) * VIEW_DAYS)));
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      timelineScrollRef.current?.scrollTo({ left: Math.max(0, dayOffset * DAY_WIDTH - 200), behavior: "smooth" });
    }));
  };

  const jumpToToday = () => {
    if (TODAY < projectStartMonth || TODAY > timelineEndDate) {
      toast("今日の日付はこの案件の表示範囲外です");
      return;
    }
    const offset = timelineOffsetForDate(TODAY);
    window.requestAnimationFrame(() => {
      const scroll = timelineScrollRef.current;
      if (!scroll) return;
      scroll.scrollTo({ left: Math.max(0, offset * timelineUnitWidth - scroll.clientWidth / 2 + timelineUnitWidth / 2), behavior: "smooth" });
    });
  };

  const changeTimelineMode = (mode: "days" | "weeks" | "months") => {
    setTimelineMode(mode);
    if (mode === "months") setDayRangeDays(dailyRangeLimit);
  };

  const jumpToAnnouncement = (item: { date: string; taskId: string | null }) => {
    setActivePhase("all");
    setAssigneeFilter("all");
    setStatusFilter("all");
    setSearch("");
    const task = item.taskId ? tasks.find((candidate) => candidate.id === item.taskId) : null;
    jumpToDate(task?.start ?? item.date);
    if (task) openTask(task.id);
    else toast.success("タイムラインの重要日へ移動しました");
  };

  const exportLongSchedulePDF = async () => {
    if (!pdfExportRef.current) return;
    if (pdfScope === "selected" && pdfTasks.length === 0) {
      toast.warning("PDFに含めるタスクを一覧のチェックから選択してください。");
      return;
    }
    if (pdfScope === "phase" && activePhase === "all") {
      toast.warning("フェーズを選択してから、現在フェーズのPDFを出力してください。");
      return;
    }
    setIsPdfExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const canvas = await html2canvas(pdfExportRef.current, { backgroundColor: "#f5f6f2", scale: 2, useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      const pageWidth = 297;
      const pageHeight = 210;
      const margin = 7;
      const ratio = Math.min((pageWidth - margin * 2) / canvas.width, (pageHeight - margin * 2) / canvas.height);
      const width = canvas.width * ratio;
      const height = canvas.height * ratio;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "FAST");
      pdf.save(`${project.title.replace(/[^a-zA-Z0-9-_]/g, "_") || "production-schedule"}-${pdfScope}.pdf`);
      toast.success(`${pdfScope === "all" ? "全体" : pdfScope === "phase" ? "現在フェーズ" : "選択タスク"}のA4横向きPDFを書き出しました`);
    } catch {
      toast.error("PDFを書き出せませんでした。もう一度お試しください。");
    } finally {
      setIsPdfExporting(false);
    }
  };

  const addTask = (phaseOverride?: Phase) => {
    if (readOnly) return;
    if (TODAY > timelineEndDate) toast.warning("今日の日付が開催月を超えるため、新しいタスクは日程未定として追加します。");
    const newTask: Task = {
      id: `t-${Date.now()}`,
      phase: phaseOverride ?? (activePhase === "all" ? phases[0]?.id ?? "pre" : activePhase),
      name: "新規タスク",
      start: TODAY,
      end: TODAY,
      status: "未着手",
      assignee: members[0]?.name ?? "未設定",
      dependencies: [],
      isUnscheduled: true,
      parentId: null,
    };
    setProject((current) => ({ ...current, tasks: [...current.tasks, newTask] }));
    openTask(newTask.id);
    toast.success("新規タスクを追加しました");
  };

  const applyTemplate = () => {
    setProject((current) => normalizeProject({ ...current, phases: fallbackProject.phases, members: fallbackProject.members, tasks: initialTasks.map((task) => ({ ...task, dependencies: [...task.dependencies] })), updatedAt: new Date().toISOString() }));
    toast.success("広告制作テンプレートを適用しました");
  };

  useEffect(() => {
    if (!readOnly && startWithTemplate && project.tasks.length === 0) applyTemplate();
  }, [startWithTemplate, readOnly]);

  const exportJSON = () => {
    downloadFile(JSON.stringify(project, null, 2), "production-gantt-project.json", "application/json;charset=utf-8");
    toast.success("JSONを書き出しました");
  };

  const exportCSV = () => {
    const header = ["id", "phase", "name", "start", "end", "status", "assignee", "dependencies", "note", "isImportant", "isUnscheduled", "parentId"];
    const rows = tasks.map((task) => [task.id, task.phase, task.name, task.start, task.end, task.status, task.assignee, task.dependencies.join("|"), task.note ?? "", String(Boolean(task.isImportant)), String(Boolean(task.isUnscheduled)), task.parentId ?? ""]);
    const escape = (value: string) => `"${String(value).replaceAll('"', '""')}"`;
    downloadFile([header, ...rows].map((row) => row.map(escape).join(",")).join("\n"), "production-gantt-tasks.csv", "text/csv;charset=utf-8");
    toast.success("CSVを書き出しました");
  };

  const importProject = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = String(reader.result);
        if (file.name.toLowerCase().endsWith(".json")) {
          const parsed = JSON.parse(content) as ProjectData;
          if (!Array.isArray(parsed.tasks)) throw new Error("invalid");
          setProject(normalizeProject({ ...parsed, updatedAt: new Date().toISOString() }));
        } else {
          const lines = content.trim().split(/\r?\n/);
          const cells = (line: string) => line.replace(/^"|"$/g, "").split('","').map((cell) => cell.replaceAll('""', '"'));
          const [headerLine, ...dataLines] = lines;
          const headers = cells(headerLine);
          const imported = dataLines.filter(Boolean).map((line) => {
            const values = cells(line);
            const value = (key: string) => values[headers.indexOf(key)] ?? "";
            return {
              id: value("id") || `t-${crypto.randomUUID()}`,
              phase: (value("phase") || "pre") as Phase,
              name: value("name") || "名称未設定",
              start: value("start") || VIEW_START,
              end: value("end") || VIEW_START,
              status: (value("status") || "未着手") as Status,
              assignee: value("assignee") || "未設定",
              dependencies: value("dependencies") ? value("dependencies").split("|") : [],
              note: value("note"),
              isImportant: value("isImportant") === "true",
              isUnscheduled: value("isUnscheduled") === "true",
              parentId: value("parentId") || null,
            };
          });
          if (!imported.length) throw new Error("empty");
          setProject((current) => normalizeProject({ ...current, tasks: imported, updatedAt: new Date().toISOString() }));
        }
        toast.success(`${file.name} を読み込みました`);
      } catch {
        toast.error("ファイルを読み込めませんでした。エクスポートした形式を確認してください。");
      }
    };
    reader.readAsText(file);
  };

  const createShareLink = async () => {
    if (!projectId || !isAuthenticated || remoteProjectQuery.data?.accessRole === "viewer") {
      toast.error("共有リンクは、ログイン済みの保存案件から発行してください。");
      return;
    }
    try {
      const result = await createProjectShare.mutateAsync({ publicId: projectId, origin: window.location.origin, expiresInDays: 7 });
      // create-share-link only knows our origin, not the /production-gantt-studio/
      // base path the SPA is served under — re-anchor before copying, or the
      // recipient lands on a GitHub Pages 404. See lib/appUrl.ts.
      await navigator.clipboard.writeText(toAppUrl(result.shareUrl));
      setShareCopied(true);
      toast.success("7日間有効な閲覧専用リンクをコピーしました");
      await projectSharesQuery.refetch();
    } catch {
      toast.error("共有リンクを発行できませんでした。権限と通信状況を確認してください。");
    }
  };

  const updateProjectInfo = (patch: Partial<Pick<ProjectData, "title" | "client" | "eventMonth" | "taskDateFormat">>) => {
    if (readOnly) return;
    if (patch.eventMonth) {
      const prospectiveEnd = endOfMonth(`${patch.eventMonth}-01`);
      const outside = tasks.filter((task) => !task.isUnscheduled && exceedsEventMonth(task.end, prospectiveEnd));
      if (outside.length) toast.warning(`開催月を変更すると、${outside.length}件のタスクが開催月を超えます。`);
    }
    setProject((current) => ({ ...current, ...patch }));
  };

  const addMilestone = () => {
    if (readOnly) return;
    setProject((current) => ({ ...current, milestones: [...current.milestones, { id: `milestone-${crypto.randomUUID().slice(0, 8)}`, title: "重要な日", date: TODAY }] }));
    toast.success("重要な日を追加しました");
  };

  const updateMilestone = (milestoneId: string, patch: Partial<Milestone>) => {
    if (readOnly) return;
    setProject((current) => ({ ...current, milestones: current.milestones.map((milestone) => milestone.id === milestoneId ? { ...milestone, ...patch } : milestone) }));
  };

  const deleteMilestone = (milestoneId: string) => {
    if (readOnly) return;
    setProject((current) => ({ ...current, milestones: current.milestones.filter((milestone) => milestone.id !== milestoneId) }));
  };

  const updatePhaseName = (phase: Phase, name: string) => {
    if (readOnly) return;
    setProject((current) => ({ ...current, phases: current.phases.map((item) => item.id === phase ? { ...item, name: normalizeInlineName(name, "フェーズ名未設定") } : item) }));
  };

  const addPhase = () => {
    if (readOnly) return;
    const id = `phase-${crypto.randomUUID().slice(0, 8)}`;
    setProject((current) => ({ ...current, phases: [...current.phases, { id, name: "新しいフェーズ", className: phaseClassNames[current.phases.length % phaseClassNames.length] }] }));
    setActivePhase(id);
    toast.success("フェーズを追加しました");
  };

  const addPhaseAfter = (phaseId: Phase) => {
    if (!canEditInline) return;
    addTask(phaseId);
  };

  const movePhase = (phaseId: Phase, direction: -1 | 1) => {
    if (readOnly) return;
    const index = phases.findIndex((phase) => phase.id === phaseId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= phases.length) return;
    setProject((current) => {
      const next = [...current.phases];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return { ...current, phases: next };
    });
  };

  const deletePhase = (phaseId: Phase) => {
    if (readOnly) return;
    const index = phases.findIndex((phase) => phase.id === phaseId);
    const target = phases[index + 1] ?? phases[index - 1];
    const removed = phases[index];
    if (!removed || !target) {
      toast.error("最後のフェーズは削除できません");
      return;
    }
    const taskCount = tasks.filter((task) => task.phase === phaseId).length;
    if (!window.confirm(`「${removed.name}」を削除し、${taskCount}件のタスクを「${target.name}」へ移しますか？`)) return;
    setProject((current) => ({
      ...current,
      phases: current.phases.filter((phase) => phase.id !== phaseId),
      tasks: current.tasks.map((task) => task.phase === phaseId ? { ...task, phase: target.id } : task),
    }));
    if (activePhase === phaseId) setActivePhase(target.id);
    toast.success(`フェーズを削除し、タスクを「${target.name}」へ移しました`);
  };

  const addSubtask = (parentId: string) => {
    if (readOnly) return;
    const parent = tasks.find((task) => task.id === parentId);
    if (!parent) return;
    const subtask: Task = {
      id: `t-${Date.now()}`,
      phase: parent.phase,
      name: "詳細タスク",
      start: parent.start,
      end: parent.end,
      status: "未着手",
      assignee: parent.assignee,
      dependencies: [],
      parentId,
      isUnscheduled: parent.isUnscheduled,
    };
    setProject((current) => ({ ...current, tasks: [...current.tasks, subtask] }));
    openTask(subtask.id);
    toast.success(`「${parent.name}」に詳細タスクを追加しました`);
  };

  const addMember = () => {
    const member: Member = { id: `m-${Date.now()}`, name: "新しいメンバー", role: "役割未設定" };
    setProject((current) => ({ ...current, members: [...current.members, member] }));
    toast.success("メンバーを追加しました");
  };

  const updateMember = (memberId: string, patch: Partial<Member>) => {
    if (readOnly) return;
    setProject((current) => {
      const previous = current.members.find((member) => member.id === memberId);
      const nextMembers = current.members.map((member) => member.id === memberId ? { ...member, ...patch } : member);
      const renamed = patch.name && previous && patch.name !== previous.name;
      return {
        ...current,
        members: nextMembers,
        tasks: renamed ? current.tasks.map((task) => task.assignee === previous.name ? { ...task, assignee: patch.name! } : task) : current.tasks,
      };
    });
  };

  const deleteMember = (memberId: string) => {
    if (readOnly) return;
    const target = members.find((member) => member.id === memberId);
    if (!target || !window.confirm(`「${target.name}」をメンバー一覧から削除しますか？`)) return;
    setProject((current) => ({
      ...current,
      members: current.members.filter((member) => member.id !== memberId),
      tasks: current.tasks.map((task) => task.assignee === target.name ? { ...task, assignee: "未設定" } : task),
    }));
    toast.success("メンバーを削除し、担当タスクを未設定にしました");
  };

  const groups = phases
    .filter((phase) => activePhase === "all" || phase.id === activePhase)
    .map((phase) => {
      const phaseTasks = visibleTasks.filter((task) => task.phase === phase.id);
      const ordered = orderTasksByHierarchy(phaseTasks);
      const isExpanded = isAccordionExpanded(project.collapsedPhaseIds, phase.id);
      return { phase: phase.id, taskCount: ordered.length, isExpanded, tasks: isExpanded ? ordered.filter((task) => !task.parentId || !project.collapsedTaskIds.includes(task.parentId)) : [] };
    });

  useEffect(() => {
    if (readOnly) return;
    const visibleTaskIds = groups.flatMap((group) => group.tasks.map((task) => task.id));
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".task-list .task-row"));
    const cleanup: Array<() => void> = [];

    rows.forEach((row, index) => {
      const taskId = visibleTaskIds[index];
      const handle = row.querySelector<HTMLButtonElement>(".drag-handle");
      if (!taskId || !handle || handle.disabled) return;
      handle.draggable = true;
      handle.title = "同じフェーズ内でドラッグして並び替え";
      handle.setAttribute("aria-label", `${tasks.find((task) => task.id === taskId)?.name ?? "タスク"}をドラッグして並び替え`);

      const onStart = (event: DragEvent) => {
        event.dataTransfer?.setData("text/plain", taskId);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        row.classList.add("is-dragging");
        setDraggedTaskId(taskId);
      };
      const onOver = (event: DragEvent) => {
        if (!event.dataTransfer?.types.includes("text/plain")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      };
      const onDrop = (event: DragEvent) => {
        event.preventDefault();
        const sourceId = event.dataTransfer?.getData("text/plain");
        if (sourceId) reorderTask(sourceId, taskId);
        setDraggedTaskId(null);
      };
      const onEnd = () => {
        row.classList.remove("is-dragging");
        setDraggedTaskId(null);
      };

      handle.addEventListener("dragstart", onStart);
      handle.addEventListener("dragend", onEnd);
      row.addEventListener("dragover", onOver);
      row.addEventListener("drop", onDrop);
      cleanup.push(() => {
        handle.removeEventListener("dragstart", onStart);
        handle.removeEventListener("dragend", onEnd);
        row.removeEventListener("dragover", onOver);
        row.removeEventListener("drop", onDrop);
      });
    });

    return () => cleanup.forEach((dispose) => dispose());
  }, [groups, readOnly, reorderTask, tasks]);

  // A share URL must never fall back to whatever project happens to be in this
  // browser's local storage. get-shared-project 404s for a revoked, expired or
  // unknown token, and without this guard the studio still rendered — in
  // read-only "外部共有ビュー" chrome — around the locally cached project, naming
  // it as the shared one. Show the link's real state instead.
  if (isShareLinkUnusable({
    shareToken,
    isError: remoteShareQuery.isError,
    isSuccess: remoteShareQuery.isSuccess,
    hasProject: Boolean(remoteShareQuery.data?.project),
  })) {
    return (
      <div className="studio-shell shared-project-shell">
        <main className="shared-link-invalid" role="alert">
          <h1>この共有リンクは使えません</h1>
          <p>リンクが取り消されたか、有効期限が切れています。案件の担当者に、新しい共有リンクの発行を依頼してください。</p>
        </main>
      </div>
    );
  }

  return (
    <div className={`studio-shell ${isNarrow ? "is-mobile-shell" : ""} ${readOnly ? "shared-project-shell" : ""}`}>
      {!isNarrow && (
      <aside className="studio-sidebar no-print">
        <div className="brand-lockup">
          <span className="brand-mark" role="img" aria-label="Production Gantt Studio">PG</span>
          <div>
            <p className="brand-name">PRODUCTION</p>
            <p className="brand-name brand-name-accent">GANTT STUDIO</p>
          </div>
        </div>

        <div className="side-section-label">この案件</div>
        <nav className="side-nav" aria-label="案件メニュー">
          <button className="side-nav-item active" title="案件一覧" onClick={() => setLocation("/")}><FolderKanban size={17} /><span className="side-nav-label">案件一覧</span></button>
          <button className="side-nav-item" title="ガントチャート" onClick={() => document.getElementById("project-schedule")?.scrollIntoView({ behavior: "smooth", block: "start" })}><CalendarDays size={17} /><span className="side-nav-label">ガントチャート</span></button>
        </nav>

        <div className="side-section-label phase-section-label">フェーズ</div>
        <nav className="phase-nav" aria-label="制作フェーズ">
          <button onClick={() => setActivePhase("all")} title="すべて" className={`phase-nav-item ${activePhase === "all" ? "selected" : ""}`}><span className="phase-index">00</span><span className="side-nav-label">すべて</span><span className="phase-count">{tasks.length}</span></button>
          {phases.map((phase, index) => (
            <button key={phase.id} onClick={() => setActivePhase(phase.id)} title={phase.name} className={`phase-nav-item ${activePhase === phase.id ? "selected" : ""}`}>
              <span className={`phase-index ${phase.className}`}>{String(index + 1).padStart(2, "0")}</span><span className="side-nav-label">{phase.name}</span><span className="phase-count">{tasks.filter((task) => task.phase === phase.id).length}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-project-card" style={{ backgroundImage: "linear-gradient(160deg, #2c3a45 0%, #1b2530 55%, #101820 100%)" }}>
          <p>開いている案件</p>
          <strong>{project.title.split(" ")[0]}</strong>
          <span><span className="live-dot" /> 保存済み</span>
        </div>

        <div className="sidebar-bottom">
          <button className="side-nav-item" title="使い方" onClick={() => setShowShortcuts(true)}><CircleHelp size={17} /><span className="side-nav-label">使い方</span></button>
          <button className="profile-row" onClick={() => toast(roleDescription)}>
            <span className="avatar">{user?.name?.slice(0, 2) || roleLabel.slice(0, 1)}</span><span><strong>{user?.name || roleLabel}</strong><small>{roleLabel}</small></span><MoreHorizontal size={17} />
          </button>
        </div>
      </aside>
      )}

      {isNarrow ? (
        <MobileProject
          project={project}
          tasks={tasks}
          phases={phases}
          assignees={assignees}
          today={TODAY}
          readOnly={readOnly}
          progress={projectProgress}
          selectedTask={selectedTask}
          isSheetOpen={showInspector}
          myAssignee={myTasksAssignee}
          phaseName={phaseName}
          phaseClass={phaseClass}
          onChangeMyAssignee={setMyTasksAssignee}
          onOpenTask={openTask}
          onCloseTask={() => setShowInspector(false)}
          onUpdateTask={updateTask}
          onMoveTaskStart={moveTaskWithDependencies}
          onDeleteTask={deleteTask}
          onAddTask={() => addTask()}
          onOpenSettings={() => setWorkspacePanel("project")}
          onOpenHelp={() => setShowShortcuts(true)}
          onBack={() => setLocation("/")}
        />
      ) : (
      <main className="studio-main">
        {readOnly && <div className="shared-banner"><Eye size={15} />外部共有ビュー：このURLには「{project.title}」のみが含まれます。他プロジェクト、設定、編集機能は表示されません。</div>}
        {blankPreview && <div className="shared-banner"><Eye size={15} />新規案件画面のプレビューです。このURLではデータを保存しません。</div>}
        <header className="topbar no-print">
          <div className="breadcrumb">{readOnly ? <span>SHARED PROJECT</span> : <button className="breadcrumb-root" onClick={() => setLocation("/")}>案件管理</button>}<ChevronRight size={14} />{readOnly ? <strong>{project.title}</strong> : <button className="project-title-trigger" onClick={() => setWorkspacePanel("project")}><strong>{project.title}</strong><ChevronDown size={14} /></button>}</div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="ヘルプ" onClick={() => setShowShortcuts(true)}><CircleHelp size={17} /></button>
            {!readOnly && <button className="outline-button" onClick={() => setWorkspacePanel("project")}><Settings2 size={15} />設定</button>}
            {!readOnly && <button className="signal-button" onClick={() => addTask()}><Plus size={17} />タスクを追加</button>}
          </div>
        </header>

        <section className="project-heading" id="project-overview">
          <div className="project-copy">
            <div className="eyebrow"><span className="eyebrow-line" />案件の進行状況</div>
            <h1>{project.title}</h1>
            <div className="project-meta"><span>{project.client}</span><span className="meta-separator" /> <CalendarDays size={15} /> {scheduleRange}<span className="meta-separator" /><span>あなたは<strong>{roleLabel}</strong></span></div>
            <div className="role-access-note"><b>{roleLabel}</b><span>{roleDescription}</span></div>
          </div>
          <div className="project-health">
            <div className="progress-ring" style={{ "--progress": `${projectProgress * 3.6}deg` } as React.CSSProperties}><span>{projectProgress}<small>%</small></span></div>
            <div><p>進捗</p><strong>{tasks.length ? `${tasks.filter((task) => task.status === "完了").length} / ${tasks.length}件 完了` : "最初のタスクを追加"}</strong><span>最終更新 {new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date(project.updatedAt))}</span></div>
          </div>
        </section>

        {tasks.length > 0 && <section className="project-status-summary no-print" aria-label="進行ステータスの内訳"><span>進行ステータス</span><div>{statusSummary.map((item) => <div key={item.id} className={`status-summary-item is-${item.id}`}><i /><b>{item.label}</b><strong>{item.count}</strong><small>件</small></div>)}</div></section>}

        {pendingHandoffs.length > 0 && <section className="handoff-queue no-print" aria-label="未確認の担当引継ぎ"><header><span><Users size={17} />担当引継ぎ</span><strong>未確認 {pendingHandoffs.length}件</strong><small>受け手が確認するまで残ります</small></header><div>{pendingHandoffs.slice(0, 5).map((handoff) => { const tone = getHandoffTone({ today: TODAY, end: handoff.dueDate, isUnscheduled: handoff.isUnscheduled }); return <article key={handoff.id} className={`is-${tone}`}><button className="handoff-task" onClick={() => { if (!handoff.isUnscheduled) jumpToDate(handoff.dueDate); openTask(handoff.taskId); }}><span>{handoff.previousAssignee} → {handoff.nextAssignee}</span><b>{handoff.taskName}</b><small>変更：{handoff.changedBy} ／ 期限：{handoff.isUnscheduled ? "日程未定" : formatDate(handoff.dueDate)}</small></button>{!readOnly && <button className="handoff-acknowledge" onClick={() => markHandoffAcknowledged(handoff.id)}><Check size={14} />確認済み</button>}</article>; })}</div>{pendingHandoffs.length > 5 && <p>最新5件を表示しています。確認済みにすると次の引継ぎを表示します。</p>}</section>}

        {tasks.length > 0 && <section className="assigned-tasks-board no-print" aria-label="担当者の未完了タスク"><header><div><span><Users size={17} />担当者の未完了</span><strong>{myTasksAssignee ? `${myTasksAssignee}：${assignedOpenTasks.length}件` : "担当者を選択"}</strong></div><select aria-label="未完了タスクを確認する担当者" value={myTasksAssignee} onChange={(event) => setMyTasksAssignee(event.target.value)}><option value="">担当者を選ぶ</option>{assignees.map((assignee) => <option key={assignee} value={assignee}>{assignee}</option>)}</select></header><nav aria-label="担当者の未完了タスクの期間"><button className={myTasksScope === "all" ? "active" : ""} onClick={() => setMyTasksScope("all")}>すべて</button><button className={myTasksScope === "today" ? "active" : ""} onClick={() => setMyTasksScope("today")}>今日まで</button><button className={myTasksScope === "week" ? "active" : ""} onClick={() => setMyTasksScope("week")}>今週</button><button className={myTasksScope === "unscheduled" ? "active" : ""} onClick={() => setMyTasksScope("unscheduled")}>日程未定</button></nav><div className="assigned-task-list">{myTasksAssignee && assignedOpenTasks.length ? assignedOpenTasks.slice(0, 6).map((task) => <button key={task.id} onClick={() => { if (!task.isUnscheduled) jumpToDate(task.start); openTask(task.id); }}><span>{phaseName(task.phase)}</span><b>{task.name}</b><small className={statusMeta[task.status].tone}>{task.status}</small><time>{task.isUnscheduled ? "日程未定" : formatTaskDateRange(task.start, task.end, project.taskDateFormat ?? "compact")}</time><ChevronRight size={14} /></button>) : <p>{myTasksAssignee ? "この条件の未完了タスクはありません。" : "担当者を選ぶと、期限が先の仕事も含めて確認できます。"}</p>}</div>{assignedOpenTasks.length > 6 && <footer>日程が近い順に6件を表示しています。絞り込みから一覧を開くと全件を確認できます。</footer>}</section>}

        {outOfPeriodTasks.length > 0 && <section className="period-warning-board no-print"><CalendarDays size={16} /><div><b>開催月を超える日程があります</b><span>{outOfPeriodTasks.length}件のタスクが、開催 {timelineEndMonth} を超えています。開催月またはタスク日程を見直してください。</span></div><button className="period-filter-shortcut" onClick={() => setPeriodFilter("outside")}>開催月後のみ表示</button></section>}

        {tasks.length > 0 && announcementItems.length > 0 && <section className={`announcement-board no-print ${showExpandedAlerts ? "is-expanded" : "is-collapsed"}`} aria-label="担当者と期限のアラート">
          <button className="announcement-summary" aria-expanded={showExpandedAlerts} onClick={() => setAlertExpanded((current) => !current)}><BellRing size={17} /><div><span>担当と期限</span><strong>{alertSummary.label}</strong></div><small>{showExpandedAlerts ? "閉じる" : "確認する"}</small><ChevronDown size={16} /></button>
          {showExpandedAlerts && <div className="announcement-expanded"><p className="announcement-rule">担当者を選ぶと、その人が次に対応する予定だけを確認できます。</p><div className="announcement-tabs" role="tablist" aria-label="担当者別アラート">{alertTabs.map((tab) => <button key={tab} role="tab" aria-selected={alertTab === tab} className={alertTab === tab ? "active" : ""} onClick={() => setAlertTab(tab)}>{tab === "all" ? "すべて" : tab === "unassigned" ? "未担当" : tab}</button>)}</div><div className="announcement-list">{visibleAnnouncementItems.length ? visibleAnnouncementItems.map((item) => <button key={item.id} className={`announcement-item ${item.type === "期限接近" || item.type === "期限超過" ? "is-due" : ""} ${item.type === "担当者未設定" ? "is-unassigned" : ""}`} onClick={() => jumpToAnnouncement(item)}><span className="announcement-type">{item.type === "重要日" ? <CalendarDays size={13} /> : item.type === "重要タスク" ? <Flag size={13} fill="currentColor" /> : <BellRing size={13} />}{item.type}</span><b>{item.title}</b>{item.taskId && <span className={`announcement-assignee ${item.type === "担当者未設定" ? "is-missing" : ""}`}><Users size={12} />次の対応：{item.assignee}</span>}<time>{item.isUnscheduled ? "日程未定" : formatDate(item.date)}</time><ChevronRight size={14} /></button>) : <div className="announcement-empty">{alertTab === "unassigned" ? "担当者未設定のタスクはありません。" : `${alertTab}さんの期限アラートはありません。`}</div>}</div></div>}
        </section>}

        <section className="control-strip no-print" id="project-tasks">
          <div className="filter-group">
            <div className="search-field"><Search size={16} /><input id="task-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="タスクを検索" /><kbd>⌘K</kbd></div>
            <button className={`utility-button ${showTaskFilters ? "active" : ""}`} onClick={() => setShowTaskFilters((current) => !current)}><SlidersHorizontal size={15} />絞り込み</button>
          </div>
          <div className="utility-group">
            <button className={`utility-button ${showTaskUtilities ? "active" : ""}`} onClick={() => setShowTaskUtilities((current) => !current)}><MoreHorizontal size={15} />その他</button>
          </div>
          {showTaskFilters && <div className="task-tools-panel"><div className="select-field"><Users size={15} /><select aria-label="担当者で絞り込み" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="all">担当者：すべて</option>{assignees.map((assignee) => <option key={assignee} value={assignee}>{assignee}</option>)}</select></div><div className="select-field"><SlidersHorizontal size={15} /><select aria-label="ステータスで絞り込み" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Status | "all")}><option value="all">ステータス：すべて</option>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></div><div className={`select-field period-filter ${periodFilter === "outside" ? "active" : ""}`}><CalendarDays size={15} /><select aria-label="開催月で絞り込み" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as "all" | "outside")}><option value="all">期間：すべて</option><option value="outside">開催月後のみ：{outOfPeriodTasks.length}件</option></select></div></div>}
          {showTaskUtilities && <div className="task-tools-panel"><>{!readOnly && <button className="utility-button" disabled={!undoSnapshot} onClick={undoLastScheduleChange}><Undo2 size={15} />戻す</button>}</>{!readOnly && <button className={`utility-button ${bulkSelectionMode ? "active" : ""}`} onClick={() => { const next = toggleBulkSelectionMode(bulkSelectionMode, selectedTaskIds); setBulkSelectionMode(next.isActive); setSelectedTaskIds(next.selectedTaskIds); }}><Check size={15} />{bulkSelectionMode ? "一括選択を終了" : "複数タスクを選択"}</button>}<div className="select-field pdf-scope-select"><FileText size={15} /><select aria-label="PDF出力範囲" value={pdfScope} onChange={(event) => setPdfScope(event.target.value as "all" | "phase" | "selected")}><option value="all">PDF：全体</option><option value="phase">PDF：現在フェーズ</option><option value="selected">PDF：選択タスク {selectedTaskIds.length ? `(${selectedTaskIds.length})` : ""}</option></select></div><button className="utility-button" disabled={isPdfExporting} onClick={exportLongSchedulePDF}><FileText size={15} />{isPdfExporting ? "PDF作成中" : "A4 PDF"}</button><button className="utility-button" onClick={() => window.print()}><Printer size={15} />印刷</button></div>}
        </section>

        {!readOnly && bulkSelectionMode && <section className="bulk-task-toolbar no-print"><b>{selectedTaskIds.length}件を選択中</b><span>{selectedTaskIds.length ? "選択したタスクをまとめて変更します。" : "タスク左の選択欄から、まとめて変更するタスクを選んでください。"}</span><div>{selectedTaskIds.length > 0 && <><button onClick={() => applyBulkScheduleChange("move-back")}>← 1日移動</button><button onClick={() => applyBulkScheduleChange("move-forward")}>1日移動 →</button><button onClick={() => applyBulkScheduleChange("shorten")}>期間を短縮</button><button onClick={() => applyBulkScheduleChange("extend")}>期間を延長</button><button className="bulk-clear" onClick={() => setSelectedTaskIds([])}>選択解除</button></>}<button className="bulk-clear" onClick={() => { setBulkSelectionMode(false); setSelectedTaskIds([]); }}>一括選択を終了</button></div></section>}

        {tasks.length === 0 ? (
          <section className="zero-start-card" aria-label="新規案件画面">
            <div className="zero-start-visual"><span className="brand-mark" aria-hidden="true">PG</span><span>00</span><i /></div>
            <div className="zero-start-copy">
              <p>EMPTY PRODUCTION SLATE / TRACK 00</p>
              <h2>最初の一本を、ここから置く。</h2>
              <span>案件に必要な工程を、最初のタスクから追加します。案件名、クライアント名、開催月は新規案件作成時に入力済みです。</span>
              {!readOnly && <div className="zero-start-actions"><button className="signal-button" onClick={() => addTask()}><Plus size={16} />最初のタスクを追加</button></div>}
              <div className="zero-start-notes"><span><b>01</b> タスクと日程は後から自由に追加</span><span><b>02</b> 担当者はメンバーから選択</span><span><b>03</b> データはこの端末に保存</span></div>
            </div>
          </section>
        ) : (
        <section className="timeline-card" aria-label="制作ガントチャート" id="project-schedule" style={{ "--task-column-width": `${taskColumnWidth}px` } as React.CSSProperties}>
          <div className="timeline-topline">
            <div className="timeline-caption"><span>ガントチャート</span><strong>{visibleTasks.length}件のタスク</strong><div className="timeline-view-switch no-print" aria-label="表示方法"><button className={timelineMode === "days" ? "active" : ""} onClick={() => changeTimelineMode("days")}>日ごと</button><button className={timelineMode === "weeks" ? "active" : ""} onClick={() => changeTimelineMode("weeks")}>週ごと</button><button className={timelineMode === "months" ? "active" : ""} onClick={() => changeTimelineMode("months")}>月ごと</button></div><button className="timeline-today-button no-print" onClick={jumpToToday}><CalendarDays size={12} />今日</button></div>
            <div className="timeline-legend"><span><i className="legend-dot legend-active" />進行中</span><span><i className="legend-dot legend-review" />確認中</span><span><i className="legend-dot legend-done" />完了</span></div>
          </div>
          <div className="timeline-scroll" ref={timelineScrollRef} onScroll={(event) => { const target = event.currentTarget; if (dayRangeDays < dailyRangeLimit && target.scrollLeft + target.clientWidth >= target.scrollWidth - 180) extendDailyTimeline(); }}>
            <div className={`timeline-layout ${timelineMode === "months" ? "is-monthly" : ""}`} style={{ "--timeline-width": `${timelineUnitCount * timelineUnitWidth}px`, "--timeline-unit": `${timelineUnitWidth}px` } as React.CSSProperties}>
              <div className="task-column-header"><span>{readOnly ? "タスク / 担当者" : "タスク名を直接変更"}</span><span>進捗</span></div>
              <div className="calendar-header">
                <div className="calendar-month-row">{timelineMonths.map((month) => <span key={month.label} style={{ width: `${month.count * timelineUnitWidth}px` }}>{month.label}</span>)}</div>
                <div className={`calendar-days ${timelineMode === "months" ? "month-week-cells" : ""}`}>{timelineMode === "months" ? monthlyWeekSegments.map((week) => <div key={week.id} className="calendar-day month-week-label" style={{ width: `${week.width}px` }}><b>{week.label}</b></div>) : timelineUnits.map((day, index) => { const date = parseDate(day); const weekend = date.getDay() === 0 || date.getDay() === 6; const weekEnd = addDays(day, Math.min(6, Math.max(0, diffDays(day, timelineEndDate)))); return <div key={day} className={`calendar-day ${timelineMode === "weeks" ? "week-label" : ""} ${weekend ? "weekend" : ""} ${index === Math.floor(todayOffset) ? "is-today" : ""}`}><b>{timelineMode === "weeks" ? formatMonthDay(day) : date.getDate()}</b><small>{timelineMode === "weeks" ? `〜${formatMonthDay(weekEnd)}` : ["日", "月", "火", "水", "木", "金", "土"][date.getDay()]}</small></div>; })}</div>
              </div>

              <div className="task-list">
                {groups.map(({ phase, taskCount, isExpanded, tasks: phaseTasks }) => (
                  <div key={phase} className="phase-block">
                    <div className={`phase-row ${isExpanded ? "is-expanded" : "is-collapsed"}`}><button className="phase-accordion-trigger no-print" aria-label={`${phaseName(phase)}を${isExpanded ? "折りたたむ" : "展開する"}`} aria-expanded={isExpanded} onClick={() => togglePhaseCollapsed(phase)}>{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button><span className={`phase-label-bar ${phaseClass(phase)}`} /><div>{readOnly ? <b>{phaseName(phase)}</b> : <input className="inline-phase-name" aria-label={`${phaseName(phase)}のフェーズ名`} value={phaseName(phase)} onChange={(event) => updatePhaseName(phase, event.target.value)} onBlur={(event) => updatePhaseName(phase, event.target.value)} />}</div><small>{taskCount}件</small>{canEditInline && <div className="phase-inline-actions no-print"><button className="phase-add-task-button" title="このフェーズにタスクを追加" aria-label={`${phaseName(phase)}にタスクを追加`} onClick={() => addPhaseAfter(phase)}><Plus size={13} /><span>タスク</span></button><button className="phase-delete-inline" title="このフェーズを削除" aria-label={`${phaseName(phase)}を削除`} onClick={() => deletePhase(phase)}><X size={13} /></button></div>}</div>
                    {phaseTasks.map((task) => <div key={task.id} className={`task-row ${bulkSelectionMode ? "is-bulk-mode" : ""} ${selectedId === task.id ? "selected" : ""} ${selectedTaskIds.includes(task.id) ? "bulk-selected" : ""} ${task.isImportant ? "is-important" : ""} ${task.isUnscheduled ? "is-unscheduled" : ""} ${task.parentId ? "is-subtask" : ""} ${parentTaskIds.has(task.id) ? "has-subtasks" : ""}`}>{!readOnly && bulkSelectionMode && <button className={`task-select-toggle no-print ${selectedTaskIds.includes(task.id) ? "active" : ""}`} aria-label={`${task.name}を一括操作に${selectedTaskIds.includes(task.id) ? "含めない" : "含める"}`} onClick={(event) => { event.stopPropagation(); toggleTaskSelection(task.id); }}><Check size={12} /></button>}<button className="drag-handle" aria-label="タスクを移動" disabled={task.isUnscheduled}><GripVertical size={15} /></button><div className="task-title"><strong>{parentTaskIds.has(task.id) && <button className="task-accordion-trigger no-print" title={project.collapsedTaskIds.includes(task.id) ? "詳細タスクを表示" : "詳細タスクを折りたたむ"} aria-label={`${task.name}の詳細タスクを${project.collapsedTaskIds.includes(task.id) ? "表示" : "折りたたむ"}`} aria-expanded={!project.collapsedTaskIds.includes(task.id)} onClick={(event) => { event.stopPropagation(); toggleTaskCollapsed(task.id); }}>{project.collapsedTaskIds.includes(task.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button>}{task.parentId && <em className="subtask-branch">↳</em>}{readOnly ? task.name : <input className="inline-task-name" aria-label={`${task.name}のタスク名`} value={task.name} onClick={(event) => event.stopPropagation()} onChange={(event) => updateTask(task.id, { name: event.target.value })} onBlur={(event) => updateTask(task.id, { name: normalizeInlineName(event.target.value, "名称未設定") })} />}</strong></div><span className="task-schedule">{task.isUnscheduled ? "日程未定" : formatTaskDateRange(task.start, task.end, project.taskDateFormat ?? "compact")}{parentTaskIds.has(task.id) && <em className="subtask-count">{childTasksByParent.get(task.id)?.length}件の詳細タスク</em>}</span>{canEditInline && <div className="task-inline-quick-fields no-print"><select aria-label={`${task.name}の担当者`} value={task.assignee} onChange={(event) => updateTask(task.id, { assignee: event.target.value })}>{assignees.map((assignee) => <option key={assignee} value={assignee}>{assignee}</option>)}</select><select aria-label={`${task.name}の状態`} value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value as Status })}>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>}{!readOnly && !task.parentId && <button className="add-subtask-button no-print" title="詳細タスクを追加" aria-label={`${task.name}に詳細タスクを追加`} onClick={(event) => { event.stopPropagation(); addSubtask(task.id); }}><Plus size={13} /></button>}{showDetailSettings && <button className="task-more-button no-print" title="詳細な設定" aria-label={`${task.name}の詳細な設定を開く`} onClick={() => openTask(task.id)}><MoreHorizontal size={15} /></button>}<button className={`inline-important-button no-print ${task.isImportant ? "active" : ""}`} aria-label={`${task.name}を重要タスクに${task.isImportant ? "しない" : "する"}`} title={task.isImportant ? "重要タスクを解除" : "重要タスクに追加"} disabled={readOnly} onClick={(event) => { event.stopPropagation(); toggleTaskImportance(task.id); }}><Flag size={13} fill={task.isImportant ? "currentColor" : "none"} /></button><span className={`status-pill ${statusMeta[task.status].tone}`}><i />{task.status}</span></div>)}
                  </div>
                ))}
              </div>

              <div className="gantt-area" ref={gridRef}>
                <div className="gantt-grid" style={{ backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent ${(timelineMode === "months" ? timelineUnitWidth * 7 : timelineUnitWidth) - 1}px, var(--grid-line) ${(timelineMode === "months" ? timelineUnitWidth * 7 : timelineUnitWidth) - 1}px, var(--grid-line) ${timelineMode === "months" ? timelineUnitWidth * 7 : timelineUnitWidth}px)` }} />
                <div className="today-line" style={{ left: `${todayOffset * timelineUnitWidth + timelineUnitWidth / 2}px` }}><span>今日</span></div>
                {milestones.filter((milestone) => milestone.date >= timelineStartDate && milestone.date <= timelineEndDate).map((milestone) => <div key={milestone.id} className="milestone-marker important-date-marker" style={{ left: `${timelineOffsetForDate(milestone.date) * timelineUnitWidth + timelineUnitWidth / 2}px` }}><span><Check size={12} strokeWidth={3} />重要日：{milestone.title}</span></div>)}
                {groups.map(({ phase, tasks: phaseTasks }) => (
                  <div key={phase} className="gantt-phase-block">
                    <div className="gantt-phase-spacer" />
                    {phaseTasks.map((task) => {
                      if (task.isUnscheduled) return <div key={task.id} className={`gantt-task-lane ${task.parentId ? "is-subtask" : ""}`}><button className={`unscheduled-gantt-card ${statusMeta[task.status].tone} ${task.isImportant ? "is-important" : ""}`} onClick={(event) => { event.stopPropagation(); openTask(task.id); }}><span>DATE TBC</span><strong>{task.parentId && "↳ "}{task.name}</strong></button></div>;
                      const left = Math.max(0, timelineOffsetForDate(task.start) * timelineUnitWidth);
                      const width = Math.max(timelineUnitWidth, timelineDurationForTask(task) * timelineUnitWidth - 5);
                      const barDisplayMode = getGanttBarDisplayMode(width);
                      const isCompactBar = barDisplayMode !== "task";
                      const isTinyBar = barDisplayMode === "compact-status";
                      return <div key={task.id} className={`gantt-task-lane ${task.parentId ? "is-subtask" : ""}`}><div className={`gantt-bar ${statusMeta[task.status].tone} ${isCompactBar ? "is-compact-bar" : ""} ${isTinyBar ? "is-tiny-bar" : ""} ${task.status === "完了" ? "is-complete" : ""} ${task.isImportant ? "is-important" : ""} ${parentTaskIds.has(task.id) ? "has-subtasks" : ""} ${barGesture?.id === task.id ? "is-direct-editing" : ""}`} title={readOnly ? `${task.name}：${task.status}` : "ドラッグで移動。左右端で期間変更。名前はダブルクリックで変更。"} style={{ left: `${left}px`, width: `${width}px` }} onPointerDown={(event) => startBarGesture(event, task, "move")} onClick={(event) => handleGanttBarClick(event, task.id)}><button className="resize-handle resize-start" aria-label="開始日を短縮・延長" onPointerDown={(event) => startBarGesture(event, task, "start")} />{!readOnly && editingGanttTaskId === task.id ? <input autoFocus className="gantt-inline-name" aria-label={`${task.name}のタスク名`} value={task.name} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onChange={(event) => updateTask(task.id, { name: event.target.value })} onBlur={(event) => { updateTask(task.id, { name: normalizeInlineName(event.target.value, "名称未設定") }); setEditingGanttTaskId(null); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /> : <span className="gantt-bar-content"><b className="gantt-bar-task-name">{task.parentId && "↳ "}{task.isImportant && <Flag size={10} fill="currentColor" />}{task.name}</b><small className="gantt-bar-status-label"><span className="gantt-status-full">{task.status}</span><span className="gantt-status-short" aria-label={task.status}>{getCompactStatusLabel(task.status)}</span></small></span>}<button className="resize-handle resize-end" aria-label="終了日を短縮・延長" onPointerDown={(event) => startBarGesture(event, task, "end")} /></div></div>;
                    })}
                  </div>
                ))}
              </div>
              <div className="timeline-scroll-end" aria-hidden="true" />
            </div>
          </div>
          {!readOnly && <div className="task-column-resizer no-print" role="separator" aria-label="タスク欄の横幅を調整" aria-orientation="vertical" onPointerDown={startTaskColumnResize} />}
          <div className="timeline-footer"><span><strong>移動</strong> バーを動かすと、前後の依存工程を同じ日数だけ移動します。</span><span><strong>期間</strong> 両端で期間を変えると、後続工程を再調整します。</span><span><strong>名前</strong> フェーズ名とタスク名は、左の一覧でそのまま変更できます。</span>{dayRangeDays < dailyRangeLimit && <button className="timeline-extend-button no-print" onClick={extendDailyTimeline}><Plus size={13} />最終月まで表示</button>}</div>
        </section>
        )}

      </main>
      )}

      <section ref={pdfExportRef} className="pdf-export-sheet" aria-hidden="true">
        <header><div><span>PRODUCTION GANTT STUDIO / CLIENT SCHEDULE</span><h1>{project.title}</h1><p>{project.client} · {formatMonthDay(timelineStartDate)} — {formatMonthDay(timelineEndDate)}</p></div><strong>{pdfScopeLabel}</strong></header>
        <div className="pdf-timeline" style={{ "--pdf-month-count": monthlyUnitCount } as React.CSSProperties}><div className="pdf-months"><span>PROJECT PHASE / TASK</span>{Array.from({ length: monthlyUnitCount }, (_, index) => { const date = parseDate(addMonths(monthTimelineStart, index)); return <b key={index}>{new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase()}<small>{date.getFullYear()}</small></b>; })}</div>{pdfPhases.map((phase) => <div key={phase.id} className="pdf-phase"><div className="pdf-phase-name"><i className={phase.className} />{phase.name}</div>{orderTasksByHierarchy(pdfTasks.filter((task) => task.phase === phase.id)).map((task) => { const progress = parentProgressById.get(task.id); if (task.isUnscheduled) return <div className={`pdf-task pdf-unscheduled ${task.parentId ? "pdf-subtask" : ""}`} key={task.id}><span>{task.isImportant && "◆ "}{task.name}{progress !== undefined && ` · ${progress}%`}</span><div className="pdf-track"><em>DATE TBC</em>{progress !== undefined && <i className="pdf-progress" style={{ width: `${progress}%` }} />}</div></div>; const left = Math.max(0, diffMonths(monthTimelineStart, startOfMonth(task.start)) / monthlyUnitCount * 100); const width = Math.max(100 / monthlyUnitCount, (diffMonths(startOfMonth(task.start), startOfMonth(task.end)) + 1) / monthlyUnitCount * 100); return <div className={`pdf-task ${task.parentId ? "pdf-subtask" : ""}`} key={task.id}><span>{task.isImportant && "◆ "}{task.name}{progress !== undefined && ` · ${progress}%`}</span><div className="pdf-track"><i className={`${statusMeta[task.status].tone} ${task.isImportant ? "is-important" : ""}`} style={{ left: `${left}%`, width: `${width}%` }} />{progress !== undefined && <i className="pdf-progress" style={{ width: `${progress}%` }} />}</div></div>; })}</div>)}</div>
        <p className="pdf-important-dates">重要日：{milestones.map((milestone) => `${formatMonthDay(milestone.date)} ${milestone.title}`).join(" / ") || "なし"}</p>
        <footer><span>赤いバー：重要タスク</span><span>Generated by Production Gantt Studio</span></footer>
      </section>

      {!isNarrow && showInspector && selectedTask && (
        <aside className="inspector no-print" aria-label="タスク詳細">
          <div className="inspector-top"><div><span>TASK INSPECTOR</span><strong>{phaseName(selectedTask.phase)}</strong></div><button className="icon-button" aria-label="閉じる" onClick={() => setShowInspector(false)}><X size={18} /></button></div>
          <div className="inspector-task-title"><input value={selectedTask.name} disabled={readOnly} onChange={(event) => updateTask(selectedTask.id, { name: event.target.value })} /><span className={`status-pill ${statusMeta[selectedTask.status].tone}`}><i />{selectedTask.status}</span></div>
          <section className="inspector-schedule-block">
            <div><span>日程を編集</span><strong>{selectedTask.isUnscheduled ? "日程未定" : formatTaskDateRange(selectedTask.start, selectedTask.end, project.taskDateFormat ?? "compact")}</strong></div>
            <label className="unscheduled-toggle"><input disabled={readOnly} type="checkbox" checked={Boolean(selectedTask.isUnscheduled)} onChange={(event) => updateTask(selectedTask.id, event.target.checked ? { isUnscheduled: true } : { isUnscheduled: false, start: TODAY, end: TODAY })} /><span><CalendarDays size={14} />日程未定</span></label>
            <div className="date-pair"><label>開始日<input disabled={readOnly || selectedTask.isUnscheduled} type="date" value={selectedTask.start} onChange={(event) => moveTaskWithDependencies(selectedTask.id, event.target.value)} /></label><label>終了日<input disabled={readOnly || selectedTask.isUnscheduled} type="date" value={selectedTask.end} min={selectedTask.start} onChange={(event) => updateTask(selectedTask.id, { end: event.target.value }, true)} /></label></div>
          </section>
          <div className="inspector-fields">
            <label>制作フェーズ<select disabled={readOnly} value={selectedTask.phase} onChange={(event) => updateTask(selectedTask.id, { phase: event.target.value as Phase })}>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}</select></label>
            <label>親タスク<select disabled={readOnly} value={selectedTask.parentId ?? "none"} onChange={(event) => updateTask(selectedTask.id, { parentId: event.target.value === "none" ? null : event.target.value })}><option value="none">親タスクなし</option>{tasks.filter((task) => task.id !== selectedTask.id && !task.parentId).map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}</select></label>
            <label>ステータス<select disabled={readOnly} value={selectedTask.status} onChange={(event) => updateTask(selectedTask.id, { status: event.target.value as Status })}>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label>担当者<select disabled={readOnly} value={selectedTask.assignee} onChange={(event) => updateTask(selectedTask.id, { assignee: event.target.value })}>{assignees.map((assignee) => <option key={assignee} value={assignee}>{assignee}</option>)}</select></label>
            <label className="unscheduled-toggle"><input disabled={readOnly} type="checkbox" checked={Boolean(selectedTask.isUnscheduled)} onChange={(event) => updateTask(selectedTask.id, event.target.checked ? { isUnscheduled: true } : { isUnscheduled: false, start: TODAY, end: TODAY })} /><span><CalendarDays size={14} />日程は未定</span></label>
            <div className="date-pair"><label>開始日<input disabled={readOnly || selectedTask.isUnscheduled} type="date" value={selectedTask.start} onChange={(event) => moveTaskWithDependencies(selectedTask.id, event.target.value)} /></label><label>終了日<input disabled={readOnly || selectedTask.isUnscheduled} type="date" value={selectedTask.end} min={selectedTask.start} onChange={(event) => updateTask(selectedTask.id, { end: event.target.value }, true)} /></label></div>
            <label>依存タスク<select disabled={readOnly} value={selectedTask.dependencies[0] ?? "none"} onChange={(event) => updateTask(selectedTask.id, { dependencies: event.target.value === "none" ? [] : [event.target.value] }, true)}><option value="none">依存なし</option>{tasks.filter((task) => task.id !== selectedTask.id).map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}</select></label>
            <label className="important-toggle"><input disabled={readOnly} type="checkbox" checked={Boolean(selectedTask.isImportant)} onChange={(event) => updateTask(selectedTask.id, { isImportant: event.target.checked })} /><span><Flag size={14} fill={selectedTask.isImportant ? "currentColor" : "none"} />重要タスクとしてアナウンスする</span></label>
            <label>進行メモ<textarea disabled={readOnly} value={selectedTask.note ?? ""} onChange={(event) => updateTask(selectedTask.id, { note: event.target.value })} placeholder="確認事項・納品条件などを記入" /></label>
          </div>
          <div className="dependency-panel"><span>DEPENDENCY</span>{selectedTask.dependencies.length ? selectedTask.dependencies.map((id) => { const task = tasks.find((item) => item.id === id); return <p key={id}><span className="dependency-line" />{task?.name} の完了後に開始</p>; }) : <p>前工程への依存はありません。</p>}</div>
          {!readOnly && !selectedTask.parentId && <button className="inspector-subtask-button" onClick={() => addSubtask(selectedTask.id)}><Plus size={15} />このタスクに詳細タスクを追加</button>}
          {!readOnly && <button className="delete-button" onClick={() => deleteTask(selectedTask.id)}>このタスクを削除</button>}
        </aside>
      )}

      {workspacePanel === "project" && <aside className="inspector workspace-panel no-print" aria-label="プロジェクト設定">
        <div className="inspector-top"><div><span>案件の設定</span><strong>案件情報</strong></div><button className="icon-button" aria-label="閉じる" onClick={() => setWorkspacePanel(null)}><X size={18} /></button></div>
        <div className="workspace-intro"><p>案件情報</p><h2>案件の名前と期間を設定する。</h2><span>ここで変更した内容は、この案件を見ている人に反映されます。</span></div>
        <div className="project-editor-fields"><label>プロジェクト名<input value={project.title} onChange={(event) => updateProjectInfo({ title: event.target.value || "名称未設定" })} /></label><label>クライアント / 部署<input value={project.client} onChange={(event) => updateProjectInfo({ client: event.target.value || "クライアント未設定" })} /></label><label>登録月<input type="month" value={registrationMonth} disabled /></label><label>開催月<input type="month" min={registrationMonth} value={project.eventMonth ?? timelineEndMonth} onChange={(event) => updateProjectInfo({ eventMonth: event.target.value })} /></label><label>タスクの日付表記<select aria-label="タスクの日付表記" disabled={readOnly} value={project.taskDateFormat} onChange={(event) => updateProjectInfo({ taskDateFormat: event.target.value as TaskDateFormat })}>{taskDateFormatOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
        <div className="project-settings-shortcuts"><button onClick={() => setWorkspacePanel("members")}><Users size={15} /><span>タスク担当者</span><small>{members.length}人</small></button><button onClick={() => setWorkspacePanel("phases")}><Settings2 size={15} /><span>フェーズ</span><small>{phases.length}件</small></button><button onClick={() => { setShareCopied(false); setWorkspacePanel("share"); }}><Share2 size={15} /><span>共有と招待</span><small>編集者・閲覧者</small></button>{projectId && isAuthenticated && <button onClick={() => setWorkspacePanel("activity")}><RotateCcw size={15} /><span>変更ログ</span><small>履歴を確認</small></button>}</div>
        <div className="milestone-editor"><div className="milestone-editor-heading"><span>重要な日</span><button className="utility-button" onClick={addMilestone}><Plus size={14} />重要な日を追加</button></div><p>クライアント確認、撮影日、公開日など、必ず知らせたい日を登録します。</p>{milestones.map((milestone) => <div key={milestone.id} className="milestone-editor-row"><input aria-label="重要な日の名称" value={milestone.title} onChange={(event) => updateMilestone(milestone.id, { title: event.target.value })} /><input aria-label="重要な日の日付" type="date" value={milestone.date} onChange={(event) => updateMilestone(milestone.id, { date: event.target.value })} /><button className="member-delete" title="重要な日を削除" onClick={() => deleteMilestone(milestone.id)}><X size={15} /></button></div>)}</div>
        <div className="workspace-note"><Check size={15} /><span>ログイン中の案件は、権限を持つ参加者へ更新が共有されます。外部共有リンクをすでに送付した場合は、更新後に新しいリンクを発行してください。</span></div>
      </aside>}

      {workspacePanel === "share" && <aside className="inspector workspace-panel no-print" aria-label="外部共有">
        <div className="inspector-top"><div><span>共有とメンバー</span><strong>共有</strong></div><button className="icon-button" aria-label="閉じる" onClick={() => setWorkspacePanel(null)}><X size={18} /></button></div>
        <div className="workspace-intro"><p>この案件だけを共有</p><h2>必要な人に、必要な範囲だけ共有する。</h2><span>共有リンクには、現在開いている「{project.title}」だけが含まれます。受け取った人は他の案件を開けません。</span></div>
        <div className="share-scope-card"><div><Eye size={17} /><div><b>共有されるもの</b><span>工程、日程、担当者、ステータス、フェーズ、進行メモ</span></div></div><div><X size={17} /><div><b>共有されないもの</b><span>他プロジェクト、編集画面、メンバー設定、端末内の保存データ</span></div></div></div>
        <button className="signal-button workspace-add" disabled={createProjectShare.isPending || readOnly} onClick={createShareLink}><Share2 size={16} />{createProjectShare.isPending ? "発行中" : shareCopied ? "リンクをコピーしました" : "7日間の閲覧リンクを発行"}</button>
        {!readOnly && projectSharesQuery.data?.length ? <section className="invite-member-section"><div className="milestone-editor-heading"><span>共有リンク</span><Eye size={15} /></div>{projectSharesQuery.data.map((share) => <div className="invite-member-list" key={share.id}><div><span><b>{share.revokedAt ? "取り消し済み" : new Date(share.expiresAt).getTime() < Date.now() ? "期限切れ" : "有効"}</b><small>期限 {new Date(share.expiresAt).toLocaleString("ja-JP")} ・閲覧 {share.accessCount} 回</small></span>{!share.revokedAt && new Date(share.expiresAt).getTime() >= Date.now() && <button type="button" onClick={async () => { try { await revokeProjectShare.mutateAsync({ publicId: projectId!, shareId: share.id }); await projectSharesQuery.refetch(); toast.success("共有リンクを取り消しました。"); } catch { toast.error("共有リンクを取り消せませんでした。"); } }}>取り消す</button>}</div></div>)}</section> : null}
        {!readOnly && projectId && isAuthenticated && remoteProjectQuery.data?.accessRole !== "viewer" && <section className="invite-member-section"><div className="milestone-editor-heading"><span>MEMBER INVITATION</span><Mail size={15} /></div><h3>編集者・閲覧者を招待</h3><p>メールアドレスと役割を選ぶと、招待リンクをコピーし、メール作成画面を開きます。編集者は招待されたアドレスでログインして参加し、閲覧者はログイン不要でこの案件だけを確認できます。</p><form onSubmit={async (event) => { event.preventDefault(); try { const result = await inviteProjectMember.mutateAsync({ publicId: projectId, email: inviteEmail, role: inviteRole, origin: window.location.origin }); let copied = true; try { await navigator.clipboard.writeText(result.inviteUrl); } catch { copied = false; } const subject = encodeURIComponent(`${project.title} への${inviteRole === "editor" ? "編集者" : "閲覧者"}招待`); const body = encodeURIComponent(`${project.title} に招待されています。\n\n${result.inviteUrl}`); window.location.href = `mailto:${inviteEmail}?subject=${subject}&body=${body}`; setInviteEmail(""); toast.success(copied ? "招待リンクをコピーしました。メールを送信してください。" : "メール作成画面を開きました。招待リンクを本文から送信してください。"); await projectMembersQuery.refetch(); } catch { toast.error("招待を作成できませんでした。メールアドレスと権限を確認してください。"); } }}><input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" aria-label="招待するメールアドレス" /><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "editor" | "viewer")} aria-label="招待する役割"><option value="editor">編集者</option><option value="viewer">閲覧者</option></select><button className="outline-button" type="submit" disabled={inviteProjectMember.isPending}>{inviteProjectMember.isPending ? "準備中" : "招待リンクを作成"}</button></form>{projectMembersQuery.data?.members.length ? <div className="invite-member-list">{projectMembersQuery.data.members.map((member) => <div key={member.id}><span><b>{member.invitedEmail}</b><small>{member.role === "editor" ? "編集者" : "閲覧者"} · {member.status === "active" ? "参加済み" : member.status === "pending" ? "招待中" : "取り消し済み"}</small></span>{member.status !== "revoked" && <button type="button" onClick={async () => { try { await revokeProjectMember.mutateAsync({ publicId: projectId, memberId: member.id }); await projectMembersQuery.refetch(); toast.success("招待を取り消しました。"); } catch { toast.error("招待を取り消せませんでした。"); } }}>取り消す</button>}</div>)}</div> : <small className="invite-empty">まだ招待したメンバーはいません。</small>}</section>}
        {!readOnly && projectId && isAuthenticated && remoteProjectQuery.data?.accessRole !== "viewer" && <section className="invite-member-section"><div className="milestone-editor-heading"><span>メンバー招待</span><Mail size={15} /></div><h3>編集者・閲覧者を招待</h3><p>管理者は新規案件・招待・編集ができます。編集者はタスク、日程、招待を変更できます。閲覧者はこの案件を閲覧するだけで、変更はできません。</p><form onSubmit={async (event) => { event.preventDefault(); try { const result = await inviteProjectMember.mutateAsync({ publicId: projectId, email: inviteEmail, role: inviteRole, origin: window.location.origin }); let copied = true; try { await navigator.clipboard.writeText(result.inviteUrl); } catch { copied = false; } const subject = encodeURIComponent(`${project.title} への${inviteRole === "editor" ? "編集者" : "閲覧者"}招待`); const body = encodeURIComponent(`${project.title} に招待されています。\n\n${result.inviteUrl}`); window.location.href = `mailto:${inviteEmail}?subject=${subject}&body=${body}`; setInviteEmail(""); toast.success(copied ? "招待リンクをコピーしました。メールを送信してください。" : "メール作成画面を開きました。招待リンクを本文から送信してください。"); await projectMembersQuery.refetch(); } catch { toast.error("招待を作成できませんでした。メールアドレスと権限を確認してください。"); } }}><input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" aria-label="招待するメールアドレス" /><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "editor" | "viewer")} aria-label="招待する役割"><option value="editor">編集者</option><option value="viewer">閲覧者</option></select><button className="outline-button" type="submit" disabled={inviteProjectMember.isPending}>{inviteProjectMember.isPending ? "準備中" : "招待リンクを作成"}</button></form>{projectMembersQuery.data?.members.length ? <div className="invite-member-list">{projectMembersQuery.data.members.map((member) => <div key={member.id}><span><b>{member.invitedEmail}</b><small>{member.role === "editor" ? "編集者" : "閲覧者"} · {member.status === "active" ? "参加済み" : member.status === "pending" ? "招待中" : "取り消し済み"}</small></span>{member.status !== "revoked" && <button type="button" onClick={async () => { try { await revokeProjectMember.mutateAsync({ publicId: projectId, memberId: member.id }); await projectMembersQuery.refetch(); toast.success("招待を取り消しました。"); } catch { toast.error("招待を取り消せませんでした。"); } }}>取り消す</button>}</div>)}</div> : <small className="invite-empty">まだ招待したメンバーはいません。</small>}</section>}
        <div className="share-warning"><Eye size={15} /><span>共有リンクはサーバーにハッシュ化して保存され、7日で失効します。必要に応じてここから直ちに取り消せます。URLを知る人は閲覧できるため、機密情報は共有前に進行メモなどから外してください。</span></div>
        <div className="share-steps"><span><b>01</b> リンクをコピー</span><span><b>02</b> 外部スタッフまたはクライアントへ送付</span><span><b>03</b> 閲覧専用で確認</span></div>
      </aside>}
      {workspacePanel === "activity" && <aside className="inspector workspace-panel no-print" aria-label="変更ログ"><div className="inspector-header"><div><span>変更履歴</span><h3>変更ログ</h3></div><button className="icon-button" aria-label="閉じる" onClick={() => setWorkspacePanel(null)}><X size={17} /></button></div><p className="workspace-intro">案件の作成、招待、参加、取消、保存を時系列で確認します。</p><div className="activity-log-list">{projectActivityQuery.isLoading ? <p>読み込み中です。</p> : projectActivityQuery.data?.length ? projectActivityQuery.data.map((item) => <div className="activity-log-row" key={item.id}><i /><div><b>{item.action}</b><span>{item.detail}</span><time>{new Date(item.createdAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}</time></div></div>) : <p>まだ記録はありません。</p>}</div></aside>}

      {(workspacePanel === "members" || workspacePanel === "phases") && <aside className="inspector workspace-panel no-print" aria-label={workspacePanel === "members" ? "メンバー編集" : "フェーズ名編集"}>
        <div className="inspector-top"><div><span>案件の設定</span><strong>{workspacePanel === "members" ? "タスク担当者" : "フェーズ名"}</strong></div><button className="icon-button" aria-label="閉じる" onClick={() => setWorkspacePanel(null)}><X size={18} /></button></div>
        {workspacePanel === "members" ? <>
          <div className="workspace-intro"><p>タスク担当者</p><h2>担当者を案件ごとに整える。</h2><span>追加した名前は、タスク詳細とフィルターの担当者候補にすぐ反映されます。</span></div>
          {!readOnly && <button className="signal-button workspace-add" onClick={addMember}><Plus size={16} />メンバーを追加</button>}
          <div className="member-editor-list">{members.map((member, index) => <article key={member.id} className="member-editor-card"><span className="member-number">{String(index + 1).padStart(2, "0")}</span><div><input aria-label={`${member.name}の氏名`} disabled={readOnly} value={member.name} onChange={(event) => updateMember(member.id, { name: event.target.value })} /><input aria-label={`${member.name}の役割`} disabled={readOnly} value={member.role} onChange={(event) => updateMember(member.id, { role: event.target.value })} /></div>{!readOnly && <button className="member-delete" title="メンバーを削除" onClick={() => deleteMember(member.id)}><X size={15} /></button>}</article>)}</div>
          <div className="workspace-note"><Check size={15} /><span>氏名を変更すると、その担当者が設定済みのタスクにも新しい名前を反映します。</span></div>
        </> : <>
          <div className="workspace-intro"><p>フェーズ</p><h2>制作フェーズを組み立てる。</h2><span>既存フェーズの名称変更に加え、案件独自のフェーズを追加できます。追加後は、サイドバー、ガント、タスク詳細の所属先に反映されます。</span></div>
          {!readOnly && <button className="signal-button workspace-add" onClick={addPhase}><Plus size={16} />フェーズを追加</button>}
          <div className="phase-editor-list">{phases.map((phase, index) => <article key={phase.id} className="phase-editor-row"><span className={`phase-label-bar ${phase.className}`} /><b>{String(index + 1).padStart(2, "0")}</b><input aria-label={`${phase.name}のフェーズ名`} disabled={readOnly} value={phase.name} onChange={(event) => updatePhaseName(phase.id, event.target.value)} /><div className="phase-row-actions no-print"><button disabled={readOnly || index === 0} title="上へ移動" onClick={() => movePhase(phase.id, -1)}>↑</button><button disabled={readOnly || index === phases.length - 1} title="下へ移動" onClick={() => movePhase(phase.id, 1)}>↓</button><button disabled={readOnly || phases.length === 1} title="フェーズを削除" onClick={() => deletePhase(phase.id)}><X size={14} /></button></div></article>)}</div>
          <div className="workspace-note"><Check size={15} /><span>矢印で表示順を入れ替えられます。削除時、配下タスクは隣接フェーズへ移管されます。最後の1フェーズは削除できません。</span></div>
        </>}
      </aside>}

      {showShortcuts && <div className="modal-backdrop no-print" onMouseDown={() => setShowShortcuts(false)}><section className="manual-modal" onMouseDown={(event) => event.stopPropagation()}><button className="icon-button close-modal" onClick={() => setShowShortcuts(false)}><X size={18} /></button><p>使い方</p><h2>案件は、ログインした管理者が作る。</h2><span className="manual-lead">ログインして作った案件は保存されます。削除した案件も、30日間はアーカイブから戻せます。</span><div className="manual-grid"><article><b>01</b><h3>案件を作成</h3><span>管理者が案件一覧で「新規案件」を押し、案件名、クライアント名、開催月を入力します。</span></article><article><b>02</b><h3>日程と担当を決める</h3><span>タスク名、担当者、状態は行内で変えられます。開始日と終わる日を入力してください。</span></article><article><b>03</b><h3>変更を戻す</h3><span>日程を動かして間違えた時は、「その他」のUndoで直前の変更を戻せます。</span></article><article><b>04</b><h3>アラートを見る</h3><span>期限が近い、期限を過ぎた、担当がいないタスクを画面上で確認できます。</span></article><article><b>05</b><h3>共有と権限</h3><span>編集者は案件を変えられます。閲覧者は見るだけです。共有リンクには、この案件だけが表示されます。</span><button onClick={() => { setShowShortcuts(false); setWorkspacePanel("project"); }}>共有と招待を開く <ChevronRight size={14} /></button></article><article><b>06</b><h3>削除から戻す</h3><span>削除した案件は30日間アーカイブに残ります。その間は案件一覧のアーカイブから戻せます。</span></article><article><b>07</b><h3>大切な案件を残す</h3><span>大きな変更の前や納品前には、設定画面からJSONを書き出して保管してください。</span></article></div><div className="manual-footer"><ClipboardCopy size={15} />もっと知りたい時は、案件一覧の「よくある質問」を開いてください。</div></section></div>}
    </div>
  );
}
