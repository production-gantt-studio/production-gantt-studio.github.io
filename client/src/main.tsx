// Phase 2: the Manus/tRPC provider setup is gone. Data now flows through
// the Supabase-backed shim in lib/supabaseTrpcShim.ts (re-exported as
// `trpc` from lib/trpc.ts, so every existing call site is unchanged), which
// itself is built on top of TanStack Query directly — so all this file needs
// to provide is the QueryClient itself.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./simplify.css";

const queryClient = new QueryClient();

queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "error") {
    console.error("[API Query Error]", event.query.state.error);
  }
});

queryClient.getMutationCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "error") {
    console.error("[API Mutation Error]", event.mutation.state.error);
  }
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
