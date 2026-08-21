/** Edit Suite design reminder: the app shell defaults to the graphite studio theme and exposes a focused production workspace. */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import FAQ from "./pages/FAQ";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Invite from "./pages/Invite";
import ProjectIndex from "./pages/ProjectIndex";

function RootEntry() {
  const query = new URLSearchParams(window.location.search);
  if (sessionStorage.getItem("production-gantt-pending-invite")) return <Invite />;
  return query.get("view") === "shared" || query.get("start") === "blank" ? <Home /> : <ProjectIndex />;
}
function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/" component={RootEntry} />
      <Route path="/project" component={Home} />
      <Route path="/invite" component={Invite} />
      <Route path="/faq" component={FAQ} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="bottom-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
