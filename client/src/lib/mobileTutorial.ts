/**
 * スマホの初回案内。実際の画面の上に重ねて「ここです」と示す方式にする。
 * 作り物の説明画面ではなく本物を指すので、読んだあとそのまま操作できる。
 *
 * 出す条件はここ1か所に集約する（案件トップ・ガント・詳細シートのどこからでも
 * 同じ判断になるように）。
 */

export const MOBILE_TUTORIAL_STORAGE_KEY = "production-gantt-mobile-tutorial-v1";

export type TutorialStep = {
  id: string;
  title: string;
  body: string;
  /** 光らせる場所。null なら画面中央にカードだけ出す。 */
  target: string | null;
  /** この手順を見せる画面。 */
  view: "list" | "gantt";
  /** 手順に入るとき、実際に最初のタスクを開く。 */
  opensTask?: boolean;
};

export const mobileTutorialSteps: TutorialStep[] = [
  {
    id: "welcome",
    title: "この画面でできること",
    body: "進み具合の確認と、日程・担当・状態の変更が、この画面だけで完結します。30秒で一周します。",
    target: null,
    view: "list",
  },
  {
    id: "roles",
    title: "できることは役割で変わります",
    body: "編集者はタスクの追加・削除・日程変更・メンバーの招待まですべてできます。進捗担当はタスクの「ステータス」と「担当者」の変更だけができます。ログイン不要の共有リンクで見ている人は、閲覧のみで何も変更できません。自分がどれかは、案件を開いた時の案内で確認できます。",
    target: null,
    view: "list",
  },
  {
    id: "summary",
    title: "まず、ここだけ見る",
    body: "進捗、遅れている件数、次にやることが並びます。「次にやること」を押すと、そのタスクが開きます。",
    target: ".pgm-summary",
    view: "list",
  },
  {
    id: "filters",
    title: "見たいものだけに絞る",
    body: "「遅れ」で遅れているものだけ、「今週」で今日からの7日間、「自分」で担当ぶんだけを表示します。",
    target: ".pgm-chips",
    view: "list",
  },
  {
    id: "card",
    title: "タスクを開く",
    body: "カードを押すと詳細が開きます。下の細い帯は、そのタスクが案件全体のどのあたりかを示しています。",
    target: ".pgm-cards .pgm-card",
    view: "list",
  },
  {
    id: "sheet",
    title: "ここで全部変えられる",
    body: "日程、担当、状態、メモまで、パソコンと同じ項目がそろっています。変えた内容はその場で保存されます。",
    target: ".pgm-sheet",
    view: "list",
    opensTask: true,
  },
  {
    id: "gantt",
    title: "全体を俯瞰する",
    body: "案件の初日から最終日までが画面に収まります。縦線が今日、▲は1日だけの予定です。帯を押せば同じ詳細が開きます。",
    target: ".pgm-plot",
    view: "gantt",
  },
];

export function readTutorialSeen(storage: Pick<Storage, "getItem">): boolean {
  try {
    return storage.getItem(MOBILE_TUTORIAL_STORAGE_KEY) === "done";
  } catch {
    // 端末の設定で保存が禁止されている場合は「見ていない」と同じ扱いにする。
    return false;
  }
}

export function writeTutorialSeen(storage: Pick<Storage, "setItem">): void {
  try {
    storage.setItem(MOBILE_TUTORIAL_STORAGE_KEY, "done");
  } catch {
    // 保存できなくても案内自体は成立するので、失敗は無視する。
  }
}

/**
 * 自動で出すかどうか。
 * - 一度見た端末では出さない
 * - 共有リンクの閲覧者には出さない（触る場所がなく、案内の意味がない）
 * - タスクが1件も無いときは出さない（説明する対象が無い。追加後に出る）
 */
export function shouldAutoStartTutorial(input: { seen: boolean; readOnly: boolean; taskCount: number }): boolean {
  return !input.seen && !input.readOnly && input.taskCount > 0;
}

export function getStepIndex(stepId: string): number {
  return mobileTutorialSteps.findIndex((step) => step.id === stepId);
}
