import React from 'react';
import { Switch, Route, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SessionProvider, useSession } from '@/context/SessionContext';
import { ThemeApplier } from '@/context/ThemeProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { API } from '@/lib/api';
import { ConsentGate } from '@/components/ConsentGate';
import { MfaGate } from '@/components/MfaGate';
import { MaintenanceBanner } from '@/components/MaintenanceBanner';

// Pages
import NotFound from '@/pages/not-found';
import { Home } from '@/pages/Home';
import { Dashboard } from '@/pages/Dashboard';
import { LearnSession } from '@/pages/LearnSession';
import { Studio } from '@/pages/Studio';
import { StudioNew } from '@/pages/StudioNew';
import { StudioEdit } from '@/pages/StudioEdit';
import { Courses } from '@/pages/Courses';
import { IncompleteCourses } from '@/pages/IncompleteCourses';
import { CourseDetail } from '@/pages/CourseDetail';
import { CourseBuilder } from '@/pages/CourseBuilder';
import { AssignmentDetail } from '@/pages/AssignmentDetail';
import { DiscussionThread } from '@/pages/DiscussionThread';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { AccountSecurity } from '@/pages/AccountSecurity';
import { CourseGradebook } from '@/pages/CourseGradebook';
import { DevLogin } from '@/pages/DevLogin';
import { ModuleViewer } from '@/pages/ModuleViewer';
import { Assess } from '@/pages/Assess';
import { Credentials } from '@/pages/Credentials';
import { Portfolio } from '@/pages/Portfolio';
import { Verify } from '@/pages/Verify';
import { CoachLearners } from '@/pages/CoachLearners';
import { CoachingMatching } from '@/pages/CoachingMatching';
import { CoachingHealth } from '@/pages/CoachingHealth';
import { CoachSubmissions } from '@/pages/CoachSubmissions';
import { AdminPartners } from '@/pages/AdminPartners';
import { PartnerTheme } from '@/pages/PartnerTheme';
import { Reports } from '@/pages/Reports';
import { CoachHub } from '@/pages/CoachHub';
import { OrgMembers } from '@/pages/OrgMembers';
import { SignInPage } from '@/pages/SignIn';
import { RequestAccess } from '@/pages/RequestAccess';
import { Privacy } from '@/pages/Privacy';
import { DataPrivacy } from '@/pages/DataPrivacy';
import { AdminDataRequests } from '@/pages/AdminDataRequests';
import EnvironmentCleanup from '@/pages/EnvironmentCleanup';
import { PublicStatus } from '@/pages/PublicStatus';
import AdminHealth from '@/pages/AdminHealth';
import TranslationReview from '@/pages/TranslationReview';
import { Terms } from '@/pages/Terms';
import { ForgotPasswordPage } from '@/pages/ForgotPassword';
import { ResetPasswordPage } from '@/pages/ResetPassword';
import { JoinCohort } from '@/pages/JoinCohort';
import { PartnerLanding } from '@/pages/PartnerLanding';
import DemoLanding from '@/pages/DemoLanding';
import K12Landing from '@/pages/K12Landing';
import { K12Adaptation } from '@/components/K12Adaptation';
import { PlatformConsole } from '@/pages/PlatformConsole';
import DemoPEJ from '@/pages/DemoPEJ';
import DemoPEJ2 from '@/pages/DemoPEJ2';
import DemoPEJLanding from '@/pages/DemoPEJLanding';
import DemoMRBLanding from '@/pages/DemoMRBLanding';
import DemoEducatorLanding from '@/pages/DemoEducatorLanding';
import { Cases } from '@/pages/Cases';
import { CaseBuilder } from '@/pages/CaseBuilder';
import { CaseBegin } from '@/pages/CaseBegin';
import { CaseSession } from '@/pages/CaseSession';
import { CaseEmbed } from '@/pages/CaseEmbed';
import { Delivery } from '@/pages/Delivery';
import { MyAttendance } from '@/pages/MyAttendance';
import { ActivitiesAdmin } from '@/pages/ActivitiesAdmin';
import { ClassInsights } from '@/pages/ClassInsights';
import ContentCatalog from '@/pages/ContentCatalog';
import { ActivityPlay } from '@/pages/ActivityPlay';
import { LivePlay } from '@/pages/LivePlay';
import { LiveHost } from '@/pages/LiveHost';
import { MathCoach } from '@/pages/MathCoach';
import { ActivityEmbed } from '@/pages/ActivityEmbed';
import { MyGrades } from '@/pages/MyGrades';
import { Jotter } from '@/pages/Jotter';
import { PartnerOverview } from '@/pages/partner/PartnerOverview';
import { PartnerOrganisations } from '@/pages/partner/PartnerOrganisations';
import { PartnerOrgHub } from '@/pages/partner/PartnerOrgHub';
import { PartnerImpersonateView } from '@/pages/partner/PartnerImpersonateView';
import { PartnerPartners } from '@/pages/partner/PartnerPartners';
import { PlatformOverview } from '@/pages/partner/PlatformOverview';
import { LearningHub } from '@/pages/partner/LearningHub';
import { CourseDevelopmentSuite } from '@/pages/partner/CourseDevelopmentSuite';
import { PartnerAccounts } from '@/pages/partner/PartnerAccounts';
import { PartnerSettings } from '@/pages/partner/PartnerSettings';
import { GradebookBrowser } from '@/pages/GradebookBrowser';
import { PracticeHome } from '@/pages/PracticeHome';
import { AttestPage } from '@/pages/AttestPage';
import { VerifyPage } from '@/pages/VerifyPage';
import { ProgramDashboard } from '@/pages/ProgramDashboard';
import { PracticeCanvas } from '@/pages/PracticeCanvas';
import { PracticeReview } from '@/pages/PracticeReview';

// Layout
import { AppLayout } from '@/components/layout/AppLayout';

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Auth is our own now. Clerk is gone.
 *
 * Notably, the old module threw at import time if VITE_CLERK_PUBLISHABLE_KEY was
 * absent, so a missing env var took down the entire app with a white screen -- and in
 * local dev it tried to load clerk.localhost, which does not exist, and the failure
 * surfaced as an unrelated-looking runtime overlay. Identity now depends on nothing but
 * our own API.
 */

/** Spinner shown only while the first /auth/me is in flight. */
function SessionGate() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-400" />
    </div>
  );
}

/**
 * Branded partner subdomains: the root of the subdomain renders that partner's
 * landing page directly, so the URL stays clean (e.g. https://enza.synops-consulting.com
 * shows the Enza landing with no /enzaglobalmedia path). Signed-in users still go to
 * their dashboard. Add future partner subdomains here.
 */
const PARTNER_SUBDOMAIN_SLUGS: Record<string, string> = {
  'enza.synops-consulting.com': 'enza-global',
};

function partnerSlugForHost(): string | null {
  if (typeof window === 'undefined') return null;
  return PARTNER_SUBDOMAIN_SLUGS[window.location.hostname] ?? null;
}

const DEMO_HOST = 'demo.synops-consulting.com';

function HomeRedirect() {
  const { user, isSignedIn, loading } = useSession();
  if (loading) return <SessionGate />;
  // Practice-first build: a candidate's home is their credentials, not the LMS dashboard, so they
  // never land on a page that talks about courses, modules or grades.
  if (isSignedIn) return <Redirect to={user?.role === 'learner' ? '/practice' : '/dashboard'} />;
  // The public demo host shows the Synops Demo landing at its root, so the link we send is clean.
  if (typeof window !== 'undefined' && window.location.hostname === DEMO_HOST) return <DemoLanding />;
  const partnerSlug = partnerSlugForHost();
  if (partnerSlug) return <PartnerLanding params={{ slug: partnerSlug }} />;
  return <Home />;
}

/**
 * ProtectedRoute: renders inside AppLayout, only for a signed-in user.
 *
 * The `loading` check is load-bearing. Without it the first render (before /auth/me
 * has answered) looks exactly like "signed out", so a signed-in user refreshing any
 * deep link would be bounced to /sign-in before their session was even checked.
 */
function ProtectedRoute({
  component: Component,
  path,
}: {
  component: React.ComponentType<any>;
  path: string;
}) {
  const { isSignedIn, loading, user } = useSession();

  return (
    <Route path={path}>
      {(params) => {
        if (loading) return <SessionGate />;
        if (!isSignedIn) return <Redirect to="/sign-in" />;
        // POPIA: block until the current privacy policy is accepted.
        if (user?.consentRequired) return <ConsentGate />;
        // 2FA policy: admin roles must enrol. Leave /security reachable so they can.
        if (user?.mfaSetupRequired && path !== "/security") return <MfaGate />;
        return (
          <AppLayout>
            <Component params={params} />
          </AppLayout>
        );
      }}
    </Route>
  );
}

/** FocusRoute: full-screen protected route (no sidebar chrome). */
function FocusRoute({
  component: Component,
  path,
}: {
  component: React.ComponentType<any>;
  path: string;
}) {
  const { isSignedIn, loading, user } = useSession();

  return (
    <Route path={path}>
      {(params) => {
        if (loading) return <SessionGate />;
        if (!isSignedIn) return <Redirect to="/sign-in" />;
        if (user?.consentRequired) return <ConsentGate />;
        return <Component params={params} />;
      }}
    </Route>
  );
}

function PublicRoute({
  component: Component,
  path,
}: {
  component: React.ComponentType<any>;
  path: string;
}) {
  return <Route path={path}>{(params) => <Component params={params} />}</Route>;
}

function Routes() {
  return (
      <Switch>
        <Route path="/" component={HomeRedirect} />

        {/* Auth */}
        <PublicRoute path="/demo" component={DemoLanding} />
        <PublicRoute path="/k12" component={K12Landing} />
        <PublicRoute path="/sign-in" component={SignInPage} />
        <PublicRoute path="/forgot-password" component={ForgotPasswordPage} />
        <PublicRoute path="/reset-password" component={ResetPasswordPage} />
        <PublicRoute path="/request-access" component={RequestAccess} />

        {/* Dev demo login. The server 404s this route in production. */}
        <PublicRoute path="/dev-login" component={DevLogin} />

        {/* Public */}
        <PublicRoute path="/status" component={PublicStatus} />
        <PublicRoute path="/privacy" component={Privacy} />
        <PublicRoute path="/terms" component={Terms} />
        <PublicRoute path="/join/:code" component={JoinCohort} />
        {/* A witness confirms a candidate's real-world leadership event via magic link. No login. */}
        <PublicRoute path="/attest/:token" component={AttestPage} />
        {/* Public credential verification, the shareable proof an employer or registry can check. */}
        <PublicRoute path="/verify/:publicId" component={VerifyPage} />
        <PublicRoute path="/p/:slug" component={PartnerLanding} />
        {/* Clean vanity path for the Enza landing page. */}
        <PublicRoute path="/enzaglobalmedia" component={() => <PartnerLanding params={{ slug: 'enza-global' }} />} />
        <PublicRoute path="/verify/:credentialId" component={Verify} />
        <PublicRoute path="/c/:token" component={CaseEmbed} />
        <PublicRoute path="/a/:token" component={ActivityEmbed} />
        <PublicRoute path="/live/:code" component={LivePlay} />
        <PublicRoute path="/live" component={LivePlay} />

        {/* Full-screen focus routes */}
        <FocusRoute path="/learn/:sessionId" component={LearnSession} />
        <FocusRoute path="/case-run/:sessionId" component={CaseSession} />
        <FocusRoute path="/activities/:activityId/play" component={ActivityPlay} />
        <FocusRoute path="/math-coach/:activityId" component={MathCoach} />
        <FocusRoute path="/live-host/:code" component={LiveHost} />
        {/* Super-admin demo: PEJ-EVD-01 justice-sector training module (launched from /platform → Demos). */}
        <FocusRoute path="/platform/demos/pej-evd-01" component={DemoPEJ} />
        <FocusRoute path="/platform/demos/pej-evd-02" component={DemoPEJ2} />
        {/* Public demo links, shareable with reviewers/partners without an account. The landing
            introduces both modules; each module page is self-contained and needs no session. */}
        <PublicRoute path="/demos/pej" component={DemoPEJLanding} />
        <PublicRoute path="/demos/mrb" component={DemoMRBLanding} />
        <PublicRoute path="/demos/educator" component={DemoEducatorLanding} />
        <PublicRoute path="/demos/pej-evd-01" component={DemoPEJ} />
        <PublicRoute path="/demos/pej-evd-02" component={DemoPEJ2} />

        {/* App layout routes */}
        <ProtectedRoute path="/dashboard" component={Dashboard} />
        <ProtectedRoute path="/privacy/data" component={DataPrivacy} />
        <ProtectedRoute path="/admin/data-requests" component={AdminDataRequests} />
        <ProtectedRoute path="/admin/cleanup" component={EnvironmentCleanup} />
        <ProtectedRoute path="/admin/health" component={AdminHealth} />
        <ProtectedRoute path="/admin/translations" component={TranslationReview} />
        <ProtectedRoute path="/studio/new" component={StudioNew} />
        <ProtectedRoute path="/studio/:draftId" component={StudioEdit} />
        <ProtectedRoute path="/studio" component={Studio} />
        <ProtectedRoute
          path="/courses/:courseId/assignments/:assignmentId"
          component={AssignmentDetail}
        />
        {/* Bare assignment link (from older notifications) - resolves its course from the assignment. */}
        <ProtectedRoute
          path="/assignments/:assignmentId"
          component={AssignmentDetail}
        />
        <ProtectedRoute
          path="/courses/:courseId/discussions/:discussionId"
          component={DiscussionThread}
        />
        <ProtectedRoute path="/courses/:courseId/gradebook" component={CourseGradebook} />
        <ProtectedRoute path="/grades" component={MyGrades} />
        <ProtectedRoute path="/class-insights" component={ClassInsights} />
        <ProtectedRoute path="/content-catalog" component={ContentCatalog} />
        <ProtectedRoute path="/jotter" component={Jotter} />
        {/* Partner Hub (partner_admin tier) */}
        <ProtectedRoute path="/partner" component={PartnerOverview} />
        <ProtectedRoute path="/platform-overview" component={PlatformOverview} />
        <ProtectedRoute path="/learning/develop" component={CourseDevelopmentSuite} />
        <ProtectedRoute path="/learning" component={LearningHub} />
        <ProtectedRoute path="/partner/partners" component={PartnerPartners} />
        <ProtectedRoute path="/partner/organisations" component={PartnerOrganisations} />
        <ProtectedRoute path="/partner/impersonate/:orgId/:userId" component={PartnerImpersonateView} />
        <ProtectedRoute path="/partner/org/:orgId/classes/:classId" component={PartnerOrgHub} />
        <ProtectedRoute path="/partner/org/:orgId/:section" component={PartnerOrgHub} />
        <ProtectedRoute path="/partner/org/:orgId" component={PartnerOrgHub} />
        <ProtectedRoute path="/partner/accounts" component={PartnerAccounts} />
        <ProtectedRoute path="/partner/settings" component={PartnerSettings} />
        <ProtectedRoute path="/program" component={ProgramDashboard} />
        <ProtectedRoute path="/practice/review" component={PracticeReview} />
        <ProtectedRoute path="/practice/c/:id" component={PracticeCanvas} />
        <ProtectedRoute path="/practice" component={PracticeHome} />
        <ProtectedRoute path="/coach-hub" component={CoachHub} />
        <ProtectedRoute path="/gradebook" component={GradebookBrowser} />
        <ProtectedRoute path="/courses/:courseId/modules/:moduleId" component={ModuleViewer} />
        <ProtectedRoute path="/incomplete-courses" component={IncompleteCourses} />
        <ProtectedRoute path="/courses/new" component={CourseBuilder} />
        <ProtectedRoute path="/courses/:courseId" component={CourseDetail} />
        <ProtectedRoute path="/courses" component={Courses} />
        <ProtectedRoute path="/cases/:caseId/edit" component={CaseBuilder} />
        <ProtectedRoute path="/cases/:caseId/begin" component={CaseBegin} />
        <ProtectedRoute path="/cases" component={Cases} />
        <ProtectedRoute path="/notifications" component={NotificationsPage} />
        <ProtectedRoute path="/security" component={AccountSecurity} />
        <ProtectedRoute path="/assess/:assessmentId" component={Assess} />
        <ProtectedRoute path="/credentials" component={Credentials} />
        <ProtectedRoute path="/portfolio" component={Portfolio} />
        <ProtectedRoute path="/coach/submissions" component={CoachSubmissions} />
        <ProtectedRoute path="/coaching/health" component={CoachingHealth} />
        <ProtectedRoute path="/coaching/sections" component={CoachingMatching} />
        <ProtectedRoute path="/coach" component={CoachLearners} />
        <ProtectedRoute path="/org/members" component={OrgMembers} />
        <ProtectedRoute path="/admin/partners" component={AdminPartners} />
        <ProtectedRoute path="/delivery" component={Delivery} />
        <ProtectedRoute path="/my-attendance" component={MyAttendance} />
        <ProtectedRoute path="/activities" component={ActivitiesAdmin} />
        <ProtectedRoute path="/platform" component={PlatformConsole} />
        <ProtectedRoute path="/partner/theme" component={PartnerTheme} />
        <ProtectedRoute path="/reports" component={Reports} />

        <Route component={NotFound} />
      </Switch>
  );
}

/**
 * Measures how long a demo visitor stays: if a demo session id was stored at sign-in, ping every minute
 * and send an end beacon when the tab closes, so the founder's "time spent" email is accurate.
 */
function DemoTracker() {
  React.useEffect(() => {
    let id: string | null = null;
    try { id = window.sessionStorage.getItem('synops_demo_track'); } catch { /* ignore */ }
    if (!id) return;
    const send = (action: string) => {
      const payload = JSON.stringify({ id, action });
      if (action === 'end' && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        try { navigator.sendBeacon(`${API}/auth/demo-track`, new Blob([payload], { type: 'application/json' })); return; } catch { /* fall through */ }
      }
      fetch(`${API}/auth/demo-track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
    };
    const iv = window.setInterval(() => send('ping'), 60000);
    const end = () => { try { window.sessionStorage.removeItem('synops_demo_track'); } catch { /* ignore */ } send('end'); };
    window.addEventListener('pagehide', end);
    return () => { window.clearInterval(iv); window.removeEventListener('pagehide', end); };
  }, []);
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <SessionProvider>
              <ThemeApplier />
              <DemoTracker />
              <K12Adaptation />
              <MaintenanceBanner />
              <Routes />
            </SessionProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
