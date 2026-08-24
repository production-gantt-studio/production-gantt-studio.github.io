/**
 * 進捗担当(project_members.role = "viewer")に許した範囲だけを、保存済みの
 * 案件データへ重ねるための純粋関数。
 *
 * 設計の要点(ここが権限の実体):
 *
 *   1. 「送られてきた案件データを検査して、違反があれば拒否する」方式は取らない。
 *      案件データは1つのJSONの塊で保存されており、画面側の正規化(古い形式の補完・
 *      フェーズ名の補正など)で本人の意図と無関係な差分が出るため、厳密比較では
 *      正当な操作まで拒否してしまう。
 *   2. 代わりに「保存済みのデータを土台にして、状態(status)と担当者(assignee)、
 *      および担当引継ぎ(handoffs)の記録だけを上書きする」方式を取る。
 *      許可していない項目は、送られてきても単に無視される。
 *      → 送信内容がどうであれ、書き込まれる結果は必ず土台+2項目に収まる。
 *   3. 土台は常に「その時点でDBに入っている最新データ」なので、進捗担当の
 *      保存が、編集者が並行して行った変更を巻き戻すことがない。
 *
 * Denoの機能もnpmパッケージも使わない素のTypeScriptにしてあるので、Edge Function
 * (Deno)からも、リポジトリのテスト(vitest / Node)からも同じ実体を読める。
 */

/** 画面(client/src/lib/projectTypes.ts の Status)と同じ並び。ここに無い値は受け付けない。 */
export const EDITABLE_TASK_STATUSES = ["未着手", "進行中", "クライアント確認中", "修正中", "完了"] as const;
export type EditableTaskStatus = (typeof EDITABLE_TASK_STATUSES)[number];

/** 担当者名の上限。画面のメンバー名はこれよりずっと短い。異常に長い値を弾くための保険。 */
const MAX_ASSIGNEE_LENGTH = 120;
/** 引継ぎ記録の保持上限。無制限に積まれてJSONが肥大するのを防ぐ。 */
const MAX_HANDOFFS = 500;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEditableStatus(value: unknown): value is EditableTaskStatus {
  return typeof value === "string" && (EDITABLE_TASK_STATUSES as readonly string[]).includes(value);
}

/** 担当者は自由入力ではなく画面上の選択だが、サーバー側でも長さと制御文字だけは見る。 */
function isAcceptableAssignee(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length > MAX_ASSIGNEE_LENGTH) return false;
  // deno-lint-ignore no-control-regex
  return !/[\u0000-\u001f\u007f]/.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export type TaskProgressOverlayResult = {
  /** 実際にDBへ書き込むべき案件データ。changed が false のときは書き込み不要。 */
  data: JsonObject;
  changed: boolean;
  statusChanges: number;
  assigneeChanges: number;
  handoffAdditions: number;
  handoffAcknowledgements: number;
};

/**
 * 引継ぎ記録(担当者を変えたときに画面が作る「誰から誰へ」の控え)の取り込み。
 * 追加は「保存済みに無いidだけ」、更新は「未確認→確認済み」の一方向だけ許す。
 * 既存記録の書き換え・削除は行わない。
 */
function mergeHandoffs(storedHandoffs: unknown, incomingHandoffs: unknown) {
  const stored = Array.isArray(storedHandoffs) ? storedHandoffs : [];
  const incoming = Array.isArray(incomingHandoffs) ? incomingHandoffs : [];
  if (!incoming.length) return { handoffs: stored, additions: 0, acknowledgements: 0, changed: false };

  const incomingById = new Map<string, JsonObject>();
  for (const entry of incoming) {
    if (isObject(entry) && isNonEmptyString(entry.id)) incomingById.set(entry.id, entry);
  }

  let acknowledgements = 0;
  const storedIds = new Set<string>();
  const merged = stored.map((entry) => {
    if (!isObject(entry) || !isNonEmptyString(entry.id)) return entry;
    storedIds.add(entry.id);
    const candidate = incomingById.get(entry.id);
    if (!candidate) return entry;
    const alreadyAcknowledged = isNonEmptyString(entry.acknowledgedAt);
    if (!alreadyAcknowledged && isNonEmptyString(candidate.acknowledgedAt)) {
      acknowledgements += 1;
      return { ...entry, acknowledgedAt: candidate.acknowledgedAt };
    }
    return entry;
  });

  let additions = 0;
  for (const entry of incoming) {
    if (merged.length >= MAX_HANDOFFS) break;
    if (!isObject(entry)) continue;
    if (!isNonEmptyString(entry.id) || storedIds.has(entry.id)) continue;
    if (!isNonEmptyString(entry.taskId) || !isNonEmptyString(entry.taskName)) continue;
    storedIds.add(entry.id);
    merged.push({ ...entry, acknowledgedAt: isNonEmptyString(entry.acknowledgedAt) ? entry.acknowledgedAt : null });
    additions += 1;
  }

  return { handoffs: merged, additions, acknowledgements, changed: additions > 0 || acknowledgements > 0 };
}

/**
 * 保存済みデータ(stored)へ、送られてきたデータ(incoming)のうち
 * 「タスクの状態」「タスクの担当者」「担当引継ぎの記録」だけを重ねて返す。
 *
 * - タスクは保存済みの id を基準に突き合わせる。送られてきた側にしか無い id は無視する
 *   (＝進捗担当はタスクを増やせない)。保存済みにしか無い id はそのまま残る
 *   (＝進捗担当はタスクを消せない)。
 * - タスクの並び順・名称・日程・フェーズ・親子・依存・重要フラグ・メモ、
 *   案件名・クライアント名・開催月・メンバー表・フェーズ表・重要な日は一切触らない。
 */
export function applyTaskProgressOverlay(stored: unknown, incoming: unknown, nowIso: string): TaskProgressOverlayResult {
  const base: JsonObject = isObject(stored) ? stored : {};
  const empty: TaskProgressOverlayResult = {
    data: base,
    changed: false,
    statusChanges: 0,
    assigneeChanges: 0,
    handoffAdditions: 0,
    handoffAcknowledgements: 0,
  };

  if (!isObject(stored) || !Array.isArray(stored.tasks)) return empty;
  if (!isObject(incoming)) return empty;

  const incomingTasks = Array.isArray(incoming.tasks) ? incoming.tasks : [];
  const incomingById = new Map<string, JsonObject>();
  for (const task of incomingTasks) {
    if (isObject(task) && isNonEmptyString(task.id)) incomingById.set(task.id, task);
  }

  let statusChanges = 0;
  let assigneeChanges = 0;

  const nextTasks = stored.tasks.map((task) => {
    if (!isObject(task) || !isNonEmptyString(task.id)) return task;
    const candidate = incomingById.get(task.id);
    if (!candidate) return task;

    const patch: JsonObject = {};
    if (isEditableStatus(candidate.status) && candidate.status !== task.status) {
      patch.status = candidate.status;
      statusChanges += 1;
    }
    if (isAcceptableAssignee(candidate.assignee) && candidate.assignee !== task.assignee) {
      patch.assignee = candidate.assignee;
      assigneeChanges += 1;
    }
    return Object.keys(patch).length ? { ...task, ...patch } : task;
  });

  const handoffs = mergeHandoffs(stored.handoffs, incoming.handoffs);
  const changed = statusChanges > 0 || assigneeChanges > 0 || handoffs.changed;
  if (!changed) return empty;

  return {
    data: { ...stored, tasks: nextTasks, handoffs: handoffs.handoffs, updatedAt: nowIso },
    changed: true,
    statusChanges,
    assigneeChanges,
    handoffAdditions: handoffs.additions,
    handoffAcknowledgements: handoffs.acknowledgements,
  };
}

/** 監査ログ・履歴に出す日本語の要約。件数が0の項目は出さない。 */
export function describeTaskProgressChange(result: TaskProgressOverlayResult): string {
  const parts: string[] = [];
  if (result.statusChanges) parts.push(`状態 ${result.statusChanges}件`);
  if (result.assigneeChanges) parts.push(`担当者 ${result.assigneeChanges}件`);
  if (result.handoffAcknowledgements) parts.push(`引継ぎ確認 ${result.handoffAcknowledgements}件`);
  return parts.length ? `${parts.join(" / ")}を更新しました。` : "更新はありませんでした。";
}
