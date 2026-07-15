import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useListCourses } from "@workspace/api-client-react";
import { BookOpen, ArrowRight, CheckCircle2, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { courseAccent } from "@/lib/courseColor";

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
}
interface ProgressMe {
  courses: CourseProgress[];
}

export function Courses() {
  const [, navigate] = useLocation();
  const { data: catalog, isLoading } = useListCourses();
  const { data: prog } = useQuery({
    queryKey: ["progress", "me"],
    queryFn: () => apiFetch<ProgressMe>("/progress/me"),
  });

  const enrolled = prog?.courses ?? [];
  const enrolledIds = new Set(enrolled.map((c) => c.courseId));
  // Catalog metadata keyed by id, so enrolled cards can borrow nqf/module counts.
  const meta = new Map((catalog ?? []).map((c) => [c.id, c]));
  const exploreList = (catalog ?? []).filter((c) => !enrolledIds.has(c.id));

  const hasEnrolled = enrolled.length > 0;

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight">
          {hasEnrolled ? "My Courses" : "Course Catalog"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {hasEnrolled
            ? "Pick up a course in progress, or explore something new."
            : "Browse available programs and begin your mastery journey."}
        </p>
      </div>

      {/* Enrolled */}
      {hasEnrolled && (
        <section>
          <h2 className="text-lg font-serif font-semibold tracking-tight mb-4">In your enrolment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {enrolled.map((c) => {
              const a = courseAccent(c.courseId);
              const m = meta.get(c.courseId);
              const done = c.percent >= 100 || c.status === "completed";
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
                      {m?.nqfLevel && (
                        <span className="text-xs text-muted-foreground">NQF Level {m.nqfLevel}</span>
                      )}
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
    </div>
  );
}
