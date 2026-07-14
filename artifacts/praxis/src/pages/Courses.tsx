import React from 'react';
import { useListCourses } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { BookOpen, Clock } from 'lucide-react';

export function Courses() {
  const { data: courses, isLoading } = useListCourses();

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif font-bold tracking-tight">Course Catalog</h1>
        <p className="text-muted-foreground">Browse available programs and begin your mastery journey.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-64 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses?.map(course => (
            <Card key={course.id} className="flex flex-col overflow-hidden group hover:shadow-lg transition-all duration-300 border-border/50">
              <div className="aspect-video bg-muted relative overflow-hidden">
                {course.thumbnailUrl ? (
                  <img src={course.thumbnailUrl} alt={course.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
                    <BookOpen className="h-12 w-12 text-primary/20" />
                  </div>
                )}
                <div className="absolute top-3 right-3 flex gap-2">
                  {course.nqfLevel && (
                    <span className="bg-background/90 backdrop-blur text-foreground text-xs font-bold px-2 py-1 rounded-md border border-border">
                      NQF {course.nqfLevel}
                    </span>
                  )}
                </div>
              </div>
              
              <CardHeader className="flex-1 pb-4">
                <CardTitle className="line-clamp-2 text-xl font-serif">{course.title}</CardTitle>
                <CardDescription className="line-clamp-3 mt-2">
                  {course.description || "No description provided."}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-6">
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" />
                    {course.moduleCount || 0} Modules
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Self-paced
                  </span>
                </div>
                <Link href={`/courses/${course.id}`}>
                  <Button className="w-full">View Course</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
          {courses?.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-xl">
              No courses available at this time.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
