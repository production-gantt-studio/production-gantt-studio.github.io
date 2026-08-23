import { useEffect, useState } from "react";

/**
 * 指で触る画面に切り替える幅。860px以下 かつ 実際にタッチで操作する端末の場合だけ
 * 専用画面を出す。それより広い画面、またはPCがウィンドウを狭めただけの場合は
 * これまでのPC表示のまま1pxも変えない。
 *
 * 860にしているのは、縦向きタブレット（744 / 768 / 810 / 834）をすべて含め、
 * かつPCのウィンドウ幅には掛からない位置だから。PC表示はマウスを乗せる操作・
 * ドラッグ・列幅調整が前提で、指では扱えないうえ、この幅ではタスク名が潰れる。
 *
 * 2026-08-23追記: 幅だけでは「PCのブラウザを手動で狭くしただけ」と
 * 「実機のスマホ・タブレット」を区別できず、PCユーザーが窓を狭めただけで
 * スマホ仕様に切り替わる不具合があった。そのため、幅の条件に加えて
 * 「タッチ操作が主な入力手段かどうか」を必ず併せて判定する。
 * - pointer: coarse … 主な入力デバイスの精度が粗い（指など）
 * - hover: none      … 主な入力デバイスがホバー操作をサポートしない
 * のいずれかに該当する端末だけを「タッチ端末」とみなす。マウス/トラックパッドが
 * 主な入力手段のPCは、たとえタッチスクリーン付きでもこれらは真にならないため、
 * ウィンドウをどれだけ狭めてもPC仕様のまま変わらない。
 *
 * 2026-08-24追記: 以前は navigator.maxTouchPoints > 0 もORの一項目に含めていたが、
 * これは「今どちらの入力手段を使っているか」ではなく「物理的にタッチパネルを
 * 搭載しているか」を見てしまう。タッチパネル搭載のWindowsノートPCやSurfaceを
 * マウスで操作していても真になり、ウィンドウを狭めるとスマホ仕様に切り替わる
 * 不具合が別の端末種別で再発するため、判定から外した。pointer/hoverの2条件は
 * どちらも「今アクティブな主入力デバイスの特性」を見るため、マウス操作中は
 * 搭載有無に関わらず正しくfalseになる。
 */
export const NARROW_VIEWPORT_MAX_WIDTH = 860;

const WIDTH_QUERY = `(max-width: ${NARROW_VIEWPORT_MAX_WIDTH}px)`;
const COARSE_POINTER_QUERY = "(pointer: coarse)";
const NO_HOVER_QUERY = "(hover: none)";

function readIsTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  const coarsePointer = window.matchMedia(COARSE_POINTER_QUERY).matches;
  const noHover = window.matchMedia(NO_HOVER_QUERY).matches;
  return coarsePointer || noHover;
}

export function useNarrowViewport() {
  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(WIDTH_QUERY).matches && readIsTouchDevice();
  });

  useEffect(() => {
    const widthMedia = window.matchMedia(WIDTH_QUERY);
    const coarseMedia = window.matchMedia(COARSE_POINTER_QUERY);
    const hoverMedia = window.matchMedia(NO_HOVER_QUERY);

    const recompute = () => setIsNarrow(widthMedia.matches && readIsTouchDevice());

    recompute();
    widthMedia.addEventListener("change", recompute);
    coarseMedia.addEventListener("change", recompute);
    hoverMedia.addEventListener("change", recompute);
    return () => {
      widthMedia.removeEventListener("change", recompute);
      coarseMedia.removeEventListener("change", recompute);
      hoverMedia.removeEventListener("change", recompute);
    };
  }, []);

  return isNarrow;
}
