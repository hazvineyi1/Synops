import React, { useState } from 'react';
import { useGetScriptDraft, useUpdateScriptDraft, usePublishScriptDraft, useListCourses } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Save, Upload, Play, Loader2, PenTool } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BeatUpdate, PublishDraftInputLessonType } from '@workspace/api-client-react';

export function StudioEdit({ params }: { params: { draftId: string } }) {
  const { draftId } = params;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: draft, isLoading } = useGetScriptDraft(draftId, { query: { enabled: !!draftId, queryKey: ['draft', draftId] } });
  const updateDraft = useUpdateScriptDraft();
  const publishDraft = usePublishScriptDraft();
  const { data: courses } = useListCourses();

  // Local state for editing
  const [editingBeatId, setEditingBeatId] = useState<string | null>(null);
  const [beatsForm, setBeatsForm] = useState<Record<string, BeatUpdate>>({});
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  // Typed to the contract's enum rather than a loose string, so an invalid lesson type
  // can't reach the API (the DB column is an enum and would reject it at publish time).
  const [lessonType, setLessonType] = useState<PublishDraftInputLessonType>('socratic');

  // Sync draft to local state once loaded
  React.useEffect(() => {
    if (draft?.beats) {
      const initialForm: Record<string, BeatUpdate> = {};
      draft.beats.forEach(b => {
        initialForm[b.id] = {
          title: b.title,
          narration: b.narration,
          bulletPoints: b.bulletPoints || [],
          scenario: b.scenario || '',
        };
      });
      setBeatsForm(initialForm);
    }
  }, [draft]);

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-primary" /></div>;
  if (!draft) return <div>Draft not found</div>;

  const handleSaveBeat = (beatId: string) => {
    const updateData = beatsForm[beatId];
    if (!updateData) return;

    // In a real app we'd construct the full array of updates.
    // For this mockup API signature `beats?: BeatUpdate[]` we'll just send the modified one 
    // or all of them. Let's send all current state to be safe.
    const allUpdates = draft.beats.map(b => beatsForm[b.id] || { title: b.title });

    updateDraft.mutate(
      { draftId, data: { beats: allUpdates } },
      {
        onSuccess: () => {
          toast({ title: 'Beat saved' });
          setEditingBeatId(null);
        }
      }
    );
  };

  const handlePublish = () => {
    if (!selectedCourseId) {
      toast({ variant: 'destructive', title: 'Select a course first' });
      return;
    }
    publishDraft.mutate(
      { draftId, data: { courseId: selectedCourseId, moduleTitle: draft.title, lessonType } },
      {
        onSuccess: () => {
          toast({ title: 'Published successfully', description: 'Module added to course.' });
          setLocation('/studio');
        }
      }
    );
  };

  const isGenerating = draft.status === 'generating';

  return (
    <div className="space-y-8 pb-24">
      <div className="flex items-center justify-between sticky top-0 z-20 bg-background/80 backdrop-blur-md py-4 border-b border-border">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/studio')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-serif font-bold line-clamp-1">{draft.title}</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{draft.status}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Select
              value={lessonType}
              onValueChange={(v) => setLessonType(v as PublishDraftInputLessonType)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Lesson type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="socratic">🧠 Socratic</SelectItem>
                <SelectItem value="video">▶️ Video</SelectItem>
                <SelectItem value="slides">📑 Slides</SelectItem>
                <SelectItem value="quiz">✅ Quiz</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select target course..." />
              </SelectTrigger>
              <SelectContent>
                {courses?.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handlePublish} disabled={publishDraft.isPending || isGenerating}>
              <Upload className="h-4 w-4 mr-2" /> Publish to Course
            </Button>
          </div>
        </div>
      </div>

      {isGenerating ? (
        <div className="py-20 text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <h2 className="text-2xl font-serif">Generating Beats...</h2>
          <p className="text-muted-foreground">The AI is analyzing your source text and structuring the Socratic dialogue.</p>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto space-y-6">
          {draft.beats?.map((beat, index) => {
            const isEditing = editingBeatId === beat.id;
            const formState = beatsForm[beat.id] || {};

            return (
              <Card key={beat.id} className="relative overflow-hidden group">
                {/* Type Badge */}
                <div className="absolute top-0 right-0 rounded-bl-xl bg-primary/10 text-primary px-3 py-1 text-xs font-bold uppercase tracking-wider z-10">
                  {beat.type.replace('_', ' ')}
                </div>
                
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm text-muted-foreground shrink-0">
                      {index + 1}
                    </div>
                    {isEditing ? (
                      <Input 
                        value={formState.title || ''} 
                        onChange={e => setBeatsForm(p => ({ ...p, [beat.id]: { ...p[beat.id], title: e.target.value } }))}
                        className="font-serif text-xl font-bold"
                      />
                    ) : (
                      <CardTitle className="text-xl font-serif">{beat.title}</CardTitle>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Visual Preview Side */}
                    <div className="rounded-xl border border-border bg-slate-50 dark:bg-slate-900 overflow-hidden relative aspect-video flex items-center justify-center p-6 text-center">
                      <div className="absolute top-2 left-2 bg-background/50 backdrop-blur rounded px-2 py-0.5 text-[10px] font-mono text-muted-foreground">Preview</div>
                      
                      {/* Rough visual representations based on type */}
                      {beat.type === 'title_card' && (
                        <h3 className="font-serif text-2xl font-bold text-foreground animate-in zoom-in duration-700">{formState.title || beat.title}</h3>
                      )}
                      
                      {beat.type === 'points' && (
                        <ul className="text-left w-full space-y-2">
                          {(formState.bulletPoints || beat.bulletPoints || []).map((pt: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-foreground animate-in slide-in-from-left-4" style={{ animationDelay: `${i * 200}ms`, animationFillMode: 'both' }}>
                              <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {beat.type === 'scenario' && (
                        <div className="bg-background rounded-lg p-4 shadow-sm border border-border w-full text-left text-sm italic text-foreground">
                          "{formState.scenario || beat.scenario}"
                        </div>
                      )}

                      {beat.type === 'compare' && (
                        <div className="flex w-full h-full gap-2 pt-4">
                          <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded text-xs p-2 text-red-700 dark:text-red-400">Incorrect Approach</div>
                          <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded text-xs p-2 text-green-700 dark:text-green-400">Correct Approach</div>
                        </div>
                      )}
                      
                      {(beat.type === 'close' || beat.type === 'diagram') && (
                        <div className="text-muted-foreground">Visual Asset Placeholder</div>
                      )}
                    </div>

                    {/* Data / Edit Side */}
                    <div className="space-y-4 flex flex-col">
                      <div className="space-y-2 flex-1">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Tutor Narration</Label>
                        {isEditing ? (
                          <Textarea 
                            value={formState.narration || ''} 
                            onChange={e => setBeatsForm(p => ({ ...p, [beat.id]: { ...p[beat.id], narration: e.target.value } }))}
                            className="min-h-[100px] text-sm"
                          />
                        ) : (
                          <p className="text-sm leading-relaxed text-foreground bg-muted/30 p-3 rounded-md border border-border/50">{beat.narration}</p>
                        )}
                      </div>

                      {/* Extra fields based on type */}
                      {beat.type === 'scenario' && isEditing && (
                        <div className="space-y-2">
                          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Scenario Text</Label>
                          <Textarea 
                            value={formState.scenario || ''} 
                            onChange={e => setBeatsForm(p => ({ ...p, [beat.id]: { ...p[beat.id], scenario: e.target.value } }))}
                            className="text-sm"
                          />
                        </div>
                      )}

                      <div className="flex justify-end pt-2 gap-2">
                        {isEditing ? (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => setEditingBeatId(null)}>Cancel</Button>
                            <Button size="sm" onClick={() => handleSaveBeat(beat.id)} disabled={updateDraft.isPending}>
                              <Save className="h-4 w-4 mr-2" /> Save Beat
                            </Button>
                          </>
                        ) : (
                          <Button variant="secondary" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setEditingBeatId(beat.id)}>
                            <PenTool className="h-4 w-4 mr-2" /> Edit
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
