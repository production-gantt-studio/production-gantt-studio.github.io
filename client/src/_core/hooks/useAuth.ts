import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { requireSupabaseClient } from "@/lib/supabaseClient";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  // Login is started via startLogin() in the effect below, only when we
  // actually navigate/prompt — never during render. startLogin() (see
  // const.ts) now opens a small email-link login prompt backed by Supabase
  // Auth's signInWithOtp, instead of redirecting to the old Manus OAuth
  // portal — calling it more than once just re-opens/focuses that prompt, so
  // there is no nonce-desync risk like the old cookie-based flow had.
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync(undefined);
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  // Keep "me" in sync with Supabase's own auth state (sign-in via magic
  // link/PKCE callback, sign-out, silent token refresh) — react-query has no
  // way to know about these on its own, since they originate from
  // supabase-js's internal listener rather than from a query/mutation this
  // hook issued itself.
  useEffect(() => {
    const supabase = requireSupabaseClient();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      utils.auth.me.invalidate();
    });
    return () => subscription.subscription.unsubscribe();
  }, [utils]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;

    if (redirectPath) {
      window.location.href = redirectPath;
    } else {
      startLogin();
    }
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
