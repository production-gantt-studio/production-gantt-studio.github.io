// A share URL (?share=<token>) is the only thing a link recipient has. When
// get-shared-project rejects the token — revoked, expired, or unknown — the
// screen must say so rather than falling back to whatever project happens to
// be cached in that browser, which previously rendered someone else's project
// inside the "外部共有ビュー" chrome and named it as the shared one.

export type ShareLinkQueryState = {
  shareToken: string | null;
  isError: boolean;
  isSuccess: boolean;
  hasProject: boolean;
};

export function isShareLinkUnusable({ shareToken, isError, isSuccess, hasProject }: ShareLinkQueryState): boolean {
  if (!shareToken) return false;
  if (isError) return true;
  // Still loading: not yet unusable — the screen should wait, not accuse.
  return isSuccess && !hasProject;
}
