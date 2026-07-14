import React from 'react';
import { useListCoachLearners, useGetLearnerPresession } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, AlertCircle, Activity, Award } from 'lucide-react';
import { Link } from 'wouter';

export function CoachLearners() {
  const { data: learners, isLoading } = useListCoachLearners();

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif font-bold tracking-tight">My Learners</h1>
        <p className="text-muted-foreground">Monitor readiness scores and intervene when competency gaps emerge.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-4 font-medium">Learner</th>
                  <th className="px-6 py-4 font-medium">Readiness Score</th>
                  <th className="px-6 py-4 font-medium">Top Gaps</th>
                  <th className="px-6 py-4 font-medium">Last Activity</th>
                  <th className="px-6 py-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y border-t border-border">
                {isLoading && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading learners...</td></tr>
                )}
                {learners?.map(learner => (
                  <tr key={learner.userId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {(learner.firstName?.[0] || '') + (learner.lastName?.[0] || '') || learner.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-foreground">{learner.firstName} {learner.lastName}</p>
                          <p className="text-xs text-muted-foreground">{learner.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="w-32 space-y-1.5">
                        <div className="flex justify-between text-xs font-medium">
                          <span className={learner.readinessScore < 0.6 ? 'text-destructive' : 'text-foreground'}>
                            {Math.round(learner.readinessScore * 100)}%
                          </span>
                        </div>
                        <Progress 
                          value={learner.readinessScore * 100} 
                          className="h-1.5" 
                          indicatorClassName={learner.readinessScore < 0.6 ? 'bg-destructive' : 'bg-primary'}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {learner.topGaps?.slice(0, 2).map((gap, i) => (
                          <Badge key={i} variant="outline" className="bg-destructive/5 text-destructive border-destructive/20 text-[10px]">
                            {gap}
                          </Badge>
                        ))}
                        {(!learner.topGaps || learner.topGaps.length === 0) && (
                          <span className="text-xs text-muted-foreground">None identified</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {learner.lastActivityAt ? new Date(learner.lastActivityAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <PreSessionDialog userId={learner.userId} name={`${learner.firstName} ${learner.lastName}`} />
                    </td>
                  </tr>
                ))}
                {learners?.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No learners assigned to you.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreSessionDialog({ userId, name }: { userId: string, name: string }) {
  // Query only runs when dialog opens
  const [open, setOpen] = React.useState(false);
  const { data: brief, isLoading } = useGetLearnerPresession(userId, { query: { enabled: open, queryKey: ['presession', userId] } });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">Pre-session Brief</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Coaching Brief: {name}</DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Generating brief...</div>
        ) : brief ? (
          <div className="space-y-6 pt-4">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-xl p-4">
                <h4 className="font-semibold text-green-800 dark:text-green-400 mb-2 flex items-center gap-2 text-sm uppercase tracking-wider">
                  <Award className="h-4 w-4" /> Demonstrated Strengths
                </h4>
                <ul className="space-y-1 text-sm">
                  {brief.strengths.map((s, i) => <li key={i}>• {s}</li>)}
                  {brief.strengths.length === 0 && <li className="text-muted-foreground italic">Insufficient data</li>}
                </ul>
              </div>
              
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-xl p-4">
                <h4 className="font-semibold text-red-800 dark:text-red-400 mb-2 flex items-center gap-2 text-sm uppercase tracking-wider">
                  <AlertCircle className="h-4 w-4" /> Competency Gaps
                </h4>
                <ul className="space-y-1 text-sm">
                  {brief.gaps.map((g, i) => <li key={i}>• {g}</li>)}
                  {brief.gaps.length === 0 && <li className="text-muted-foreground italic">No major gaps identified</li>}
                </ul>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" /> Recent Activity
              </h4>
              <div className="space-y-3 pl-2 border-l-2 border-border ml-2">
                {brief.recentActivity.slice(0, 3).map(act => (
                  <div key={act.id} className="relative pl-4">
                    <div className="absolute w-2 h-2 rounded-full bg-primary -left-[5px] top-1.5 ring-4 ring-background" />
                    <p className="text-sm font-medium">{act.description}</p>
                    <p className="text-xs text-muted-foreground">{new Date(act.createdAt).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </div>

            {brief.pendingWork.length > 0 && (
              <div className="bg-muted rounded-xl p-4">
                <h4 className="font-semibold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Work Pending Review
                </h4>
                <div className="space-y-2">
                  {brief.pendingWork.map(work => (
                    <div key={work.id} className="flex justify-between items-center bg-background p-3 rounded-lg border border-border">
                      <div>
                        <p className="font-medium text-sm">{work.title}</p>
                        <p className="text-xs text-muted-foreground">{work.moduleTitle}</p>
                      </div>
                      <Link href="/coach/submissions">
                        <Button size="sm" variant="outline">Review</Button>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 flex justify-end gap-2">
              <Button onClick={() => setOpen(false)}>Close Brief</Button>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground">Brief unavailable.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
