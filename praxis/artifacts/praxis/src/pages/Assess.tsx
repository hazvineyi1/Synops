import React from 'react';
import { useListAssessments } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardList, Clock, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function Assess() {
  const { data: assessments, isLoading } = useListAssessments();
  const { toast } = useToast();

  const handleStart = () => {
    toast({
      title: "Assessment Initializing",
      description: "Adaptive engine is preparing your item pool...",
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in max-w-5xl mx-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif font-bold tracking-tight">Diagnostics & Assessments</h1>
        <p className="text-muted-foreground">Evaluate your current competency levels to receive a targeted learning path.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        {isLoading ? (
          [1,2].map(i => <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />)
        ) : (
          assessments?.map(assessment => (
            <Card key={assessment.id} className="flex flex-col group hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="flex justify-between items-start mb-2">
                  <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border
                    ${assessment.type === 'diagnostic' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                      assessment.type === 'mastery' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                      'bg-slate-50 text-slate-700 border-slate-200'}`}>
                    {assessment.type}
                  </span>
                </div>
                <CardTitle className="font-serif text-xl">{assessment.title}</CardTitle>
                <CardDescription className="line-clamp-2">{assessment.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex justify-between items-end">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Approx. 20 mins
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" /> Adaptive pool
                  </p>
                </div>
                <Button onClick={handleStart}>Start Assessment</Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
