// create-share-link: mirrors `projects.createShare`. Editor-or-above only
// (matches the original's requireProjectRole(publicId, userId, "editor") —
// a plain viewer cannot issue share links), recent-auth required. Only the
// token's SHA-256 hash is ever stored (see project_share_links.token_hash
// and the RLS/grant setup in migration 20260821000009).

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import { AppError, recordProjectActivity, recordSecurityAudit, requireProjectRole, requireRecentAuthentication } from "../_shared/db.ts";
import { createOpaqueToken, hashIpAddress, hashOpaqueToken } from "../_shared/tokens.ts";
import { parseOrThrow, shareInput } from "../_shared/validation.ts";

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, body, ip }) => {
    if (!user) throw new AppError(401, "ログインしてください。");
    const input = parseOrThrow(shareInput, body);

    await requireRecentAuthentication(user.id);
    const access = await requireProjectRole(input.publicId, user.id, "editor");

    const token = createOpaqueToken();
    const tokenHash = await hashOpaqueToken(token);
    const expiresInDays: 1 | 7 | 30 = input.expiresInDays ?? 7;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("project_share_links").insert({
      project_id: access.project.id,
      token_hash: tokenHash,
      created_by_user_id: user.id,
      expires_at: expiresAt.toISOString(),
    });
    if (error) throw new AppError(500, "共有リンクを作成できませんでした。");

    await recordProjectActivity(
      access.project.id,
      user.id,
      "共有リンク作成",
      `${expiresInDays}日で期限切れになる閲覧専用リンクを作成しました。`,
    );
    await recordSecurityAudit({
      actorUserId: user.id,
      eventType: "project.share.create",
      outcome: "success",
      organizationId: access.project.organization_id,
      projectId: access.project.id,
      metadata: { expiresInDays: expiresInDays },
      ipHash: await hashIpAddress(ip),
    });

    const url = new URL("/project", input.origin);
    url.searchParams.set("share", token);
    return { shareUrl: url.toString(), expiresAt: expiresAt.toISOString() };
  })
);
