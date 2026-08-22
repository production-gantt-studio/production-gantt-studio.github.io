// Phase 2: this file's import path (`@/lib/trpc`) stays the same everywhere
// it's used (Home.tsx, ProjectIndex.tsx, Invite.tsx, useAuth.ts), so none of
// those files need to change — only what `trpc` actually IS changes here,
// from a real tRPC React client to the Supabase-backed shim with an
// identical `trpc.<router>.<procedure>.useQuery/.useMutation` call shape.
// See lib/supabaseTrpcShim.ts for the implementation.
export { trpc } from "./supabaseTrpcShim";
