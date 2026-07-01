import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StudyAuthProvider, useStudyAuth } from "@/hooks/use-study-auth";
import { useEffect, type ComponentType } from "react";

import NotFound from "@/pages/not-found";
import StudyLanding from "@/pages/StudyLanding";
import StudyLogin from "@/pages/StudyLogin";
import StudySignup from "@/pages/StudySignup";
import StudyDashboard from "@/pages/StudyDashboard";
import StudyMaterials from "@/pages/StudyMaterials";
import StudyMaterialNew from "@/pages/StudyMaterialNew";
import StudyPractice from "@/pages/StudyPractice";
import StudyPracticeSession from "@/pages/StudyPracticeSession";
import StudyExams from "@/pages/StudyExams";
import StudyExamTake from "@/pages/StudyExamTake";
import StudyTutor from "@/pages/StudyTutor";
import StudyTutorChat from "@/pages/StudyTutorChat";
import StudyTutorGuided from "@/pages/StudyTutorGuided";
import StudyProfile from "@/pages/StudyProfile";
import StudyBriefs from "@/pages/StudyBriefs";
import StudyKnowledgeMap from "@/pages/StudyKnowledgeMap";
import StudyMaterialView from "@/pages/StudyMaterialView";
import StudyAssessment from "@/pages/StudyAssessment";
import StudyReadStep from "@/pages/StudyReadStep";
import StudyStrategy from "@/pages/StudyStrategy";
import StudyProgress from "@/pages/StudyProgress";
import StudyIntake from "@/pages/StudyIntake";
import StudyStartOver from "@/pages/StudyStartOver";
import StudyCoach from "@/pages/StudyCoach";
import StudyUpgrade from "@/pages/StudyUpgrade";
import StudyAdminCoupons from "@/pages/StudyAdminCoupons";
import StudyAmbassador from "@/pages/StudyAmbassador";
import StudyAdminAmbassadors from "@/pages/StudyAdminAmbassadors";

const queryClient = new QueryClient();

function Protected({ component: Component }: { component: ComponentType }) {
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={StudyLanding} />
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
      <Route path="/admin/coupons" component={() => <Protected component={StudyAdminCoupons} />} />
      <Route path="/admin/ambassadors" component={() => <Protected component={StudyAdminAmbassadors} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <StudyAuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </StudyAuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
