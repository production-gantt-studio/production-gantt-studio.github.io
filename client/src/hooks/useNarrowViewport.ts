import { useEffect, useState } from "react";

/**
 * 指で触る画面に切り替える幅。860px以下でだけ専用画面を出し、それより広い画面は
 * これまでのPC表示のまま1pxも変えない。
 *
 * 860にしているのは、縦向きタブレット（744 / 768 / 810 / 834）をすべて含め、
 * かつPCのウィンドウ幅には掛からない位置だから。PC表示はマウスを乗せる操作・
 * ドラッグ・列幅調整が前提で、指では扱えないうえ、この幅ではタスク名が潰れる。
 */
export const NARROW_VIEWPORT_MAX_WIDTH = 860;

const QUERY = `(max-width: ${NARROW_VIEWPORT_MAX_WIDTH}px)`;

export function useNarrowViewport() {
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
    setIsNarrow(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return isNarrow;
}
