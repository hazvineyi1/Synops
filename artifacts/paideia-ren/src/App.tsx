import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useRef } from "react";
import { initAnalytics, track } from "@/lib/analytics";
import NotFound from "@/pages/not-found";

import { Nav } from "@/components/layout/Nav";
import { Footer } from "@/components/layout/Footer";

import Home from "@/pages/Home";
import About from "@/pages/About";
import Healthcare from "@/pages/Healthcare";
import Learning from "@/pages/Learning";
import Products from "@/pages/Products";
import Insights from "@/pages/Insights";
import Article from "@/pages/Article";
import Contact from "@/pages/Contact";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";

const queryClient = new QueryClient();

function AnalyticsTracker() {
  const [loc] = useLocation();
  const inited = useRef(false);
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (!inited.current) {
      initAnalytics({ surface: "site" });
      inited.current = true;
      prev.current = loc;
      track("page_view", { initial: true });
      return;
    }
    if (prev.current !== loc) {
      prev.current = loc;
      track("page_view", { trigger: "spa" });
    }
  }, [loc]);
  return null;
}

function Router() {
  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AnalyticsTracker />
      <Nav />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/about" component={About} />
          <Route path="/healthcare" component={Healthcare} />
          <Route path="/learning" component={Learning} />
          {/* Platforms merged into Products; keep the path as a redirect so old links resolve. */}
          <Route path="/platforms"><Redirect to="/products" /></Route>
          <Route path="/products" component={Products} />
          <Route path="/insights" component={Insights} />
          <Route path="/insights/:slug" component={Article} />
          <Route path="/contact" component={Contact} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/terms" component={Terms} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
