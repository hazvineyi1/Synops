import React, { useState } from 'react';
import { useListSubmissions, useReviewSubmission } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { FileCheck, CheckCircle2, Clock } from 'lucide-react';
import { SubmissionReviewStatus } from '@workspace/api-client-react';

export function CoachSubmissions() {
  const { data: submissions, isLoading, refetch } = useListSubmissions();
  const reviewMutation = useReviewSubmission();
  const { toast } = useToast();

  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [feedback, setFeedback] = useState('');

  const handleReview = (status: SubmissionReviewStatus) => {
    if (!selectedSubmission) return;
    
    // submissionId is a PATH param, not part of the body. It was being passed inside
    // `data`, so the top-level submissionId was undefined and every review request went
    // to /coach/submissions/undefined -- coaches could never actually grade anything.
    reviewMutation.mutate(
      { submissionId: selectedSubmission.id, data: { status, feedback } },
      {
        onSuccess: () => {
          toast({ title: "Review submitted" });
          setSelectedSubmission(null);
          setFeedback('');
          refetch();
        }
      }
    );
  };

  const pendingCount = submissions?.filter(s => s.status === 'submitted').length || 0;

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif font-bold tracking-tight">Review Queue</h1>
        <p className="text-muted-foreground">Evaluate learner submissions and provide attestations for credentials.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-semibold uppercase tracking-wider text-sm text-muted-foreground mb-4">Pending Review ({pendingCount})</h3>
          
          {isLoading ? (
            <div className="space-y-4"><div className="h-32 bg-muted rounded-xl animate-pulse" /></div>
          ) : (
            submissions?.filter(s => s.status === 'submitted').map(sub => (
              <Card key={sub.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6 flex justify-between items-start gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded uppercase tracking-wider">Awaiting Review</span>
                      <span className="text-xs text-muted-foreground flex items-center"><Clock className="h-3 w-3 mr-1"/> {new Date(sub.createdAt).toLocaleDateString()}</span>
                    </div>
                    <h4 className="text-lg font-serif font-bold">{sub.title}</h4>
                    <p className="text-sm text-muted-foreground mb-2">Module: {sub.moduleTitle}</p>
                    <p className="text-sm line-clamp-2 text-foreground/80">{sub.contentText}</p>
                  </div>
                  <Button onClick={() => setSelectedSubmission(sub)} className="shrink-0">
                    Evaluate
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
          
          {pendingCount === 0 && !isLoading && (
            <div className="py-12 text-center border-2 border-dashed rounded-xl border-border bg-card/50">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3 opacity-80" />
              <p className="font-medium">Queue is empty</p>
              <p className="text-sm text-muted-foreground">All submissions have been reviewed.</p>
            </div>
          )}

          <h3 className="font-semibold uppercase tracking-wider text-sm text-muted-foreground mt-12 mb-4">Recently Reviewed</h3>
          <div className="space-y-4 opacity-70 hover:opacity-100 transition-opacity">
             {submissions?.filter(s => s.status !== 'submitted').map(sub => (
              <Card key={sub.id} className="bg-muted/30 shadow-none border-border/50">
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <h4 className="font-medium text-sm">{sub.title}</h4>
                    <p className="text-xs text-muted-foreground">Status: <span className="uppercase">{sub.status}</span></p>
                  </div>
                  <FileCheck className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>

        </div>

        <div className="lg:col-span-1">
          <Card className="bg-primary text-primary-foreground border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="font-serif">Coaching Guidelines</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-4 opacity-90 leading-relaxed">
              <p>Your attestation directly influences the learner's mastery score and credential issuance.</p>
              <ul className="space-y-2 list-disc pl-4">
                <li>Approve only if the submission demonstrates applied reasoning.</li>
                <li>Provide specific, actionable feedback if "Reviewed" (needs work).</li>
                <li>Focus on logic and approach, not just factual correctness.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!selectedSubmission} onOpenChange={(o) => !o && setSelectedSubmission(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Evaluate Submission</DialogTitle>
          </DialogHeader>
          
          {selectedSubmission && (
            <div className="space-y-6 pt-4">
              <div className="bg-muted p-4 rounded-xl border border-border">
                <h4 className="font-medium mb-1">{selectedSubmission.title}</h4>
                <p className="text-xs text-muted-foreground mb-4">Module: {selectedSubmission.moduleTitle}</p>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedSubmission.contentText}
                </div>
              </div>

              <div className="space-y-3">
                <Label>Coach Feedback & Attestation</Label>
                <Textarea 
                  placeholder="Provide your reasoning for approval or required improvements..."
                  className="min-h-[150px]"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setSelectedSubmission(null)}>Cancel</Button>
                <Button 
                  variant="secondary" 
                  disabled={!feedback || reviewMutation.isPending}
                  onClick={() => handleReview('reviewed')}
                >
                  Request Revision
                </Button>
                <Button 
                  disabled={reviewMutation.isPending}
                  onClick={() => handleReview('approved')}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Approve & Attest
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
