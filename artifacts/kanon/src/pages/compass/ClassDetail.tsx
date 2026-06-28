import { Link } from "wouter";
import { useListClasses } from "@workspace/kanon-api-client";
import ClassRoster from "@/pages/compass/ClassRoster";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ClassDetailProps {
  courseId: number;
  classId: number;
}

export default function ClassDetail({ courseId, classId }: ClassDetailProps) {
  const { data: classes, isLoading } = useListClasses(courseId);
  const cls = classes?.find((c) => c.id === classId);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <div className="text-muted-foreground">Loading class...</div>
      </div>
    );
  }

  if (!cls) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <div className="text-muted-foreground">Class not found.</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <Link
          href="/projects"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Back to projects
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight">{cls.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {cls.section && (
              <Badge variant="secondary">Section {cls.section}</Badge>
            )}
            {cls.term && (
              <Badge variant="outline">{cls.term}</Badge>
            )}
            <Badge variant={cls.status === "active" ? "secondary" : "outline"}>
              {cls.status}
            </Badge>
          </div>
        </div>
      </div>

      <ClassRoster classId={classId} courseId={courseId} className={cls.name} />
    </div>
  );
}
