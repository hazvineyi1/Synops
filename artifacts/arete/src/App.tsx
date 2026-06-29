import { useEffect, useRef } from "react";
import { ClerkProvider, Show, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";

import Landing from "./pages/landing";
import { SignInPage, SignUpPage } from "./pages/auth";
import Assessment from "./pages/assessment";
import Coach from "./pages/coach";
import Material from "./pages/material";
import Progress from "./pages/progress";
import Settings from "./pages/settings";
import Admin from "./pages/admin";
import Cohorts from "./pages/cohorts";
import Developers from "./pages/developers";
import { Privacy, Terms } from "./pages/legal";
import { AppLayout } from "./components/layout/app-layout";
import { LanguageProvider } from "./lib/i18n";
import { useIsAdmin } from "@/lib/admin-api";

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)
  ?? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY — set it in your environment variables");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(0 62% 29%)",
    colorPrimaryForeground: "hsl(0 0% 100%)",
    colorForeground: "hsl(20 15% 10%)",
    colorMutedForeground: "hsl(20 15% 40%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(35 40% 98%)",
    colorInput: "hsl(35 20% 88%)",
    colorInputForeground: "hsl(20 15% 10%)",
    colorNeutral: "hsl(35 20% 88%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "6px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white dark:bg-[#1a1512] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-serif text-2xl font-bold",
    headerSubtitle: "text-muted-foreground text-sm",
    socialButtonsBlockButtonText: "font-medium",
    formButtonPrimary: "!text-white",
    formFieldLabel: "text-sm font-medium text-foreground",
    footerActionLink: "text-primary font-medium hover:text-primary/90",
    footerActionText: "text-muted-foreground text-sm",
    dividerText: "text-muted-foreground text-sm uppercase",
    identityPreviewEditButton: "text-primary hover:text-primary/90",
    formFieldSuccessText: "text-primary text-sm",
    alertText: "text-sm",
  }
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

// Distribution loop: once the visitor signs in, claim any referral code that was
// captured from the ?ref= link, then clear it. One attempt per session.
function ReferralClaimer() {
  const { isLoaded, isSignedIn } = useUser();
  const attempted = useRef(false);
  useEffect(() => {
    if (!isLoaded || !isSignedIn || attempted.current) return;
    attempted.current = true;
    let code: string | null = null;
    try {
      code = localStorage.getItem("ref_code");
    } catch {
      /* ignore */
    }
    if (!code) return;
    fetch("/api/referral/claim", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .catch(() => {})
      .finally(() => {
        try {
          localStorage.removeItem("ref_code");
        } catch {
          /* ignore */
        }
      });
  }, [isLoaded, isSignedIn]);
  return null;
}

// Pings the server while the app is open and focused, so the admin view has real
// last-seen, login times, and time-spent. No-op when signed out or backgrounded.
function HeartbeatTracker() {
  const { isLoaded, isSignedIn } = useUser();
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const beat = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      fetch("/api/activity/heartbeat", { method: "POST", credentials: "include" }).catch(() => {});
    };
    beat();
    const id = window.setInterval(beat, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isLoaded, isSignedIn]);
  return null;
}

function SignedInHome() {
  // Admins land in the admin panel; learners land in the coach.
  const { data: adminData, isLoading } = useIsAdmin();
  if (isLoading) return null;
  return <Redirect to={adminData?.isAdmin ? "/admin" : "/coach"} />;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <SignedInHome />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: any }) {
  return (
    <>
      <Show when="signed-in">
        <AppLayout>
          <Component />
        </AppLayout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access your account",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Get started today",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <ReferralClaimer />
        <HeartbeatTracker />
        <Switch>
          <Route path="/" component={HomeRedirect} />

          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />

          {/* Public legal + developer pages — accessible signed in or out. */}
          <Route path="/legal/privacy" component={Privacy} />
          <Route path="/legal/terms" component={Terms} />
          <Route path="/developers" component={Developers} />

          <Route path="/start">
            <Show when="signed-in">
              <Assessment />
            </Show>
            <Show when="signed-out">
              <Redirect to="/sign-in" />
            </Show>
          </Route>

          <Route path="/coach" component={() => <ProtectedRoute component={Coach} />} />
          <Route path="/material" component={() => <ProtectedRoute component={Material} />} />
          <Route path="/progress" component={() => <ProtectedRoute component={Progress} />} />
          <Route path="/cohorts" component={() => <ProtectedRoute component={Cohorts} />} />
          <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
          <Route path="/admin" component={() => <ProtectedRoute component={Admin} />} />

          <Route>
            <div className="flex flex-col items-center justify-center min-h-screen">
              <h1 className="text-2xl font-bold font-serif mb-2 text-primary">Page Not Found</h1>
              <a href="/" className="text-primary underline">Return Home</a>
            </div>
          </Route>
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  // Capture a ?ref= invite code on first load (before sign-in) so we can attribute
  // the referral once the visitor creates an account.
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) localStorage.setItem("ref_code", ref.trim().toUpperCase().slice(0, 16));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <LanguageProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </LanguageProvider>
  );
}

export default App;
