import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useListCourses } from "@workspace/api-client-react";
import { BookOpen, ArrowRight, CheckCircle2, Layers, Award, Plus, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import { courseAccent } from "@/lib/courseColor";
import { PageHeader } from "@/components/PageHeader";

const CAN_AUTHOR = ["super_admin", "instructional_designer", "partner_admin", "org_admin", "coach"];

/**
 * My Courses.
 *
 * A learner's enrolled courses come first, shown with the same colour-coded,
 * progress-first cards as the dashboard (consistency is a top usability driver), then
 * the rest of the catalog to explore. Staff/unenrolled users simply see the catalog.
 */

interface CourseProgress {
  courseId: string;
  title: string;
  percent: number;
  status: string;
  viewedBeats: number;
  totalBeats: number;
  /** Holds a valid credential for a module in this course (mastery, not content %). */
  certified?: boolean;
}
interface ProgressMe {
  courses: CourseProgress[];
}

export function Courses() {
  const [, navigate] = useLocation();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const { data: catalog, isLoading } = useListCourses();
  const { data: prog } = useQuery({
    queryKey: ["progress", "me"],
    queryFn: () => apiFetch<ProgressMe>("/progress/me"),
  });

  const canAuthor = !!user && CAN_AUTHOR.includes(user.role);
  const [createOpen, setCreateOpen] = useState(false);
  const [nc, setNc] = useState({ title: "", description: "", nqfLevel: "" });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const createCourse = async () => {
    if (!nc.title.trim()) return;
    setCreating(true); setCreateErr(null);
    try {
      const course = await apiFetch<{ id: string }>("/courses", {
        method: "POST",
        body: JSON.stringify({
          title: nc.title.trim(),
          description: nc.description.trim() || undefined,
          nqfLevel: nc.nqfLevel ? Number(nc.nqfLevel) : undefined,
        }),
      });
      await queryClient.invalidateQueries();
      setCreateOpen(false);
      setNc({ title: "", description: "", nqfLevel: "" });
      navigate(`/courses/${course.id}`);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Could not create the course.");
    } finally {
      setCreating(false);
    }
  };

  const enrolled = prog?.courses ?? [];
  const enrolledIds = new Set(enrolled.map((c) => c.courseId));
  // Catalog metadata keyed by id, so enrolled cards can borrow nqf/module counts.
  const meta = new Map((catalog ?? []).map((c) => [c.id, c]));
  const exploreList = (catalog ?? []).filter((c) => !enrolledIds.has(c.id));

  const hasEnrolled = enrolled.length > 0;

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <PageHeader
        title={hasEnrolled ? "My Courses" : "Course Catalog"}
        icon={BookOpen}
        subtitle={hasEnrolled ? "Pick up a course in progress, or explore something new." : "Browse available programs and begin your mastery journey."}
        action={canAuthor ? (
          <Button className="gap-1.5" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New course</Button>
        ) : undefined}
      />

      {/* Enrolled */}
      {hasEnrolled && (
        <section>
          <h2 className="text-lg font-serif font-semibold tracking-tight mb-4">In your enrolment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {enrolled.map((c) => {
              const a = courseAccent(c.courseId);
              const m = meta.get(c.courseId);
              // "done" means the CONTENT is fully viewed -- a beats-based fact. It is
              // deliberately NOT tied to enrolment status or credentials: a learner can
              // hold a credential (mastery) at 0% content viewed, and the card must not
              // claim the content is finished when it isn't. Certification is shown as
              // its own badge below.
              const done = c.percent >= 100;
              return (
                <Card
                  key={c.courseId}
                  className="p-5 flex flex-col cursor-pointer hover:shadow-md transition-shadow group"
                  onClick={() => navigate(`/courses/${c.courseId}`)}
                >
                  <div className="flex items-start gap-3 mb-4">
                    <div className={cn("h-11 w-11 shrink-0 rounded-xl flex items-center justify-center", a.soft, a.text)}>
                      {done ? <CheckCircle2 className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {c.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        {m?.nqfLevel && (
                          <span className="text-xs text-muted-foreground">NQF Level {m.nqfLevel}</span>
                        )}
                        {c.certified && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 text-[11px] font-semibold px-2 py-0.5">
                            <Award className="h-3 w-3" /> Certified
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                      <span>{done ? "Complete" : `${c.viewedBeats} of ${c.totalBeats} steps`}</span>
                      <span className="tabular-nums font-medium">{c.percent}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", done ? "bg-emerald-500" : a.bar)}
                        style={{ width: `${c.percent}%` }}
                      />
                    </div>
                    <div className={cn("mt-4 inline-flex items-center gap-1 text-sm font-medium", done ? "text-emerald-600" : a.text)}>
                      {done ? "Review" : c.percent > 0 ? "Continue" : "Start"} <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Catalog */}
      <section>
        {hasEnrolled && exploreList.length > 0 && (
          <h2 className="text-lg font-serif font-semibold tracking-tight mb-4">Explore the catalog</h2>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
          </div>
        ) : exploreList.length === 0 ? (
          !hasEnrolled && (
            <div className="py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
              No courses available at this time.
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {exploreList.map((course) => {
              const a = courseAccent(course.id);
              return (
                <Card key={course.id} className="p-5 flex flex-col group hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className={cn("h-11 w-11 shrink-0 rounded-xl flex items-center justify-center", a.soft, a.text)}>
                      <BookOpen className="h-5 w-5" />
                    </div>
                    {course.nqfLevel && <Badge variant="outline">NQF {course.nqfLevel}</Badge>}
                  </div>
                  <h3 className="font-semibold text-lg leading-snug line-clamp-2 mb-1.5">{course.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-3 flex-1">
                    {course.description || "No description provided."}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-4 mb-4">
                    <Layers className="h-3.5 w-3.5" />
                    {course.moduleCount || 0} modules · Self-paced
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => navigate(`/courses/${course.id}`)}>
                    View course
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Create course (authors) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> New course</DialogTitle>
            <DialogDescription>Create a course, then add modules, case studies, interactives and assignments inside it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Course title</span>
              <input value={nc.title} autoFocus onChange={(e) => setNc((s) => ({ ...s, title: e.target.value }))} placeholder="e.g. Customer Service Excellence"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Description</span>
              <textarea value={nc.description} onChange={(e) => setNc((s) => ({ ...s, description: e.target.value }))} rows={3} placeholder="What the course covers and who it is for."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
            <label className="text-xs block max-w-[160px]"><span className="mb-1 block font-medium text-muted-foreground">NQF level (optional)</span>
              <input value={nc.nqfLevel} onChange={(e) => setNc((s) => ({ ...s, nqfLevel: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="e.g. 4"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
            {createErr && <div className="text-xs text-red-600">{createErr}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="gap-1.5" disabled={!nc.title.trim() || creating} onClick={createCourse}><Plus className="h-4 w-4" /> {creating ? "Creating…" : "Create course"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
