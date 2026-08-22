// create-forwarded-share-link: a brand-new, PUBLIC (no JWT required)
// capability from the Manus/Gemini review (Section 5-2): a viewer who
// already holds a valid share URL can mint a NEW child share URL for the
// same project, without ever logging in. This function is deliberately the
// most input-restricted one in the whole app — every one of the 9 fixed
// requirements below exists because a fully public, unauthenticated
// mutation is the highest-risk shape an Edge Function can have.
//
//  1. Accepts ONLY `parentToken` as input — nothing else. No publicId, no
//     projectId, no custom expiry, no creator id, no other link id. (See
//     _shared/validation.ts's forwardedShareInput.)
//  2. The parent token is hashed server-side and looked up by hash — the
//     raw token is never stored, logged, or echoed back.
//  3. The parent link, AND every one of ITS ancestors up the chain, must be
//     currently valid (resolveValidShareLinkChain re-checks revoked_at/
//     expires_at at READ TIME for the whole chain, not just once at some
//     earlier creation time).
//  4. project_id for the new child link is derived ONLY from the resolved
//     parent row — never from any client-supplied value.
//  5. The new link's expiry is min(parent.expires_at, now + standard
//     duration) — it can never outlive its parent, and never exceeds the
//     same "standard duration" a normal owner/editor-issued link gets.
//  6. parent_share_link_id is stored on the new row, so future ancestor-
//     chain checks (and cascading revocation) see this link as the parent's
//     child.
//  7. The response contains ONLY the new URL and its expiry — never the
//     project list, member list, other share links, the parent's token/
//     hash, or any audit data.
//  8. An invalid/expired/revoked parent (at any point in its chain) yields
//     exactly one generic message ("この共有URLは利用できません。") with no
//     distinguishing detail about *why* — never "parent not found" vs.
//     "parent revoked" vs. "ancestor expired", which would let an attacker
//     map out link states by probing.
//  9. Callable without a JWT (public), but CORS still restricts the caller
//     to the actual known origins (see _shared/cors.ts — never "*"), plus
//     rate-limiting by parent-link-id and by IP hash. Every attempt
//     (success, denied, or failure) is audit-logged with actor_user_id =
//     null (there is no authenticated actor), project_id, the parent link
//     id, the outcome, and an IP hash — never the raw token.
//
// The response's `shareUrl` is a relative path (e.g. "/project?share=...")
// rather than an absolute URL: unlike create-share-link (which accepts an
// authenticated caller's own `origin`), this function accepts no `origin`
// input at all — see requirement 1 above — so the client is responsible for
// prefixing it with window.location.origin + the app's own base path.

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import { AppError, recordSecurityAudit, resolveValidShareLinkChain } from "../_shared/db.ts";
import { createOpaqueToken, hashIpAddress, hashOpaqueToken } from "../_shared/tokens.ts";
import { forwardedShareInput, parseOrThrow } from "../_shared/validation.ts";

const STANDARD_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // same "standard" duration create-share-link defaults to
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_PER_IP = 20;
const RATE_LIMIT_MAX_PER_PARENT = 30;
const GENERIC_DENIAL_MESSAGE = "この共有URLは利用できません。";
const EVENT_TYPE = "project.share.forward";

async function countRecentAttempts(filters: { ipHash?: string | null; parentShareLinkId?: string | null }): Promise<number> {
  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  let query = supabase
    .from("security_audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("event_type", EVENT_TYPE)
    .gt("created_at", cutoff);
  if (filters.ipHash) query = query.eq("ip_hash", filters.ipHash);
  if (filters.parentShareLinkId) query = query.eq("metadata->>parentShareLinkId", filters.parentShareLinkId);

  const { count, error } = await query;
  // Fail OPEN on the rate-limit count itself: an audit-log read hiccup must
  // never block legitimate traffic on its own — the hard validity/ancestor
  // checks elsewhere in this function are what actually gate access. A
  // failure here only means the soft rate limit is skipped for this one
  // request.
  if (error) return 0;
  return count ?? 0;
}

Deno.serve((req) =>
  withHandler(req, { requireAuth: false }, async ({ body, ip }) => {
    const input = parseOrThrow(forwardedShareInput, body);
    const ipHash = await hashIpAddress(ip);

    if (ipHash && (await countRecentAttempts({ ipHash })) >= RATE_LIMIT_MAX_PER_IP) {
      await recordSecurityAudit({
        actorUserId: null,
        eventType: EVENT_TYPE,
        outcome: "denied",
        metadata: { reason: "rate_limited_ip" },
        ipHash,
      });
      throw new AppError(429, GENERIC_DENIAL_MESSAGE);
    }

    const supabase = createServiceRoleClient();
    const parentTokenHash = await hashOpaqueToken(input.parentToken);
    const { data: parentRow } = await supabase
      .from("project_share_links")
      .select("id, project_id")
      .eq("token_hash", parentTokenHash)
      .maybeSingle();

    if (!parentRow) {
      await recordSecurityAudit({
        actorUserId: null,
        eventType: EVENT_TYPE,
        outcome: "denied",
        metadata: { reason: "parent_invalid" },
        ipHash,
      });
      throw new AppError(404, GENERIC_DENIAL_MESSAGE);
    }

    if ((await countRecentAttempts({ parentShareLinkId: parentRow.id as string })) >= RATE_LIMIT_MAX_PER_PARENT) {
      await recordSecurityAudit({
        actorUserId: null,
        eventType: EVENT_TYPE,
        outcome: "denied",
        projectId: parentRow.project_id as string,
        metadata: { reason: "rate_limited_parent", parentShareLinkId: parentRow.id },
        ipHash,
      });
      throw new AppError(429, GENERIC_DENIAL_MESSAGE);
    }

    // Full ancestor-chain validation — the parent itself AND every one of
    // ITS ancestors must currently be valid. project_id is derived ONLY from
    // this resolved row, never from any client input (requirement 4).
    const chain = await resolveValidShareLinkChain(parentRow.id as string);
    if (!chain) {
      await recordSecurityAudit({
        actorUserId: null,
        eventType: EVENT_TYPE,
        outcome: "denied",
        projectId: parentRow.project_id as string,
        metadata: { reason: "parent_invalid", parentShareLinkId: parentRow.id },
        ipHash,
      });
      throw new AppError(404, GENERIC_DENIAL_MESSAGE);
    }
    const parent = chain[0]; // resolveValidShareLinkChain's leaf-first chain === this parent row itself

    const newExpiresAt = new Date(Math.min(new Date(parent.expires_at).getTime(), Date.now() + STANDARD_DURATION_MS));
    const token = createOpaqueToken();
    const tokenHash = await hashOpaqueToken(token);

    const { data: created, error: insertError } = await supabase
      .from("project_share_links")
      .insert({
        project_id: parent.project_id,
        token_hash: tokenHash,
        created_by_user_id: null, // no authenticated actor — see migration 20260821000014
        expires_at: newExpiresAt.toISOString(),
        parent_share_link_id: parent.id,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      await recordSecurityAudit({
        actorUserId: null,
        eventType: EVENT_TYPE,
        outcome: "failure",
        projectId: parent.project_id,
        metadata: { reason: "insert_failed", parentShareLinkId: parent.id },
        ipHash,
      });
      throw new AppError(500, GENERIC_DENIAL_MESSAGE);
    }

    await recordSecurityAudit({
      actorUserId: null,
      eventType: EVENT_TYPE,
      outcome: "success",
      projectId: parent.project_id,
      metadata: { parentShareLinkId: parent.id, childShareLinkId: created.id },
      ipHash,
    });

    // Response contains ONLY the new URL + its expiry (requirement 7) — a
    // relative path, not an absolute URL; see the module comment for why.
    return { shareUrl: `/project?share=${encodeURIComponent(token)}`, expiresAt: newExpiresAt.toISOString() };
  })
);
