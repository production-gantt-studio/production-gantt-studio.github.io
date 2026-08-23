import { useEffect, useState } from "react";

/**
 * スマホ画面に切り替える幅。760px以下でだけ専用画面を出し、それより広い画面は
 * これまでのPC表示のまま1pxも変えない。
 */
export const NARROW_VIEWPORT_MAX_WIDTH = 760;

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
