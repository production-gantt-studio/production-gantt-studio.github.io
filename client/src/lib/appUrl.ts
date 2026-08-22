// Share/invite URLs come back from Edge Functions that only know the caller's
// *origin* (window.location.origin), never the path the SPA is actually served
// under. On GitHub Pages this app lives at /production-gantt-studio/ (see
// vite.config.ts `base`), so a server-built "https://<origin>/project?share=…"
// resolves to a 404 page instead of the app.
//
// toAppUrl() re-anchors any server-returned link onto the app's own base path,
// keeping the query string (which carries the token) untouched. It accepts
// both shapes the functions return today: an absolute URL
// (create-share-link) and a relative path (create-forwarded-share-link).

export function appBasePath(): string {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

export function toAppUrl(urlOrPath: string): string {
  const base = appBasePath();
  let pathname: string;
  let search: string;

  try {
    const parsed = new URL(urlOrPath, window.location.origin);
    pathname = parsed.pathname;
    search = parsed.search;
  } catch {
    return `${window.location.origin}${base}${urlOrPath.startsWith("/") ? "" : "/"}${urlOrPath}`;
  }

  // Already anchored under the app's base path — leave it alone.
  if (base && (pathname === base || pathname.startsWith(`${base}/`))) {
    return `${window.location.origin}${pathname}${search}`;
  }

  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${window.location.origin}${base}${suffix}${search}`;
}
