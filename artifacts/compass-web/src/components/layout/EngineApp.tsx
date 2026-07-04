import { Switch, Route, Redirect } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { useAuth } from "@/lib/auth-context";
import { canManageSchool, isBuilder, canViewConsole } from "@/lib/roles";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import ClientDetail from "@/pages/ClientDetail";
import Projects from "@/pages/Projects";
import NewProject from "@/pages/NewProject";
import ProjectDetail from "@/pages/ProjectDetail";
import ProjectIntake from "@/pages/ProjectIntake";
import ProjectDesign from "@/pages/ProjectDesign";
import ProjectQA from "@/pages/ProjectQA";
import ProjectHandoff from "@/pages/ProjectHandoff";
import ProjectTime from "@/pages/ProjectTime";
import ProjectMeetings from "@/pages/ProjectMeetings";
import Standards from "@/pages/Standards";
import Builders from "@/pages/compass/Builders";
import BuilderActivity from "@/pages/compass/BuilderActivity";
import Allocations from "@/pages/compass/Allocations";
import SchoolReport from "@/pages/compass/SchoolReport";
import MyWork from "@/pages/compass/MyWork";
import Console from "@/pages/compass/Console";
import ClassDetail from "@/pages/compass/ClassDetail";
import Billing from "@/pages/compass/Billing";
import NotFound from "@/pages/not-found";

/**
 * The institution-agnostic curriculum engine, branded as Compass. Mounted behind
 * the product auth gate at /compass via wouter's `nest`, so every Link inside the
 * engine (and its Shell) resolves relative to that base automatically.
 *
 * Role-aware surfaces: school administrators and global admins manage builders
 * and allocations; school administrators also see the school report; builders get
 * a focused "My work" view of their granted scopes. These gates are UX only; the
 * server authorizes every route.
 */
export function EngineApp() {
  const { user } = useAuth();
  const role = user?.role;
  const manage = canManageSchool(role);
  const builder = isBuilder(role);

  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/clients" component={Clients} />
        <Route path="/clients/:id" component={ClientDetail} />
        <Route path="/projects" component={Projects} />
        <Route path="/projects/new" component={NewProject} />
        <Route path="/projects/:id" component={ProjectDetail} />
        <Route path="/projects/:id/intake" component={ProjectIntake} />
        <Route path="/projects/:id/design" component={ProjectDesign} />
        <Route path="/projects/:id/qa" component={ProjectQA} />
        <Route path="/projects/:id/handoff" component={ProjectHandoff} />
        <Route path="/projects/:id/time" component={ProjectTime} />
        <Route path="/projects/:id/meetings" component={ProjectMeetings} />
        <Route path="/standards" component={Standards} />
        <Route path="/courses/:courseId/classes/:classId">
          {(params) => (
            <ClassDetail courseId={Number(params.courseId)} classId={Number(params.classId)} />
          )}
        </Route>
        <Route path="/builders">{manage ? <Builders /> : <Redirect to="/" />}</Route>
        <Route path="/builders/:id">
          {(params) =>
            manage ? <BuilderActivity id={Number(params.id)} /> : <Redirect to="/" />
          }
        </Route>
        <Route path="/allocations">{manage ? <Allocations /> : <Redirect to="/" />}</Route>
        <Route path="/school-report">
          {manage ? <SchoolReport /> : <Redirect to="/" />}
        </Route>
        <Route path="/billing">{manage ? <Billing /> : <Redirect to="/" />}</Route>
        <Route path="/my-work">{builder ? <MyWork /> : <Redirect to="/" />}</Route>
        <Route path="/console">
          {canViewConsole(role) ? <Console /> : <Redirect to="/" />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}
