import React, { useState } from 'react';
import { useListScriptDrafts, useGenerateScript } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Link, useLocation } from 'wouter';
import { PlusCircle, PenTool, Clock, Settings2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function Studio() {
  const { data: drafts, isLoading } = useListScriptDrafts();
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-serif font-bold tracking-tight">Animation Studio</h1>
          <p className="text-muted-foreground">Generate and edit Socratic beats before publishing to courses.</p>
        </div>
        <Link href="/studio/new">
          <Button>
            <PlusCircle className="h-4 w-4 mr-2" /> New Script Draft
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {drafts?.map(draft => (
            <Card key={draft.id} className="flex flex-col hover:shadow-md transition-shadow group">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start mb-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
                    ${draft.status === 'ready' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      draft.status === 'generating' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {draft.status}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    {new Date(draft.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <CardTitle className="line-clamp-2 text-lg font-serif">{draft.title}</CardTitle>
              </CardHeader>
              <CardContent className="mt-auto pt-0 flex justify-between items-center">
                <div className="text-sm text-muted-foreground font-medium">
                  {draft.beats?.length || 0} Beats
                </div>
                <Button variant="secondary" size="sm" onClick={() => setLocation(`/studio/${draft.id}`)} disabled={draft.status === 'generating'}>
                  <PenTool className="h-4 w-4 mr-2" /> Edit Draft
                </Button>
              </CardContent>
            </Card>
          ))}
          {drafts?.length === 0 && (
            <div className="col-span-full py-16 text-center border-2 border-dashed border-border rounded-xl">
              <Settings2 className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium text-foreground">No scripts generated yet.</p>
              <p className="text-muted-foreground mt-1 mb-4">Transform your source material into interactive beats.</p>
              <Link href="/studio/new">
                <Button variant="outline">Create First Script</Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StudioNew() {
  const [, setLocation] = useLocation();
  const generateScript = useGenerateScript();
  const { toast } = useToast();
  
  const [title, setTitle] = useState('');
  const [sourceText, setSourceText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !sourceText.trim()) return;

    generateScript.mutate(
      { data: { title, sourceText } },
      {
        onSuccess: (draft) => {
          toast({ title: "Draft Generation Started", description: "Your script is being processed." });
          setLocation(`/studio/${draft.id}`);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Generation failed", description: "Could not create script." });
        }
      }
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-serif font-bold tracking-tight">Generate New Script</h1>
        <p className="text-muted-foreground">Paste your source material (policy, SOP, guide) and AI will structure it into learning beats.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Module Title</Label>
              <Input 
                id="title" 
                placeholder="e.g. Advanced Conflict Resolution" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Source Material</Label>
              <Textarea 
                id="source" 
                placeholder="Paste the raw text content here. The AI will extract key concepts and create a structured Socratic dialogue flow." 
                className="min-h-[300px] font-mono text-sm leading-relaxed"
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => setLocation('/studio')} disabled={generateScript.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={generateScript.isPending}>
                {generateScript.isPending ? 'Generating...' : 'Generate Beats'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
