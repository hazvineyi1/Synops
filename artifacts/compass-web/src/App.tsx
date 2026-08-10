import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider } from "@/lib/auth-context";
import { BrandingProvider } from "@/lib/branding-context";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { ProtectedProduct } from "@/components/portal/ProtectedProduct";
import { ImpersonationBanner } from "@/components/portal/ImpersonationBanner";
import { PRODUCTS } from "@/lib/products";

import Home from "@/pages/public/Home";
import About from "@/pages/public/About";
import Healthcare from "@/pages/public/Healthcare";
import Learning from "@/pages/public/Learning";
import Platforms from "@/pages/public/Platforms";
import Insights from "@/pages/public/Insights";
import InsightArticle from "@/pages/public/InsightArticle";
import Contact from "@/pages/public/Contact";
import Portals from "@/pages/public/Portals";
import ProductLogin from "@/pages/auth/ProductLogin";
import ProductRegister from "@/pages/auth/ProductRegister";
import ProductVerifyEmail from "@/pages/auth/ProductVerifyEmail";
import ProductResetPassword from "@/pages/auth/ProductResetPassword";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PublicSite() {
  return (
    <PublicLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/about" component={About} />
        <Route path="/healthcare" component={Healthcare} />
        <Route path="/learning" component={Learning} />
        <Route path="/platforms" component={Platforms} />
        <Route path="/insights" component={Insights} />
        <Route path="/insights/:slug" component={InsightArticle} />
        <Route path="/contact" component={Contact} />
        <Route path="/portals" component={Portals} />
        <Route component={NotFound} />
      </Switch>
    </PublicLayout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Per-product branded register (only where self-service is enabled). */}
      {PRODUCTS.filter((p) => p.hasRegister).map((p) => (
        <Route key={`reg-${p.key}`} path={`/${p.key}/register`}>
          {() => <ProductRegister product={p} />}
        </Route>
      ))}

      {/* Per-product email confirmation landing (POSTs the token from the link). */}
      {PRODUCTS.filter((p) => p.hasRegister).map((p) => (
        <Route key={`verify-${p.key}`} path={`/${p.key}/verify-email`}>
          {() => <ProductVerifyEmail product={p} />}
        </Route>
      ))}

      {/* Per-product branded login. */}
      {PRODUCTS.map((p) => (
        <Route key={`login-${p.key}`} path={`/${p.key}/login`}>
          {() => <ProductLogin product={p} />}
        </Route>
      ))}

      {/* Per-product password reset (request a link, then set a new password). */}
      {PRODUCTS.map((p) => (
        <Route key={`reset-${p.key}`} path={`/${p.key}/reset-password`}>
          {() => <ProductResetPassword product={p} />}
        </Route>
      ))}

      {/* Per-product gated workspace. */}
      {PRODUCTS.map((p) => (
        <Route key={`app-${p.key}`} path={`/${p.key}`} nest>
          <ProtectedProduct product={p} />
        </Route>
      ))}

      <Route component={PublicSite} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <BrandingProvider>
          <AuthProvider>
            <TooltipProvider>
              <ImpersonationBanner />
              <Router />
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </BrandingProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
