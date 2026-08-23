/**
 * Edit Suite design reminder: this is the calm, editorial control room before
 * entering a project. Keep the action hierarchy to open a case or create one.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronRight, CircleHelp, FileText, FolderKanban, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { cloneTemplateTasks } from "@/lib/projectCreationTemplate";
import { isObsoleteQuickSample, normalizeSampleProjectIdentity } from "@/lib/sampleProjectIdentity";
import { filterLegacyProjectCandidates } from "@/lib/legacyProjectMigration";
import { canStartProjectCreation } from "@/lib/accessControl";
import { useLocation } from "wouter";

const LEGACY_STORAGE_KEY = "production-gantt-studio-v1";
const PROJECTS_STORAGE_KEY = "production-gantt-studio-projects-v1";
const ARCHIVE_STORAGE_KEY = "production-gantt-studio-archive-v1";
const ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type TaskSnapshot = { id: string; phase?: string; name?: string; start?: string; end?: string; status?: string; assignee?: string; dependencies?: string[]; isUnscheduled?: boolean; isImportant?: boolean; parentId?: string | null };
type ProjectSnapshot = { title?: string; client?: string; tasks?: TaskSnapshot[]; phases?: unknown[]; members?: unknown[]; milestones?: unknown[]; collapsedTaskIds?: string[]; collapsedPhaseIds?: string[]; registeredMonth?: string; eventMonth?: string; taskDateFormat?: "compact" | "weekday" | "full"; updatedAt?: string };
type StoredProject = { id: string; project: ProjectSnapshot; createdAt: string; accessRole?: "owner" | "editor" | "viewer" };
type ArchivedProject = StoredProject & { archivedAt: string; expiresAt: string };
type ProjectTemplateKind = "blank" | "video" | "event" | "graphic";

const sampleMembers = [
  { id: "sample-producer", name: "プロデューサー", role: "プロデューサー" },
  { id: "sample-director", name: "ディレクター", role: "ディレクター" },
  { id: "sample-designer", name: "デザイナー", role: "デザイナー" },
];

const samplePhases = [
  { id: "pre", name: "企画・準備", className: "phase-pre" },
  { id: "production", name: "制作・実施", className: "phase-production" },
  { id: "post", name: "事後対応", className: "phase-post" },
];

const videoTemplateProject: ProjectSnapshot = {
  phases: [
    { id: "pre", name: "企画・準備", className: "phase-pre" },
    { id: "production", name: "制作・撮影", className: "phase-production" },
    { id: "post", name: "編集・納品", className: "phase-post" },
  ],
  members: [
    { id: "video-producer", name: "プロデューサー", role: "プロデューサー" },
    { id: "video-director", name: "ディレクター", role: "ディレクター" },
    { id: "video-pm", name: "プロダクションマネージャー", role: "プロダクションマネージャー" },
    { id: "video-editor", name: "エディター", role: "エディター" },
  ],
  tasks: [
    { id: "video-1", phase: "pre", name: "企画骨子", status: "未着手", assignee: "プロデューサー", dependencies: [] },
    { id: "video-2", phase: "pre", name: "コンペプレゼン", status: "未着手", assignee: "プロデューサー", dependencies: ["video-1"] },
    { id: "video-3", phase: "pre", name: "絵コンテ・演出プラン", status: "未着手", assignee: "ディレクター", dependencies: ["video-2"] },
    { id: "video-4", phase: "production", name: "ロケハン", status: "未着手", assignee: "プロダクションマネージャー", dependencies: ["video-3"] },
    { id: "video-5", phase: "production", name: "キャスト・機材決定", status: "未着手", assignee: "プロデューサー", dependencies: ["video-3"] },
    { id: "video-6", phase: "production", name: "香盤・撮影準備", status: "未着手", assignee: "プロダクションマネージャー", dependencies: ["video-4", "video-5"] },
    { id: "video-7", phase: "production", name: "撮影", status: "未着手", assignee: "ディレクター", dependencies: ["video-6"] },
    { id: "video-8", phase: "post", name: "素材整理", status: "未着手", assignee: "エディター", dependencies: ["video-7"] },
    { id: "video-9", phase: "post", name: "仮編集", status: "未着手", assignee: "エディター", dependencies: ["video-8"] },
    { id: "video-10", phase: "post", name: "クライアント確認", status: "未着手", assignee: "プロデューサー", dependencies: ["video-9"] },
    { id: "video-11", phase: "post", name: "修正編集", status: "未着手", assignee: "エディター", dependencies: ["video-10"] },
    { id: "video-12", phase: "post", name: "MA・カラー調整", status: "未着手", assignee: "エディター", dependencies: ["video-11"] },
    { id: "video-13", phase: "post", name: "納品データ作成", status: "未着手", assignee: "プロデューサー", dependencies: ["video-12"] },
    { id: "video-14", phase: "post", name: "最終納品", status: "未着手", assignee: "プロデューサー", dependencies: ["video-13"] },
  ],
};

const sampleProjects: StoredProject[] = [
  {
    id: "sample-video-production",
    createdAt: "2026-08-01T08:55:00.000Z",
    project: {
      title: "動画案件サンプル",
      client: "Sample",
      phases: videoTemplateProject.phases,
      members: videoTemplateProject.members,
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
      milestones: [{ id: "video-shoot-day", title: "撮影日", date: "2026-09-15" }],
      collapsedTaskIds: [],
      collapsedPhaseIds: [],
      registeredMonth: "2026-09",
      eventMonth: "2026-09",
      taskDateFormat: "compact",
      updatedAt: "2026-08-01T08:55:00.000Z",
    },
  },
  {
    id: "sample-event-production",
    createdAt: "2026-08-01T09:00:00.000Z",
    project: {
      title: "イベント案件サンプル",
      client: "Sample",
      phases: samplePhases,
      members: sampleMembers,
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
      milestones: [{ id: "event-day", title: "開催日", date: "2026-09-25" }],
      collapsedTaskIds: [],
      collapsedPhaseIds: [],
      registeredMonth: "2026-09",
      eventMonth: "2026-10",
      taskDateFormat: "compact",
      updatedAt: "2026-08-01T09:00:00.000Z",
    },
  },
  {
    id: "sample-graphic-production",
    createdAt: "2026-08-01T09:05:00.000Z",
    project: {
      title: "グラフィック案件サンプル",
      client: "Sample",
      phases: samplePhases,
      members: sampleMembers,
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
      milestones: [{ id: "graphic-delivery", title: "納品日", date: "2026-09-26" }],
      collapsedTaskIds: [],
      collapsedPhaseIds: [],
      registeredMonth: "2026-09",
      eventMonth: "2026-09",
      taskDateFormat: "compact",
      updatedAt: "2026-08-01T09:05:00.000Z",
    },
  },
];

const sampleProjectFingerprints = sampleProjects.map(({ project }) => ({
  title: project.title ?? "",
  client: project.client ?? "",
  taskCount: project.tasks?.length ?? 0,
}));

const projectTemplateOptions: Array<{ id: ProjectTemplateKind; title: string; description: string }> = [
  { id: "blank", title: "完全新規", description: "空の案件から、必要なタスクだけを追加します。" },
  { id: "video", title: "動画制作", description: "企画・撮影・編集・納品の基本工程を用意します。" },
  { id: "event", title: "イベント制作", description: "企画・設営・本番・事後対応の工程を用意します。" },
  { id: "graphic", title: "グラフィック制作", description: "方向性・デザイン・入稿・納品の工程を用意します。" },
];

const templateProjectByKind: Record<Exclude<ProjectTemplateKind, "blank">, ProjectSnapshot> = {
  video: videoTemplateProject,
  event: sampleProjects.find((item) => item.id === "sample-event-production")!.project,
  graphic: sampleProjects.find((item) => item.id === "sample-graphic-production")!.project,
};

function reconcileSampleProjects(projects: StoredProject[]) {
  return projects.flatMap((item) => {
    const title = item.project.title ?? "";
    const client = item.project.client ?? "";
    const taskCount = item.project.tasks?.length ?? 0;
    if (isObsoleteQuickSample(title, client, taskCount)) return [];
    const identity = normalizeSampleProjectIdentity(title, client, taskCount);
    if (identity.title === title && identity.client === client) return [item];
    return [{ ...item, project: { ...item.project, title: identity.title, client: identity.client } }];
  });
}

function ensureSampleProjects(projects: StoredProject[]) {
  const reconciled = reconcileSampleProjects(projects);
  const existingIds = new Set(reconciled.map((item) => item.id));
  const missing = sampleProjects.filter((item) => !existingIds.has(item.id));
  const seeded = [...reconciled, ...missing];
  if (seeded.length !== projects.length || seeded.some((item, index) => item !== projects[index])) persistProjects(seeded);
  return seeded;
}

function isActiveArchive(item: ArchivedProject) { return new Date(item.expiresAt).getTime() > Date.now(); }
function persistProjects(projects: StoredProject[]) { localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects)); }
function persistArchive(archive: ArchivedProject[]) { localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archive.filter(isActiveArchive))); }

function loadProjects(): StoredProject[] {
  try {
    const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as StoredProject[];
      if (Array.isArray(parsed)) return ensureSampleProjects(parsed.filter((item) => item?.id && item.project));
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const project = JSON.parse(legacy) as ProjectSnapshot;
      return ensureSampleProjects([{ id: "project-default", project, createdAt: project.updatedAt ?? new Date().toISOString() }]);
    }
  } catch {
    // A malformed local value should lead to a usable empty project manager.
  }
  return ensureSampleProjects([]);
}

function loadLegacyProjectsForMigration(): StoredProject[] {
  const sampleIds = sampleProjects.map((item) => item.id);
  try {
    const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (stored) {
      return filterLegacyProjectCandidates<ProjectSnapshot>(JSON.parse(stored), sampleIds, sampleProjectFingerprints);
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const project = JSON.parse(legacy) as ProjectSnapshot;
      return filterLegacyProjectCandidates<ProjectSnapshot>(
        [{ id: "project-default", project, createdAt: project.updatedAt ?? new Date().toISOString() }],
        sampleIds,
        sampleProjectFingerprints,
      );
    }
  } catch {
    // Keep the public Sample view usable when old browser storage is malformed.
  }
  return [];
}

function loadArchive(): ArchivedProject[] {
  try {
    const stored = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) as ArchivedProject[] : [];
    const active = Array.isArray(parsed) ? parsed.filter((item) => item?.id && item.project && item.expiresAt && isActiveArchive(item)) : [];
    persistArchive(active);
    return active;
  } catch {
    return [];
  }
}

function formatDateTime(value?: string) {
  if (!value) return "更新日時なし";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更新日時なし";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatRange(tasks: TaskSnapshot[]) {
  const scheduled = tasks.filter((task) => !task.isUnscheduled && task.start && task.end);
  if (!scheduled.length) return "日程未定";
  const starts = scheduled.map((task) => task.start!).sort();
  const ends = scheduled.map((task) => task.end!).sort();
  const format = (value: string) => new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date(`${value}T12:00:00`));
  return `${format(starts[0])} — ${format(ends.at(-1)!)}`;
}

function projectProgress(tasks: TaskSnapshot[]) { const targets = tasks.filter((task) => !task.parentId); return targets.length ? Math.round((targets.filter((task) => task.status === "完了").length / targets.length) * 100) : 0; }
function monthFromDate(value?: string) { return value?.match(/^\d{4}-\d{2}/)?.[0] ?? ""; }
function formatMonth(value?: string) { if (!value) return "開催月未設定"; const date = new Date(`${value}-01T12:00:00`); return Number.isNaN(date.getTime()) ? "開催月未設定" : new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(date); }
function daysRemaining(expiresAt: string) { return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)); }
function makeProjectId() { return `project-${typeof crypto.randomUUID === "function" ? crypto.randomUUID().slice(0, 8) : Date.now()}`; }

function createProjectFromTemplate(kind: ProjectTemplateKind, title: string, client: string, eventMonth: string, now: string): ProjectSnapshot {
  const template = kind === "blank" ? null : templateProjectByKind[kind];
  const initialDate = now.slice(0, 10);
  return {
    title,
    client,
    tasks: template?.tasks ? cloneTemplateTasks(template.tasks, () => makeProjectId()).map((task) => ({ ...task, start: initialDate, end: initialDate })) : [],
    phases: template?.phases ? structuredClone(template.phases) : [],
    members: template?.members ? structuredClone(template.members) : [],
    milestones: [],
    collapsedTaskIds: [],
    collapsedPhaseIds: [],
    registeredMonth: now.slice(0, 7),
    eventMonth,
    taskDateFormat: "compact",
    updatedAt: now,
  };
}

export default function ProjectIndex() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, loading, user } = useAuth();
  const remoteProjectsQuery = trpc.projects.list.useQuery(undefined, { enabled: isAuthenticated });
  const remoteArchivedProjectsQuery = trpc.projects.listArchived.useQuery(undefined, { enabled: isAuthenticated });
  const createRemoteProject = trpc.projects.create.useMutation();
  const updateRemoteProject = trpc.projects.update.useMutation();
  const deleteRemoteProject = trpc.projects.delete.useMutation();
  const archiveRemoteProject = trpc.projects.archive.useMutation();
  const restoreRemoteProjectMutation = trpc.projects.restore.useMutation();
  const [projects, setProjects] = useState<StoredProject[]>(loadProjects);
  const [archive, setArchive] = useState<ArchivedProject[]>(loadArchive);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftClient, setDraftClient] = useState("");
  const [draftEventMonth, setDraftEventMonth] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplateKind>("blank");
  const [legacyProjects, setLegacyProjects] = useState<StoredProject[]>(loadLegacyProjectsForMigration);
  const [legacyMigrationStatus, setLegacyMigrationStatus] = useState<"idle" | "saving" | "error">("idle");
  const remoteSampleMigrationIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const active = archive.filter(isActiveArchive);
    if (active.length !== archive.length) { setArchive(active); persistArchive(active); }
  }, [archive]);
  useEffect(() => {
    if (!remoteProjectsQuery.data) return;
    const synced = remoteProjectsQuery.data.flatMap(({ project, accessRole }) => {
      try {
        return [{ id: project.publicId, project: JSON.parse(project.data) as ProjectSnapshot, createdAt: project.createdAt.toISOString(), accessRole }];
      } catch {
        return [];
      }
    });
    if (synced.length) setProjects(ensureSampleProjects(synced));
  }, [remoteProjectsQuery.data]);
  useEffect(() => {
    if (!isAuthenticated || !remoteArchivedProjectsQuery.data) return;
    const synced: ArchivedProject[] = remoteArchivedProjectsQuery.data.flatMap(({ project, accessRole, expiresAt }) => {
      if (!project.archivedAt) return [];
      try {
        return [{
          id: project.publicId,
          project: JSON.parse(project.data) as ProjectSnapshot,
          createdAt: project.createdAt.toISOString(),
          accessRole,
          archivedAt: project.archivedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        }];
      } catch {
        return [];
      }
    });
    setArchive(synced);
  }, [isAuthenticated, remoteArchivedProjectsQuery.data]);
  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admin" || !remoteProjectsQuery.data) return;
    const migrations = remoteProjectsQuery.data.flatMap(({ project }) => {
      if (remoteSampleMigrationIdsRef.current.has(project.publicId)) return [];
      try {
        const data = JSON.parse(project.data) as ProjectSnapshot;
        const title = data.title ?? project.title;
        const client = data.client ?? project.client ?? "";
        const taskCount = data.tasks?.length ?? 0;
        remoteSampleMigrationIdsRef.current.add(project.publicId);
        if (isObsoleteQuickSample(title, client, taskCount)) {
          return [deleteRemoteProject.mutateAsync({ publicId: project.publicId })];
        }
        const identity = normalizeSampleProjectIdentity(title, client, taskCount);
        if (identity.title === title && identity.client === client) return [];
        const nextData = JSON.stringify({ ...data, title: identity.title, client: identity.client });
        return [updateRemoteProject.mutateAsync({ publicId: project.publicId, title: identity.title, client: identity.client, eventMonth: data.eventMonth ?? project.eventMonth ?? null, data: nextData })];
      } catch {
        return [];
      }
    });
    if (!migrations.length) return;
    Promise.all(migrations).then(() => remoteProjectsQuery.refetch()).catch(() => {
      remoteSampleMigrationIdsRef.current.clear();
    });
  }, [isAuthenticated, user?.role, remoteProjectsQuery.data, updateRemoteProject, deleteRemoteProject, remoteProjectsQuery]);
  const migrateLegacyProjects = async () => {
    if (!isAuthenticated || user?.role !== "admin" || !legacyProjects.length) return;
    setLegacyMigrationStatus("saving");
    try {
      await Promise.all(
        legacyProjects.map((item) =>
          createRemoteProject.mutateAsync({
            title: item.project.title || "名称未設定",
            client: item.project.client || null,
            eventMonth: item.project.eventMonth || null,
            data: JSON.stringify(item.project),
          }),
        ),
      );
      setLegacyProjects([]);
      setLegacyMigrationStatus("idle");
      await remoteProjectsQuery.refetch();
    } catch {
      setLegacyMigrationStatus("error");
    }
  };

  const visibleProjects = useMemo(() => { const normalized = query.trim().toLowerCase(); return normalized ? projects.filter(({ project }) => `${project.title ?? ""} ${project.client ?? ""}`.toLowerCase().includes(normalized)) : projects; }, [projects, query]);
  const openProject = (projectId: string) => setLocation(`/project?id=${encodeURIComponent(projectId)}`);

  const openCreate = () => {
    if (!isAuthenticated) { startLogin(); return; }
    if (user?.role !== "admin") { window.alert("新規案件を作成できるのはシステム管理者です。"); return; }
    setDraftTitle("");
    setDraftClient("");
    setDraftEventMonth("");
    setSelectedTemplate("blank");
    setIsCreating(true);
  };

  const createProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draftTitle.trim();
    const client = draftClient.trim();
    const eventMonth = draftEventMonth;
    if (!title || !client || !eventMonth) return;
    const now = new Date().toISOString();
    const storedProject: StoredProject = { id: makeProjectId(), createdAt: now, project: createProjectFromTemplate(selectedTemplate, title, client, eventMonth, now) };
    if (isAuthenticated) {
      try {
        const remote = await createRemoteProject.mutateAsync({ title, client, eventMonth, data: JSON.stringify(storedProject.project) });
        setLocation(`/project?id=${encodeURIComponent(remote.publicId)}`);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "案件を作成できませんでした。");
      }
      return;
    }
    const next = [storedProject, ...projects];
    setProjects(next); persistProjects(next); setLocation(`/project?id=${encodeURIComponent(storedProject.id)}`);
  };

  const archiveProject = async (projectId: string, title: string) => {
    if (!window.confirm(`「${title || "名称未設定"}」をアーカイブへ移しますか？\n30日間はアーカイブから復元できます。30日を過ぎると削除されます。`)) return;
    if (isAuthenticated) {
      // Server-persisted projects: DB is authoritative, so archiving/restoring
      // goes through the server (30-day retention enforced there) instead of
      // this device's LocalStorage. See server/routers.ts `projects.archive`.
      try {
        await archiveRemoteProject.mutateAsync({ publicId: projectId });
        await Promise.all([remoteProjectsQuery.refetch(), remoteArchivedProjectsQuery.refetch()]);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "案件をアーカイブできませんでした。");
      }
      return;
    }
    const target = projects.find((item) => item.id === projectId);
    if (!target) return;
    const now = new Date();
    const archived: ArchivedProject = { ...target, archivedAt: now.toISOString(), expiresAt: new Date(now.getTime() + ARCHIVE_RETENTION_MS).toISOString() };
    const nextProjects = projects.filter((item) => item.id !== projectId);
    const nextArchive = [archived, ...archive.filter((item) => item.id !== projectId)];
    setProjects(nextProjects); persistProjects(nextProjects); setArchive(nextArchive); persistArchive(nextArchive);
  };

  const restoreProject = async (projectId: string) => {
    if (isAuthenticated) {
      try {
        await restoreRemoteProjectMutation.mutateAsync({ publicId: projectId });
        await Promise.all([remoteProjectsQuery.refetch(), remoteArchivedProjectsQuery.refetch()]);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "案件を復元できませんでした。期限切れ、または権限がない可能性があります。");
      }
      return;
    }
    const target = archive.find((item) => item.id === projectId);
    if (!target) return;
    const restored: StoredProject = { id: target.id, project: target.project, createdAt: target.createdAt };
    const nextProjects = [restored, ...projects.filter((item) => item.id !== projectId)];
    const nextArchive = archive.filter((item) => item.id !== projectId);
    setProjects(nextProjects); persistProjects(nextProjects); setArchive(nextArchive); persistArchive(nextArchive);
  };

  return (
    <div className="studio-shell manager-shell">
      <aside className="studio-sidebar no-print"><div className="brand-lockup"><span className="brand-mark" role="img" aria-label="Production Gantt Studio">PG</span><div><p className="brand-name">PRODUCTION</p><p className="brand-name brand-name-accent">GANTT STUDIO</p></div></div><div className="side-section-label">メニュー</div><nav className="side-nav" aria-label="案件管理メニュー"><button className="side-nav-item active" title="案件一覧"><FolderKanban size={17} /><span className="side-nav-label">案件一覧</span><span className="side-nav-count">{projects.length}</span></button></nav><div className="manager-sidebar-note"><FileText size={16} /><div><b>あなたの案件</b><span>参加している案件だけを表示します。</span></div></div><div className="sidebar-bottom"><button className="side-nav-item" title="アーカイブ" onClick={() => setShowArchive(true)}><RotateCcw size={17} /><span className="side-nav-label">アーカイブ</span><span className="side-nav-count">{archive.length}</span></button><button className="side-nav-item" title="使い方" onClick={() => setShowManual(true)}><CircleHelp size={17} /><span className="side-nav-label">使い方</span></button><button className="side-nav-item" title="よくある質問" onClick={() => setLocation("/faq")}><CircleHelp size={17} /><span className="side-nav-label">よくある質問</span></button><div className="profile-row"><span className="avatar">{user?.name?.slice(0, 2) || "未"}</span><span><strong>{user?.name || "ログインしていません"}</strong><small>{user?.role === "admin" ? "管理者" : "編集者"}</small></span></div></div></aside>
      <main className="studio-main manager-main"><header className="topbar no-print"><div className="breadcrumb"><strong>案件一覧</strong></div><div className="topbar-actions">{canStartProjectCreation(isAuthenticated, user?.role === "admin" ? "admin" : user?.role ? "user" : undefined) && <button className="signal-button" onClick={openCreate} disabled={loading}><Plus size={17} />{isAuthenticated ? "新規案件" : "ログイン"}</button>}</div></header><section className="manager-heading"><div><h1>案件一覧</h1><p>案件を選ぶと、タスクと日程をすぐに確認できます。</p></div><div className="manager-summary"><span>表示中の案件</span><strong>{projects.length}<small>件</small></strong><p>{isAuthenticated ? "あなたが参加している案件" : "ログインして案件を管理"}</p></div></section>{isAuthenticated && user?.role === "admin" && legacyProjects.length > 0 && <section className="legacy-migration-notice no-print" aria-live="polite"><div><b>このブラウザに以前の案件があります</b><span>Sampleは保存しません。必要な案件だけを確認してから保存できます。</span>{legacyMigrationStatus === "error" && <small>保存できませんでした。ログイン状態を確認して、もう一度お試しください。</small>}</div><button className="outline-button" type="button" onClick={migrateLegacyProjects} disabled={legacyMigrationStatus === "saving"}>{legacyMigrationStatus === "saving" ? "保存中" : `以前の案件を保存（${legacyProjects.length}件）`}</button></section>}<section className="manager-toolbar no-print" aria-label="案件を検索"><div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="案件名またはクライアント名を検索" /><kbd>⌘K</kbd></div><button className="utility-button" onClick={() => setShowArchive(true)}><RotateCcw size={15} />アーカイブ {archive.length}</button><span>{visibleProjects.length} 件を表示</span></section>
        {visibleProjects.length ? <section className="project-card-grid" aria-label="案件一覧">{visibleProjects.map(({ id, project, accessRole }) => { const tasks = project.tasks ?? []; const reviewCount = tasks.filter((task) => task.status === "クライアント確認中" || task.status === "修正中").length; const unscheduledCount = tasks.filter((task) => task.isUnscheduled).length; const registeredMonth = project.registeredMonth || monthFromDate(project.updatedAt) || monthFromDate(tasks.map((task) => task.start).filter(Boolean).sort()[0]); const fallbackEventMonth = monthFromDate(tasks.filter((task) => !task.isUnscheduled).map((task) => task.end).filter(Boolean).sort().at(-1)); const progress = projectProgress(tasks); const canArchive = !isAuthenticated || accessRole !== "viewer"; return <article key={id} className="manager-project-card"><div className="manager-card-top"><span>案件</span><time>更新 {formatDateTime(project.updatedAt)}</time></div><div className="manager-card-title"><h2>{project.title || "名称未設定"}</h2><p>{project.client || "クライアント未設定"}</p></div><div className="manager-card-period"><CalendarDays size={14} /><span>登録 {formatMonth(registeredMonth)}</span><i /><span>開催 {formatMonth(project.eventMonth || fallbackEventMonth)}</span></div><div className="manager-card-status"><div className="manager-progress-track"><i style={{ width: `${progress}%` }} /></div><b>{progress}% 完了</b><span>{formatRange(tasks)}</span></div><dl className="manager-card-stats"><div><dt>タスク</dt><dd>{tasks.length}</dd></div><div><dt>確認待ち</dt><dd>{reviewCount}</dd></div><div><dt>日程未定</dt><dd>{unscheduledCount}</dd></div></dl><div className="manager-card-actions"><button className="manager-open-button" onClick={() => openProject(id)}>案件を開く <ChevronRight size={16} /></button>{canArchive && <button className="manager-delete-button" onClick={() => archiveProject(id, project.title ?? "")} title="アーカイブへ移す" aria-label={`${project.title || "名称未設定"}をアーカイブへ移す`}><Trash2 size={15} /></button>}</div></article>; })}</section> : <section className="manager-empty"><div><FolderKanban size={28} /><p>案件はまだありません</p><h2>{query ? "該当する案件がありません。" : "最初の案件を作成しましょう。"}</h2><span>{query ? "検索語を変えるか、新しい案件を作成してください。" : "案件名とクライアント名を入力し、作り方を選択してください。"}</span><button className="signal-button" onClick={openCreate}><Plus size={17} />新規案件</button></div></section>}
      </main>
      {isCreating && <div className="modal-backdrop no-print" onMouseDown={() => setIsCreating(false)}><form className="project-create-modal" onSubmit={createProject} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="icon-button close-modal" aria-label="閉じる" onClick={() => setIsCreating(false)}><X size={18} /></button><p>新規案件</p><h2>案件情報と作り方を選択</h2><span>案件名、クライアント名、開催月を入力し、完全新規または制作に合うテンプレートを選びます。テンプレートのタスクは日程未定・未着手で作成されます。</span><label>案件名<input autoFocus required value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="例：2026 春季キャンペーン" /></label><label>クライアント名<input required value={draftClient} onChange={(event) => setDraftClient(event.target.value)} placeholder="例：株式会社サンプル" /></label><label>開催月<input type="month" required value={draftEventMonth} onChange={(event) => setDraftEventMonth(event.target.value)} /></label><fieldset className="template-choice-set"><legend>作り方</legend><div className="template-choice-grid">{projectTemplateOptions.map((option) => <button key={option.id} type="button" className={`template-choice ${selectedTemplate === option.id ? "is-selected" : ""}`} aria-pressed={selectedTemplate === option.id} onClick={() => setSelectedTemplate(option.id)}><b>{option.title}</b><span>{option.description}</span></button>)}</div></fieldset><div><button type="button" className="outline-button" onClick={() => setIsCreating(false)}>キャンセル</button><button type="submit" className="signal-button" disabled={!draftTitle.trim() || !draftClient.trim() || !draftEventMonth}>{selectedTemplate === "blank" ? "完全新規で作成" : "テンプレートで作成"}</button></div></form></div>}
      {showManual && <div className="modal-backdrop no-print" onMouseDown={() => setShowManual(false)}><section className="manual-modal" onMouseDown={(event) => event.stopPropagation()}><button className="icon-button close-modal" aria-label="閉じる" onClick={() => setShowManual(false)}><X size={18} /></button><p>使い方</p><h2>案件は、ログインしてから作る。</h2><span className="manual-lead">案件を作れるのは、ログインした管理者だけです。作った案件はアプリに保存され、勝手に消える仕様ではありません。</span><div className="manual-grid"><article><b>01</b><h3>新規案件を作成</h3><span>管理者がログイン後、右上の「新規案件」を押します。案件名、クライアント名、開催月を入力します。</span></article><article><b>02</b><h3>作り方を選ぶ</h3><span>完全新規は空の案件です。動画・イベント・グラフィックは、基本のフェーズ、担当者、タスクを用意します。</span></article><article><b>03</b><h3>日程を入れる</h3><span>案件を開き、タスクの開始日、終わる日、担当する人を決めます。テンプレートのタスクは日程未定で始まります。</span></article><article><b>04</b><h3>変更を戻す</h3><span>日程を間違えて動かした時は、「その他」のUndoで直前の変更を戻せます。</span></article><article><b>05</b><h3>共有する</h3><span>編集者は変更できます。閲覧者は見るだけです。共有リンクは、その案件だけを見せます。</span></article><article><b>06</b><h3>削除から戻す</h3><span>削除した案件は、30日間アーカイブに残ります。その間は「アーカイブ」から戻せます。</span></article><article><b>07</b><h3>大切な案件を残す</h3><span>大きな変更の前や納品前には、設定画面からJSONを書き出して保管してください。</span></article><article><b>08</b><h3>もっと知りたい時</h3><span>「よくある質問」では、保存、削除、共有リンクをやさしい言葉で説明しています。</span><button onClick={() => { setShowManual(false); setLocation("/faq"); }}>よくある質問を開く <ChevronRight size={14} /></button></article></div><div className="manual-footer"><CircleHelp size={15} />管理者は案件を作り招待します。編集者は案件を変えます。閲覧者は見るだけです。</div></section></div>}
      {showArchive && <div className="modal-backdrop no-print" onMouseDown={() => setShowArchive(false)}><section className="archive-modal" onMouseDown={(event) => event.stopPropagation()}><button className="icon-button close-modal" aria-label="閉じる" onClick={() => setShowArchive(false)}><X size={18} /></button><p>30日間の保管</p><h2>アーカイブ</h2><span>削除した案件は30日間保持されます。復元すると案件一覧へ戻り、期限を過ぎた案件は完全に削除されます。</span>{archive.length ? <div className="archive-list">{archive.map((item) => <article key={item.id} className="archive-row"><div><b>{item.project.title || "名称未設定"}</b><span>{item.project.client || "クライアント未設定"} · 削除 {formatDateTime(item.archivedAt)}</span></div><div><small>あと {daysRemaining(item.expiresAt)} 日</small>{(!isAuthenticated || item.accessRole !== "viewer") && <button className="outline-button" onClick={() => restoreProject(item.id)}><RotateCcw size={14} />復元</button>}</div></article>)}</div> : <div className="archive-empty"><RotateCcw size={22} /><b>アーカイブ済みの案件はありません。</b></div>}</section></div>}
    </div>
  );
}
