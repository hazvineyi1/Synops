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
import Services from "@/pages/Services";
import Industries from "@/pages/Industries";
import Work from "@/pages/Work";
import Approach from "@/pages/Approach";
import Contracting from "@/pages/Contracting";
import Products from "@/pages/Products";
import TryDemo from "@/pages/TryDemo";
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

// Scroll to top on page change, or to the #anchor when one is present
// (e.g. /services#ai). Waits a frame so the target section has rendered.
function ScrollManager() {
  const [loc] = useLocation();
  useEffect(() => {
    const go = () => {
      const id = window.location.hash.slice(1);
      const el = id ? document.getElementById(id) : null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo(0, 0);
    };
    const t = window.setTimeout(go, 60);
    window.addEventListener("hashchange", go);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", go);
    };
  }, [loc]);
  return null;
}

function Router() {
  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AnalyticsTracker />
      <ScrollManager />
      <Nav />
      <main className="flex-1">
        <Switch>
          {/* Consulting site routes. */}
          <Route path="/" component={Home} />
          <Route path="/services" component={Services} />
          <Route path="/industries" component={Industries} />
          <Route path="/work" component={Work} />
          <Route path="/approach" component={Approach} />
          <Route path="/contracting" component={Contracting} />
          <Route path="/about" component={About} />
          {/* Old practice pages now live inside Services / Industries. */}
          <Route path="/capabilities"><Redirect to="/services" /></Route>
          <Route path="/learning"><Redirect to="/services" /></Route>
          <Route path="/healthcare"><Redirect to="/industries" /></Route>
          <Route path="/public-sector"><Redirect to="/contracting" /></Route>
          {/* Platforms merged into Products; keep the path as a redirect so old links resolve. */}
          <Route path="/platforms"><Redirect to="/products" /></Route>
          <Route path="/products" component={Products} />
          <Route path="/demo" component={TryDemo} />
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
