/** Edit Suite design reminder: the app shell defaults to the graphite studio theme and exposes a focused production workspace. */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import FAQ from "./pages/FAQ";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Invite from "./pages/Invite";
import ProjectIndex from "./pages/ProjectIndex";
import AuthCallback from "./pages/AuthCallback";
import AuthConfirm from "./pages/AuthConfirm";
import ShareForwardWidget from "./components/ShareForwardWidget";
import AdminPasskeySetup from "./components/AdminPasskeySetup";

function RootEntry() {
  const query = new URLSearchParams(window.location.search);
  if (sessionStorage.getItem("production-gantt-pending-invite")) return <Invite />;
  return query.get("view") === "shared" || query.get("start") === "blank" ? <Home /> : <ProjectIndex />;
}
// GitHub Pages serves this app from a subpath (e.g.
// /production-gantt-studio/), matching vite.config.ts's `base`. Wouter's own
// `base` must be told about that subpath explicitly — otherwise every
// `path="/..."` route (including "/auth/callback", which the Supabase Auth
// redirect URL points at) would only match at the domain root and 404 once
// deployed. Derived from import.meta.env.BASE_URL rather than hardcoded, so
// local dev (base "/") and the Pages deployment both resolve correctly with
// the same code.
const routerBase = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <WouterRouter base={routerBase}>
      <Switch>
        <Route path="/" component={RootEntry} />
        <Route path="/project" component={Home} />
        <Route path="/invite" component={Invite} />
        <Route path="/auth/callback" component={AuthCallback} />
        <Route path="/auth/confirm" component={AuthConfirm} />
        <Route path="/faq" component={FAQ} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="bottom-right" />
          <Router />
          <AdminPasskeySetup />
          {/* Additive, self-contained viewer-share-forwarding widget — see
              its own file comment. Renders nothing unless the URL carries a
              `share` query param, so this has no effect on any other screen. */}
          <ShareForwardWidget />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
