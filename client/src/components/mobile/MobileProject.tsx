/**
 * スマホ幅（760px以下）の案件画面。画面は「案件トップ」「ガント」の2つで、
 * タスク詳細は MobileTaskSheet を1つだけ使い、どちらの画面からも同じものを開く。
 * 目盛り・帯・今日の線は、左右同じ余白の箱の中で、すべて日数の割合(%)で置く。
 */
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Eye,
  Flag,
  LayoutList,
  Plus,
  Settings2,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { Phase, PhaseDefinition, ProjectData, Task } from "@/lib/projectTypes";
import { statusMeta } from "@/lib/projectTypes";
import {
  countLateTasks,
  filterMobileTasks,
  getNextTask,
  isLateTask,
  mobileTaskFilters,
  sortMobileTasks,
  type MobileTaskFilter,
} from "@/lib/mobileTaskFilters";
import {
  buildOverviewTicks,
  buildWeekTicks,
  dayCenterPercent,
  formatRangeLabel,
  getBarPlacement,
  getScheduledRange,
  getWeekRange,
  isWithinRange,
  overlapsRange,
} from "@/lib/mobileTimeline";
import { getTaskTone } from "@/lib/statusPresentation";
import { formatTaskDateRange } from "@/lib/taskDateDisplay";
import MobileTaskSheet from "./MobileTaskSheet";

type MobileProjectProps = {
  project: ProjectData;
  tasks: Task[];
  phases: PhaseDefinition[];
  assignees: string[];
  today: string;
  readOnly: boolean;
  progress: number;
  selectedTask: Task | null;
  isSheetOpen: boolean;
  myAssignee: string;
  phaseName: (phase: Phase) => string;
  phaseClass: (phase: Phase) => string;
  onChangeMyAssignee: (name: string) => void;
  onOpenTask: (id: string) => void;
  onCloseTask: () => void;
  onUpdateTask: (id: string, patch: Partial<Task>, cascade?: boolean) => void;
  onMoveTaskStart: (id: string, start: string) => void;
  onDeleteTask: (id: string) => void;
  onAddTask: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onBack: () => void;
};

export default function MobileProject({
  project,
  tasks,
  phases,
  assignees,
  today,
  readOnly,
  progress,
  selectedTask,
  isSheetOpen,
  myAssignee,
  phaseName,
  phaseClass,
  onChangeMyAssignee,
  onOpenTask,
  onCloseTask,
  onUpdateTask,
  onMoveTaskStart,
  onDeleteTask,
  onAddTask,
  onOpenSettings,
  onOpenHelp,
  onBack,
}: MobileProjectProps) {
  const [view, setView] = useState<"list" | "gantt">("list");
  const [filter, setFilter] = useState<MobileTaskFilter>("all");
  const [ganttScope, setGanttScope] = useState<"all" | "week">("all");
  const [ganttLateOnly, setGanttLateOnly] = useState(false);

  const dateFormat = project.taskDateFormat ?? "compact";
  const projectRange = useMemo(() => getScheduledRange(tasks, today), [tasks, today]);
  const ganttRange = ganttScope === "week" ? getWeekRange(today) : projectRange;
  const ticks = useMemo(
    () => (ganttScope === "week" ? buildWeekTicks(ganttRange) : buildOverviewTicks(ganttRange)),
    [ganttScope, ganttRange.start, ganttRange.end, ganttRange.totalDays],
  );
  const showToday = isWithinRange(ganttRange, today);
  const todayPercent = dayCenterPercent(ganttRange, today);

  const doneCount = tasks.filter((task) => task.status === "完了").length;
  const lateCount = countLateTasks(tasks, today);
  const nextTask = getNextTask(tasks, today);
  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        mobileTaskFilters.map((item) => [item.value, filterMobileTasks(tasks, item.value, { today, assignee: myAssignee }).length]),
      ) as Record<MobileTaskFilter, number>,
    [tasks, today, myAssignee],
  );
  const listTasks = useMemo(() => filterMobileTasks(tasks, filter, { today, assignee: myAssignee }), [tasks, filter, today, myAssignee]);

  const ganttTasks = useMemo(() => {
    const scheduled = tasks.filter((task) => !task.isUnscheduled && overlapsRange(ganttRange, task.start, task.end));
    return sortMobileTasks(ganttLateOnly ? scheduled.filter((task) => isLateTask(task, today)) : scheduled);
  }, [tasks, ganttRange.start, ganttRange.end, ganttLateOnly, today]);
  const unscheduledTasks = useMemo(
    () => sortMobileTasks(tasks.filter((task) => task.isUnscheduled)).filter((task) => !ganttLateOnly),
    [tasks, ganttLateOnly],
  );

  const taskBand = (task: Task) => {
    const placement = getBarPlacement(projectRange, task.start, task.end);
    return (
      <span className="pgm-band" aria-hidden="true">
        {isWithinRange(projectRange, today) && <i className="pgm-band-today" style={{ left: `${dayCenterPercent(projectRange, today)}%` }} />}
        {!task.isUnscheduled && placement.visible && (
          <i
            className={`pgm-band-fill pgm-tone-${getTaskTone(task.status, task.isImportant)}`}
            style={{ left: `${placement.left}%`, width: `${Math.max(placement.width, 1.6)}%` }}
          />
        )}
      </span>
    );
  };

  return (
    <div className="pgm-shell">
      <header className="pgm-topbar">
        {/* 共有リンクで見ている人には案件一覧が無い。戻る先が無いので出さない。 */}
        {!readOnly && (
          <button className="pgm-icon-button" aria-label="案件一覧へ戻る" onClick={onBack}>
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="pgm-topbar-title">
          <span>{project.client}</span>
          <strong>{project.title}</strong>
        </div>
        <button className="pgm-icon-button" aria-label="使い方" onClick={onOpenHelp}>
          <CircleHelp size={18} />
        </button>
        {!readOnly && (
          <button className="pgm-icon-button" aria-label="案件の設定" onClick={onOpenSettings}>
            <Settings2 size={18} />
          </button>
        )}
        {!readOnly && (
          <button className="pgm-icon-button is-signal" aria-label="タスクを追加" onClick={onAddTask}>
            <Plus size={20} />
          </button>
        )}
      </header>

      {readOnly && (
        <p className="pgm-shared-banner">
          <Eye size={14} />
          外部共有ビュー：この画面には「{project.title}」だけが表示されます。
        </p>
      )}

      <main className="pgm-main">
        {view === "list" && tasks.length === 0 ? (
          <div className="pgm-zero">
            <p>まだタスクがありません</p>
            <span>最初のタスクを追加すると、ここに一覧とガントが表示されます。</span>
            {!readOnly && (
              <button className="pgm-primary-button" onClick={onAddTask}>
                最初のタスクを追加
              </button>
            )}
          </div>
        ) : view === "list" ? (
          <>
            <section className="pgm-summary" aria-label="案件の状況">
              <div className="pgm-summary-progress">
                <div className="pgm-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>
                  <span>
                    {progress}
                    <small>%</small>
                  </span>
                </div>
                <div>
                  <p>進捗</p>
                  <strong>
                    {doneCount} / {tasks.length}件 完了
                  </strong>
                </div>
              </div>
              <div className={`pgm-summary-late ${lateCount ? "is-late" : ""}`}>
                <p>
                  <TriangleAlert size={13} />
                  遅れ
                </p>
                <strong>{lateCount}件</strong>
              </div>
              {nextTask ? (
                <button className="pgm-summary-next" onClick={() => onOpenTask(nextTask.id)}>
                  <p>次にやること</p>
                  <strong>{nextTask.name}</strong>
                  <span>
                    {nextTask.isUnscheduled ? "日程未定" : formatTaskDateRange(nextTask.start, nextTask.end, dateFormat)} ・{" "}
                    {nextTask.assignee || "担当未設定"}
                  </span>
                  <ChevronRight size={16} />
                </button>
              ) : (
                <p className="pgm-summary-empty">未完了のタスクはありません。</p>
              )}
            </section>

            <nav className="pgm-chips" aria-label="タスクの絞り込み">
              {mobileTaskFilters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={filter === item.value}
                  className={filter === item.value ? "is-active" : ""}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                  <b>{filterCounts[item.value]}</b>
                </button>
              ))}
            </nav>

            {filter === "mine" && (
              <label className="pgm-mine-select">
                <span>自分＝</span>
                <select aria-label="自分として表示する担当者" value={myAssignee} onChange={(event) => onChangeMyAssignee(event.target.value)}>
                  {assignees.map((assignee) => (
                    <option key={assignee} value={assignee}>
                      {assignee}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <section className="pgm-cards" aria-label="タスク一覧">
              {listTasks.length ? (
                listTasks.map((task) => (
                  <button
                    key={task.id}
                    className={`pgm-card ${isLateTask(task, today) ? "is-late" : ""} ${task.isImportant ? "is-important" : ""}`}
                    onClick={() => onOpenTask(task.id)}
                  >
                    <span className="pgm-card-top">
                      <span className="pgm-card-phase">
                        <i className={`pgm-dot ${phaseClass(task.phase)}`} />
                        {phaseName(task.phase)}
                      </span>
                      <span className={`pgm-status ${statusMeta[task.status].tone}`}>
                        <i />
                        {task.status}
                      </span>
                    </span>
                    <strong className="pgm-card-name">
                      {task.parentId ? <em>↳</em> : null}
                      {task.isImportant ? <Flag size={12} fill="currentColor" /> : null}
                      {task.name}
                    </strong>
                    <span className="pgm-card-meta">
                      <span>
                        <CalendarDays size={12} />
                        {task.isUnscheduled ? "日程未定" : formatTaskDateRange(task.start, task.end, dateFormat)}
                      </span>
                      <span>
                        <Users size={12} />
                        {task.assignee || "未設定"}
                      </span>
                      {isLateTask(task, today) && <b className="pgm-card-late">遅れ</b>}
                    </span>
                    {taskBand(task)}
                  </button>
                ))
              ) : (
                <p className="pgm-empty">この条件のタスクはありません。</p>
              )}
            </section>
          </>
        ) : (
          <section className="pgm-gantt" aria-label="ガントチャート">
            <div className="pgm-gantt-controls">
              <div className="pgm-seg" role="group" aria-label="表示する期間">
                <button type="button" aria-pressed={ganttScope === "all"} onClick={() => setGanttScope("all")}>
                  全体
                </button>
                <button type="button" aria-pressed={ganttScope === "week"} onClick={() => setGanttScope("week")}>
                  今週
                </button>
              </div>
              <button
                type="button"
                className={`pgm-chip ${ganttLateOnly ? "is-active" : ""}`}
                aria-pressed={ganttLateOnly}
                onClick={() => setGanttLateOnly((current) => !current)}
              >
                遅れのみ
              </button>
            </div>

            <p className="pgm-gantt-range">
              {formatRangeLabel(ganttRange)} ・ {ganttTasks.length}件
            </p>

            <div className="pgm-plot">
              <div className="pgm-scale" aria-hidden="true">
                {ticks.map((tick) => (
                  <span
                    key={tick.id}
                    // 端の目盛りは、中央寄せのままだと箱の外へ出て文字が切れる。左端は左寄せ、右端は右寄せにする。
                    className={`pgm-tick ${tick.percent <= 0 ? "is-first" : ""} ${tick.percent >= 90 ? "is-last" : ""}`}
                    style={{ left: `${tick.percent}%` }}
                  >
                    <b>{tick.label}</b>
                    {tick.sublabel ? <small>{tick.sublabel}</small> : null}
                  </span>
                ))}
                {showToday && (
                  <span className="pgm-scale-today" style={{ left: `${todayPercent}%` }}>
                    今日
                  </span>
                )}
              </div>

              <div className="pgm-rows">
                {ticks.map((tick) => (
                  <i key={`grid-${tick.id}`} className="pgm-grid-line" style={{ left: `${tick.gridPercent}%` }} aria-hidden="true" />
                ))}
                {showToday && <i className="pgm-today-line" style={{ left: `${todayPercent}%` }} aria-hidden="true" />}
                {ganttTasks.length ? (
                  ganttTasks.map((task) => {
                    const placement = getBarPlacement(ganttRange, task.start, task.end);
                    const isSingleDay = task.start === task.end;
                    return (
                      <button key={task.id} className="pgm-row" onClick={() => onOpenTask(task.id)}>
                        <span className="pgm-row-name">
                          <i className={`pgm-dot ${phaseClass(task.phase)}`} />
                          {task.isImportant ? <Flag size={11} fill="currentColor" /> : null}
                          {task.name}
                        </span>
                        <span className="pgm-track">
                          {isSingleDay ? (
                            <i
                              className={`pgm-mark pgm-tone-${getTaskTone(task.status, task.isImportant)}`}
                              style={{ left: `${dayCenterPercent(ganttRange, task.start)}%` }}
                            />
                          ) : (
                            <i
                              className={`pgm-bar pgm-tone-${getTaskTone(task.status, task.isImportant)}`}
                              style={{ left: `${placement.left}%`, width: `${Math.max(placement.width, 2)}%` }}
                            />
                          )}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="pgm-empty">
                    {ganttLateOnly ? "遅れているタスクはありません。" : "この期間に日程のあるタスクはありません。"}
                  </p>
                )}
              </div>
            </div>

            {unscheduledTasks.length > 0 && (
              <div className="pgm-tbc">
                <span className="pgm-tbc-label">日程未定 {unscheduledTasks.length}件</span>
                <div>
                  {unscheduledTasks.map((task) => (
                    <button key={task.id} onClick={() => onOpenTask(task.id)}>
                      <i className={`pgm-dot ${phaseClass(task.phase)}`} />
                      {task.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="pgm-gantt-note">
              {ganttScope === "all" ? "案件の初日から最終日までを、画面の幅に収めて表示しています。" : "今日からの7日間を表示しています。"}
              帯をタップすると、日程・担当・状態を変更できます。
            </p>
          </section>
        )}
      </main>

      <nav className="pgm-tabs" aria-label="画面の切り替え">
        <button type="button" aria-pressed={view === "list"} className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}>
          <LayoutList size={18} />
          案件トップ
        </button>
        <button type="button" aria-pressed={view === "gantt"} className={view === "gantt" ? "is-active" : ""} onClick={() => setView("gantt")}>
          <CalendarRange size={18} />
          ガント
        </button>
      </nav>

      {isSheetOpen && selectedTask && (
        <MobileTaskSheet
          task={selectedTask}
          tasks={tasks}
          phases={phases}
          assignees={assignees}
          range={projectRange}
          today={today}
          readOnly={readOnly}
          dateFormat={dateFormat}
          phaseName={phaseName}
          phaseClass={phaseClass}
          onUpdate={onUpdateTask}
          onMoveStart={onMoveTaskStart}
          onDelete={onDeleteTask}
          onOpenTask={onOpenTask}
          onClose={onCloseTask}
        />
      )}
    </div>
  );
}
