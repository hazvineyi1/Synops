import React from 'react';
import { Switch, Route, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SessionProvider, useSession } from '@/context/SessionContext';
import { ThemeApplier } from '@/context/ThemeProvider';

// Pages
import NotFound from '@/pages/not-found';
import { Home } from '@/pages/Home';
import { Dashboard } from '@/pages/Dashboard';
import { LearnSession } from '@/pages/LearnSession';
import { Studio } from '@/pages/Studio';
import { StudioNew } from '@/pages/StudioNew';
import { StudioEdit } from '@/pages/StudioEdit';
import { Courses } from '@/pages/Courses';
import { CourseDetail } from '@/pages/CourseDetail';
import { AssignmentDetail } from '@/pages/AssignmentDetail';
import { DiscussionThread } from '@/pages/DiscussionThread';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { CourseGradebook } from '@/pages/CourseGradebook';
import { DevLogin } from '@/pages/DevLogin';
import { ModuleViewer } from '@/pages/ModuleViewer';
import { Assess } from '@/pages/Assess';
import { Credentials } from '@/pages/Credentials';
import { Verify } from '@/pages/Verify';
import { CoachLearners } from '@/pages/CoachLearners';
import { CoachingMatching } from '@/pages/CoachingMatching';
import { CoachingHealth } from '@/pages/CoachingHealth';
import { CoachSubmissions } from '@/pages/CoachSubmissions';
import { AdminPartners } from '@/pages/AdminPartners';
import { AdminDocumentTemplates } from '@/pages/AdminDocumentTemplates';
import { PartnerTheme } from '@/pages/PartnerTheme';
import { Reports } from '@/pages/Reports';
import { CoachHub } from '@/pages/CoachHub';
import { OrgMembers } from '@/pages/OrgMembers';
import { SignInPage } from '@/pages/SignIn';
import { RequestAccess } from '@/pages/RequestAccess';
import { ForgotPasswordPage } from '@/pages/ForgotPassword';
import { ResetPasswordPage } from '@/pages/ResetPassword';
import { PlatformConsole } from '@/pages/PlatformConsole';
import { Cases } from '@/pages/Cases';
import { CaseBuilder } from '@/pages/CaseBuilder';
import { CaseBegin } from '@/pages/CaseBegin';
import { CaseSession } from '@/pages/CaseSession';
import { CaseEmbed } from '@/pages/CaseEmbed';
import { AdminFunders } from '@/pages/AdminFunders';
import { Delivery } from '@/pages/Delivery';
import { MyAttendance } from '@/pages/MyAttendance';
import { Compliance } from '@/pages/Compliance';
import { Accreditation } from '@/pages/Accreditation';
import { ActivitiesAdmin } from '@/pages/ActivitiesAdmin';
import { ActivityPlay } from '@/pages/ActivityPlay';
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
import { PlatformFinance } from '@/pages/partner/PlatformFinance';
import { PartnerFinance } from '@/pages/partner/PartnerFinance';
import { PartnerFunders } from '@/pages/partner/PartnerFunders';
import { PartnerDocuments } from '@/pages/partner/PartnerDocuments';
import { PartnerAccounts } from '@/pages/partner/PartnerAccounts';
import { PartnerComms } from '@/pages/partner/PartnerComms';
import { PartnerSettings } from '@/pages/partner/PartnerSettings';
import { PartnerAudit } from '@/pages/partner/PartnerAudit';
import { GradebookBrowser } from '@/pages/GradebookBrowser';
import { Support } from '@/pages/Support';

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

function HomeRedirect() {
  const { isSignedIn, loading } = useSession();
  if (loading) return <SessionGate />;
  return isSignedIn ? <Redirect to="/dashboard" /> : <Home />;
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
  const { isSignedIn, loading } = useSession();

  return (
    <Route path={path}>
      {(params) => {
        if (loading) return <SessionGate />;
        if (!isSignedIn) return <Redirect to="/sign-in" />;
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
  const { isSignedIn, loading } = useSession();

  return (
    <Route path={path}>
      {(params) => {
        if (loading) return <SessionGate />;
        if (!isSignedIn) return <Redirect to="/sign-in" />;
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
        <PublicRoute path="/sign-in" component={SignInPage} />
        <PublicRoute path="/forgot-password" component={ForgotPasswordPage} />
        <PublicRoute path="/reset-password" component={ResetPasswordPage} />
        <PublicRoute path="/request-access" component={RequestAccess} />

        {/* Dev demo login. The server 404s this route in production. */}
        <PublicRoute path="/dev-login" component={DevLogin} />

        {/* Public */}
        <PublicRoute path="/verify/:credentialId" component={Verify} />
        <PublicRoute path="/c/:token" component={CaseEmbed} />
        <PublicRoute path="/a/:token" component={ActivityEmbed} />

        {/* Full-screen focus routes */}
        <FocusRoute path="/learn/:sessionId" component={LearnSession} />
        <FocusRoute path="/case-run/:sessionId" component={CaseSession} />
        <FocusRoute path="/activities/:activityId/play" component={ActivityPlay} />

        {/* App layout routes */}
        <ProtectedRoute path="/dashboard" component={Dashboard} />
        <ProtectedRoute path="/studio/new" component={StudioNew} />
        <ProtectedRoute path="/studio/:draftId" component={StudioEdit} />
        <ProtectedRoute path="/studio" component={Studio} />
        <ProtectedRoute
          path="/courses/:courseId/assignments/:assignmentId"
          component={AssignmentDetail}
        />
        <ProtectedRoute
          path="/courses/:courseId/discussions/:discussionId"
          component={DiscussionThread}
        />
        <ProtectedRoute path="/courses/:courseId/gradebook" component={CourseGradebook} />
        <ProtectedRoute path="/grades" component={MyGrades} />
        <ProtectedRoute path="/jotter" component={Jotter} />
        {/* Partner Hub (partner_admin tier) */}
        <ProtectedRoute path="/partner" component={PartnerOverview} />
        <ProtectedRoute path="/platform-overview" component={PlatformOverview} />
        <ProtectedRoute path="/learning/develop" component={CourseDevelopmentSuite} />
        <ProtectedRoute path="/learning" component={LearningHub} />
        <ProtectedRoute path="/platform-finance" component={PlatformFinance} />
        <ProtectedRoute path="/partner/partners" component={PartnerPartners} />
        <ProtectedRoute path="/partner/organisations" component={PartnerOrganisations} />
        <ProtectedRoute path="/partner/impersonate/:orgId/:userId" component={PartnerImpersonateView} />
        <ProtectedRoute path="/partner/org/:orgId/classes/:classId" component={PartnerOrgHub} />
        <ProtectedRoute path="/partner/org/:orgId/:section" component={PartnerOrgHub} />
        <ProtectedRoute path="/partner/org/:orgId" component={PartnerOrgHub} />
        <ProtectedRoute path="/partner/finance" component={PartnerFinance} />
        <ProtectedRoute path="/partner/funders" component={PartnerFunders} />
        <ProtectedRoute path="/partner/documents" component={PartnerDocuments} />
        <ProtectedRoute path="/partner/accounts" component={PartnerAccounts} />
        <ProtectedRoute path="/partner/comms" component={PartnerComms} />
        <ProtectedRoute path="/partner/settings" component={PartnerSettings} />
        <ProtectedRoute path="/partner/audit" component={PartnerAudit} />
        <ProtectedRoute path="/coach-hub" component={CoachHub} />
        <ProtectedRoute path="/gradebook" component={GradebookBrowser} />
        <ProtectedRoute path="/courses/:courseId/modules/:moduleId" component={ModuleViewer} />
        <ProtectedRoute path="/courses/:courseId" component={CourseDetail} />
        <ProtectedRoute path="/courses" component={Courses} />
        <ProtectedRoute path="/cases/:caseId/edit" component={CaseBuilder} />
        <ProtectedRoute path="/cases/:caseId/begin" component={CaseBegin} />
        <ProtectedRoute path="/cases" component={Cases} />
        <ProtectedRoute path="/notifications" component={NotificationsPage} />
        <ProtectedRoute path="/assess/:assessmentId" component={Assess} />
        <ProtectedRoute path="/credentials" component={Credentials} />
        <ProtectedRoute path="/coach/submissions" component={CoachSubmissions} />
        <ProtectedRoute path="/coaching/health" component={CoachingHealth} />
        <ProtectedRoute path="/coaching/sections" component={CoachingMatching} />
        <ProtectedRoute path="/coach" component={CoachLearners} />
        <ProtectedRoute path="/org/members" component={OrgMembers} />
        <ProtectedRoute path="/admin/partners" component={AdminPartners} />
        <ProtectedRoute path="/admin/document-templates" component={AdminDocumentTemplates} />
        <ProtectedRoute path="/admin/funders" component={AdminFunders} />
        <ProtectedRoute path="/delivery" component={Delivery} />
        <ProtectedRoute path="/my-attendance" component={MyAttendance} />
        <ProtectedRoute path="/compliance" component={Compliance} />
        <ProtectedRoute path="/accreditation" component={Accreditation} />
        <ProtectedRoute path="/activities" component={ActivitiesAdmin} />
        <ProtectedRoute path="/support/:ticketId" component={Support} />
        <ProtectedRoute path="/support" component={Support} />
        <ProtectedRoute path="/platform" component={PlatformConsole} />
        <ProtectedRoute path="/partner/theme" component={PartnerTheme} />
        <ProtectedRoute path="/reports" component={Reports} />

        <Route component={NotFound} />
      </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <SessionProvider>
            <ThemeApplier />
            <Routes />
          </SessionProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
