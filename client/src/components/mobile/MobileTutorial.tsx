/**
 * 実際の画面の上に案内カードを重ねる。作り物の説明画面ではなく本物の
 * 案件トップ・ガントの上に出すので、読んだあとそのまま同じ操作ができる。
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { mobileTutorialSteps, writeTutorialSeen } from "@/lib/mobileTutorial";

type Rect = { top: number; left: number; width: number; height: number };

type MobileTutorialProps = {
  onFinish: () => void;
  onNeedView: (view: "list" | "gantt") => void;
  onNeedTask: () => void;
  onCloseTask: () => void;
};

export default function MobileTutorial({ onFinish, onNeedView, onNeedTask, onCloseTask }: MobileTutorialProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = mobileTutorialSteps[index];

  useEffect(() => {
    onNeedView(step.view);
    // タスク詳細を説明する手順以外では、前の手順で開いたシートを必ず閉じる。
    // 閉じ忘れるとガントの案内がシートの裏に隠れる。
    if (step.opensTask) onNeedTask();
    else onCloseTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(step.target);
      if (!el) {
        // シートが開くアニメーション中など、まだ要素が無い瞬間がある。次のフレームで再試行する。
        frame = window.requestAnimationFrame(measure);
        return;
      }
      const box = el.getBoundingClientRect();
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
    };
    measure();
    return () => window.cancelAnimationFrame(frame);
  }, [step.target, step.view, step.opensTask]);

  const finish = () => {
    writeTutorialSeen(window.localStorage);
    onFinish();
  };

  const next = () => {
    if (index === mobileTutorialSteps.length - 1) {
      finish();
      return;
    }
    setIndex((current) => current + 1);
  };

  const back = () => setIndex((current) => Math.max(0, current - 1));

  const cardStyle = rect
    ? {
        top: `${Math.min(rect.top + rect.height + 12, window.innerHeight - 220)}px`,
        left: "16px",
        right: "16px",
      }
    : undefined;

  return (
    <div className="pgm-tutorial-layer" role="dialog" aria-modal="true" aria-label="はじめてのご案内">
      <div className="pgm-tutorial-veil" />
      {rect && (
        <div
          className="pgm-tutorial-highlight"
          style={{ top: `${rect.top - 6}px`, left: `${rect.left - 6}px`, width: `${rect.width + 12}px`, height: `${rect.height + 12}px` }}
        />
      )}
      <section className={`pgm-tutorial-card ${rect ? "is-anchored" : "is-centered"}`} style={cardStyle}>
        <button className="pgm-tutorial-close" aria-label="案内を終わる" onClick={finish}>
          <X size={16} />
        </button>
        <span className="pgm-tutorial-progress">
          {index + 1} / {mobileTutorialSteps.length}
        </span>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="pgm-tutorial-actions">
          {index > 0 && (
            <button className="pgm-tutorial-back" onClick={back}>
              戻る
            </button>
          )}
          <button className="pgm-tutorial-skip" onClick={finish}>
            スキップ
          </button>
          <button className="pgm-tutorial-next" onClick={next}>
            {index === mobileTutorialSteps.length - 1 ? "はじめる" : "次へ"}
          </button>
        </div>
      </section>
    </div>
  );
}
