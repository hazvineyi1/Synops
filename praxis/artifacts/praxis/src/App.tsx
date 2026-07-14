import React from 'react';
import { Switch, Route, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SessionProvider, useSession } from '@/context/SessionContext';

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
import { CoachSubmissions } from '@/pages/CoachSubmissions';
import { AdminPartners } from '@/pages/AdminPartners';
import { PartnerTheme } from '@/pages/PartnerTheme';
import { Reports } from '@/pages/Reports';
import { CoachSettings } from '@/pages/CoachSettings';
import { OrgMembers } from '@/pages/OrgMembers';
import { SignInPage } from '@/pages/SignIn';
import { ForgotPasswordPage } from '@/pages/ForgotPassword';
import { ResetPasswordPage } from '@/pages/ResetPassword';
import { PlatformConsole } from '@/pages/PlatformConsole';
import { ActivitiesAdmin } from '@/pages/ActivitiesAdmin';
import { ActivityPlay } from '@/pages/ActivityPlay';
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
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={HomeRedirect} />

        {/* Auth */}
        <PublicRoute path="/sign-in" component={SignInPage} />
        <PublicRoute path="/forgot-password" component={ForgotPasswordPage} />
        <PublicRoute path="/reset-password" component={ResetPasswordPage} />

        {/* Dev demo login. The server 404s this route in production. */}
        <PublicRoute path="/dev-login" component={DevLogin} />

        {/* Public */}
        <PublicRoute path="/verify/:credentialId" component={Verify} />

        {/* Full-screen focus routes */}
        <FocusRoute path="/learn/:sessionId" component={LearnSession} />
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
        <ProtectedRoute path="/courses/:courseId/modules/:moduleId" component={ModuleViewer} />
        <ProtectedRoute path="/courses/:courseId" component={CourseDetail} />
        <ProtectedRoute path="/courses" component={Courses} />
        <ProtectedRoute path="/notifications" component={NotificationsPage} />
        <ProtectedRoute path="/assess/:assessmentId" component={Assess} />
        <ProtectedRoute path="/credentials" component={Credentials} />
        <ProtectedRoute path="/coach-settings" component={CoachSettings} />
        <ProtectedRoute path="/coach/submissions" component={CoachSubmissions} />
        <ProtectedRoute path="/coach" component={CoachLearners} />
        <ProtectedRoute path="/org/members" component={OrgMembers} />
        <ProtectedRoute path="/admin/partners" component={AdminPartners} />
        <ProtectedRoute path="/activities" component={ActivitiesAdmin} />
        <ProtectedRoute path="/support/:ticketId" component={Support} />
        <ProtectedRoute path="/support" component={Support} />
        <ProtectedRoute path="/platform" component={PlatformConsole} />
        <ProtectedRoute path="/partner/theme" component={PartnerTheme} />
        <ProtectedRoute path="/reports" component={Reports} />

        <Route component={NotFound} />
      </Switch>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <SessionProvider>
          <Routes />
        </SessionProvider>
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
