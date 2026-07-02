import { Switch, Route, Router as WouterRouter, useLocation, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StudyAuthProvider, useStudyAuth } from "@/hooks/use-study-auth";
import { useEffect, lazy, Suspense, type ComponentType } from "react";

// Public entry pages stay eager so first paint (landing / sign-in) is instant
// and ships a tiny bundle.
import NotFound from "@/pages/not-found";
import StudyLanding from "@/pages/StudyLanding";
import StudyLandingUS from "@/pages/StudyLandingUS";
import StudyLogin from "@/pages/StudyLogin";
import StudySignup from "@/pages/StudySignup";
import { captureEntrySource, isUsAudience } from "@/lib/entry";
import { studyHeartbeat, studyStopImpersonating } from "@/hooks/use-study-api";
import { OfflineIndicator } from "@/components/OfflineIndicator";

// Authenticated pages are the heavy part of the bundle (charts, admin console,
// editors). Lazy-load them so a first visit downloads only the small public
// pages — important on low-end Android over a slow connection.
const StudyDashboard = lazy(() => import("@/pages/StudyDashboard"));
const StudyMaterials = lazy(() => import("@/pages/StudyMaterials"));
const StudyMaterialNew = lazy(() => import("@/pages/StudyMaterialNew"));
const StudyPractice = lazy(() => import("@/pages/StudyPractice"));
const StudyPracticeSession = lazy(() => import("@/pages/StudyPracticeSession"));
const StudyExams = lazy(() => import("@/pages/StudyExams"));
const StudyExamTake = lazy(() => import("@/pages/StudyExamTake"));
const StudyTutor = lazy(() => import("@/pages/StudyTutor"));
const StudyTutorChat = lazy(() => import("@/pages/StudyTutorChat"));
const StudyTutorGuided = lazy(() => import("@/pages/StudyTutorGuided"));
const StudyProfile = lazy(() => import("@/pages/StudyProfile"));
const StudyBriefs = lazy(() => import("@/pages/StudyBriefs"));
const StudyKnowledgeMap = lazy(() => import("@/pages/StudyKnowledgeMap"));
const StudyMaterialView = lazy(() => import("@/pages/StudyMaterialView"));
const StudyAssessment = lazy(() => import("@/pages/StudyAssessment"));
const StudyReadStep = lazy(() => import("@/pages/StudyReadStep"));
const StudyStrategy = lazy(() => import("@/pages/StudyStrategy"));
const StudyProgress = lazy(() => import("@/pages/StudyProgress"));
const StudyIntake = lazy(() => import("@/pages/StudyIntake"));
const StudyStartOver = lazy(() => import("@/pages/StudyStartOver"));
const StudyCoach = lazy(() => import("@/pages/StudyCoach"));
const StudyUpgrade = lazy(() => import("@/pages/StudyUpgrade"));
const StudyAdminCoupons = lazy(() => import("@/pages/StudyAdminCoupons"));
const StudyAmbassador = lazy(() => import("@/pages/StudyAmbassador"));
const StudyAdminAmbassadors = lazy(() => import("@/pages/StudyAdminAmbassadors"));
const StudyAdminConsole = lazy(() => import("@/pages/StudyAdminConsole"));

const queryClient = new QueryClient();

// Fires a usage heartbeat when an authenticated user navigates or lingers. Powers
// the activity_sessions telemetry behind the admin analytics + upgrade targeting.
function HeartbeatTracker() {
  const { user } = useStudyAuth();
  const [location] = useLocation();
  useEffect(() => {
    if (!user) return;
    studyHeartbeat(location);
    const iv = setInterval(() => studyHeartbeat(location), 2 * 60 * 1000);
    return () => clearInterval(iv);
  }, [user, location]);
  return null;
}

// Shown while a lazy-loaded page chunk is being fetched.
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function Protected({ component: Component }: { component: ComponentType<any> }) {
  const { user, loading } = useStudyAuth();
  const [, setLoc] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLoc("/login");
    }
  }, [loading, user, setLoc]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;
  return <Component />;
}

// When an admin is impersonating a learner, show a persistent banner with a way
// back to their own account.
function ImpersonationBanner() {
  const { user } = useStudyAuth();
  if (!user?.impersonating) return null;
  async function stop() {
    try { await studyStopImpersonating(); } catch { /* ignore */ }
    window.location.href = "/study/admin";
  }
  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-amber-500 text-black text-xs md:text-sm px-3 py-1.5 flex items-center justify-center gap-3">
      <span>Viewing as <strong>{user.name || user.email}</strong> (impersonating)</span>
      <button onClick={stop} className="underline font-medium">Stop impersonating</button>
    </div>
  );
}

// Small floating entry point to the admin console, shown only to admins.
function AdminFab() {
  const { user } = useStudyAuth();
  const [location] = useLocation();
  if (!user?.isAdmin || location.startsWith("/admin")) return null;
  return (
    <Link
      href="/admin"
      className="fixed bottom-4 right-4 z-50 rounded-full bg-primary text-primary-foreground text-xs font-medium px-4 py-2 shadow-lg hover:opacity-90"
    >
      Admin
    </Link>
  );
}

// Chooses the landing by entry point: visitors arriving from the marketing site
// get the US-focused page; anyone reaching the Coach directly gets the default one.
function RootLanding() {
  useEffect(() => { captureEntrySource(); }, []);
  return isUsAudience() ? <StudyLandingUS /> : <StudyLanding />;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
    <Switch>
      <Route path="/" component={RootLanding} />
      <Route path="/login" component={StudyLogin} />
      <Route path="/signup" component={StudySignup} />
      <Route path="/coach" component={() => <Protected component={StudyCoach} />} />
      <Route path="/dashboard" component={() => <Protected component={StudyDashboard} />} />
      <Route path="/materials" component={() => <Protected component={StudyMaterials} />} />
      <Route path="/materials/new" component={() => <Protected component={StudyMaterialNew} />} />
      <Route path="/materials/:materialId" component={() => <Protected component={StudyMaterialView} />} />
      <Route path="/practice" component={() => <Protected component={StudyPractice} />} />
      <Route path="/practice/:sessionId" component={StudyPracticeSession} />
      <Route path="/exams" component={() => <Protected component={StudyExams} />} />
      <Route path="/exams/:examId/take" component={StudyExamTake} />
      <Route path="/tutor" component={() => <Protected component={StudyTutor} />} />
      <Route path="/tutor/guided/:conversationId" component={() => <Protected component={StudyTutorGuided} />} />
      <Route path="/tutor/:conversationId" component={StudyTutorChat} />
      <Route path="/profile" component={() => <Protected component={StudyProfile} />} />
      <Route path="/briefs" component={() => <Protected component={StudyBriefs} />} />
      <Route path="/knowledge-map" component={() => <Protected component={StudyKnowledgeMap} />} />
      <Route path="/assessment/:id" component={() => <Protected component={StudyAssessment} />} />
      <Route path="/read-step/:pathId/:stepId" component={() => <Protected component={StudyReadStep} />} />
      <Route path="/intake" component={() => <Protected component={StudyIntake} />} />
      <Route path="/start-over" component={() => <Protected component={StudyStartOver} />} />
      <Route path="/strategy/:materialId" component={() => <Protected component={StudyStrategy} />} />
      <Route path="/progress" component={() => <Protected component={StudyProgress} />} />
      <Route path="/upgrade" component={() => <Protected component={StudyUpgrade} />} />
      <Route path="/ambassador" component={() => <Protected component={StudyAmbassador} />} />
      <Route path="/admin" component={() => <Protected component={StudyAdminConsole} />} />
      <Route path="/admin/coupons" component={() => <Protected component={StudyAdminCoupons} />} />
      <Route path="/admin/ambassadors" component={() => <Protected component={StudyAdminAmbassadors} />} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <StudyAuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <HeartbeatTracker />
            <ImpersonationBanner />
            <AdminFab />
            <OfflineIndicator />
            <Router />
          </WouterRouter>
        </StudyAuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
