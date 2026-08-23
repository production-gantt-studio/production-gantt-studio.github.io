/**
 * スマホのタスク詳細。アプリ内でこれ1つだけを作り、案件トップの一覧からも
 * ガントの行からも同じものを開く。PCの詳細パネルと同じ項目をすべて持つ。
 */
import { useEffect } from "react";
import { CalendarDays, ChevronRight, Flag, Trash2, X } from "lucide-react";
import type { Phase, PhaseDefinition, Task } from "@/lib/projectTypes";
import { statusMeta, statusOptions } from "@/lib/projectTypes";
import { getAdjacentTasks } from "@/lib/mobileTaskFilters";
import { getTaskTone } from "@/lib/statusPresentation";
import { countDays, dayCenterPercent, getBarPlacement, isWithinRange, monthDayLabel, type TimelineRange } from "@/lib/mobileTimeline";
import { formatTaskDateRange, type TaskDateFormat } from "@/lib/taskDateDisplay";

type MobileTaskSheetProps = {
  task: Task;
  tasks: Task[];
  phases: PhaseDefinition[];
  assignees: string[];
  range: TimelineRange;
  today: string;
  readOnly: boolean;
  dateFormat: TaskDateFormat;
  phaseName: (phase: Phase) => string;
  phaseClass: (phase: Phase) => string;
  onUpdate: (id: string, patch: Partial<Task>, cascade?: boolean) => void;
  onMoveStart: (id: string, start: string) => void;
  onDelete: (id: string) => void;
  onOpenTask: (id: string) => void;
  onClose: () => void;
};

export default function MobileTaskSheet({
  task,
  tasks,
  phases,
  assignees,
  range,
  today,
  readOnly,
  dateFormat,
  phaseName,
  phaseClass,
  onUpdate,
  onMoveStart,
  onDelete,
  onOpenTask,
  onClose,
}: MobileTaskSheetProps) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const { previous, next } = getAdjacentTasks(tasks, task.id);
  const placement = getBarPlacement(range, task.start, task.end);
  const showToday = isWithinRange(range, today);
  const scheduleLabel = task.isUnscheduled ? "日程未定" : formatTaskDateRange(task.start, task.end, dateFormat);
  const dayLabel = task.isUnscheduled ? "—" : `${countDays(task.start, task.end)}日間`;

  const handleDelete = () => {
    if (!window.confirm(`「${task.name}」を削除しますか。この操作は取り消せません。`)) return;
    onDelete(task.id);
  };

  return (
    <div className="pgm-sheet-layer" role="dialog" aria-modal="true" aria-label="タスクの詳細">
      <button className="pgm-sheet-backdrop" aria-label="タスクの詳細を閉じる" onClick={onClose} />
      <section className="pgm-sheet">
        <header className="pgm-sheet-head">
          <span className="pgm-sheet-grip" aria-hidden="true" />
          <div className="pgm-sheet-head-row">
            <span className="pgm-sheet-phase">
              <i className={`pgm-dot ${phaseClass(task.phase)}`} />
              {phaseName(task.phase)}
            </span>
            <button className="pgm-icon-button" aria-label="閉じる" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <input
            className="pgm-sheet-title"
            aria-label="タスク名"
            value={task.name}
            disabled={readOnly}
            onChange={(event) => onUpdate(task.id, { name: event.target.value })}
          />
        </header>

        <div className="pgm-sheet-body">
          <section className="pgm-sheet-overview" aria-label="このタスクの概要">
            <dl className="pgm-overview-grid">
              <div>
                <dt>期間</dt>
                <dd>{scheduleLabel}</dd>
              </div>
              <div>
                <dt>日数</dt>
                <dd>{dayLabel}</dd>
              </div>
              <div>
                <dt>状態</dt>
                <dd>
                  <span className={`pgm-status ${statusMeta[task.status].tone}`}>
                    <i />
                    {task.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt>担当</dt>
                <dd>{task.assignee || "未設定"}</dd>
              </div>
            </dl>

            <div className="pgm-overview-band">
              <span className="pgm-overview-band-label">案件全体の中の位置</span>
              <div className="pgm-band">
                {showToday && <i className="pgm-band-today" style={{ left: `${dayCenterPercent(range, today)}%` }} />}
                {!task.isUnscheduled && placement.visible && (
                  <i
                    className={`pgm-band-fill pgm-tone-${getTaskTone(task.status, task.isImportant)}`}
                    style={{ left: `${placement.left}%`, width: `${Math.max(placement.width, 1.6)}%` }}
                  />
                )}
              </div>
              <span className="pgm-band-scale">
                <b>{monthDayLabel(range.start)}</b>
                <b>{monthDayLabel(range.end)}</b>
              </span>
            </div>

            <div className="pgm-neighbours">
              <div>
                <span>前のタスク</span>
                {previous.length ? (
                  previous.map((item) => (
                    <button key={item.id} onClick={() => onOpenTask(item.id)}>
                      {item.name}
                      <ChevronRight size={13} />
                    </button>
                  ))
                ) : (
                  <p>なし</p>
                )}
              </div>
              <div>
                <span>次のタスク</span>
                {next.length ? (
                  next.map((item) => (
                    <button key={item.id} onClick={() => onOpenTask(item.id)}>
                      {item.name}
                      <ChevronRight size={13} />
                    </button>
                  ))
                ) : (
                  <p>なし</p>
                )}
              </div>
            </div>
          </section>

          <section className="pgm-sheet-fields" aria-label="タスクの設定">
            <label className="pgm-check">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={Boolean(task.isUnscheduled)}
                onChange={(event) =>
                  onUpdate(task.id, event.target.checked ? { isUnscheduled: true } : { isUnscheduled: false, start: today, end: today })
                }
              />
              <span>
                <CalendarDays size={15} />
                日程は未定
              </span>
            </label>

            <div className="pgm-field-pair">
              <label>
                開始日
                <input
                  type="date"
                  disabled={readOnly || task.isUnscheduled}
                  value={task.start}
                  onChange={(event) => onMoveStart(task.id, event.target.value)}
                />
              </label>
              <label>
                終了日
                <input
                  type="date"
                  disabled={readOnly || task.isUnscheduled}
                  min={task.start}
                  value={task.end}
                  onChange={(event) => onUpdate(task.id, { end: event.target.value }, true)}
                />
              </label>
            </div>

            <div className="pgm-field">
              <span className="pgm-field-label">ステータス</span>
              <div className="pgm-status-choice" role="group" aria-label="ステータス">
                {statusOptions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={readOnly}
                    aria-pressed={task.status === status}
                    className={`${statusMeta[status].tone} ${task.status === status ? "is-selected" : ""}`}
                    onClick={() => onUpdate(task.id, { status })}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <label className="pgm-field">
              <span className="pgm-field-label">担当者</span>
              <select disabled={readOnly} value={task.assignee} onChange={(event) => onUpdate(task.id, { assignee: event.target.value })}>
                {assignees.map((assignee) => (
                  <option key={assignee} value={assignee}>
                    {assignee}
                  </option>
                ))}
              </select>
            </label>

            <label className="pgm-field">
              <span className="pgm-field-label">制作フェーズ</span>
              <select disabled={readOnly} value={task.phase} onChange={(event) => onUpdate(task.id, { phase: event.target.value as Phase })}>
                {phases.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="pgm-field">
              <span className="pgm-field-label">親タスク</span>
              <select
                disabled={readOnly}
                value={task.parentId ?? "none"}
                onChange={(event) => onUpdate(task.id, { parentId: event.target.value === "none" ? null : event.target.value })}
              >
                <option value="none">親タスクなし</option>
                {tasks
                  .filter((item) => item.id !== task.id && !item.parentId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="pgm-field">
              <span className="pgm-field-label">依存タスク</span>
              <select
                disabled={readOnly}
                value={task.dependencies[0] ?? "none"}
                onChange={(event) => onUpdate(task.id, { dependencies: event.target.value === "none" ? [] : [event.target.value] }, true)}
              >
                <option value="none">依存なし</option>
                {tasks
                  .filter((item) => item.id !== task.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="pgm-check">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={Boolean(task.isImportant)}
                onChange={(event) => onUpdate(task.id, { isImportant: event.target.checked })}
              />
              <span>
                <Flag size={15} fill={task.isImportant ? "currentColor" : "none"} />
                重要タスクとしてアナウンスする
              </span>
            </label>

            <label className="pgm-field">
              <span className="pgm-field-label">進行メモ</span>
              <textarea
                disabled={readOnly}
                value={task.note ?? ""}
                placeholder="確認事項・納品条件などを記入"
                onChange={(event) => onUpdate(task.id, { note: event.target.value })}
              />
            </label>
          </section>
        </div>

        <footer className="pgm-sheet-foot">
          {readOnly ? (
            <p className="pgm-readonly-note">閲覧専用です。変更はできません。</p>
          ) : (
            <>
              <button className="pgm-primary-button" onClick={onClose}>
                保存して閉じる
              </button>
              <button className="pgm-delete-button" aria-label="このタスクを削除" onClick={handleDelete}>
                <Trash2 size={16} />
                削除
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
