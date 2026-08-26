import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useGetMe, useListPartners } from '@workspace/api-client-react';
import { setActivePartner } from '@/lib/partnerHubData';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LayoutTemplate, FileWarning, Check, Loader2, BookOpen, Award, Sparkles } from 'lucide-react';

type Template = {
  key: string;
  name: string;
  kind: 'course' | 'practice';
  audience: string;
  summary: string;
  creates: string[];
  moduleCount: number;
  credentialCount: number;
};

type UseResult = { ok: boolean; kind: string; redirect: string; message: string; partnerId?: string };

export function TemplateLibrary() {
  const { data: me } = useGetMe();
  const { data: partners } = useListPartners();
  const [, navigate] = useLocation();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [partnerFor, setPartnerFor] = useState<Record<string, string>>({});
  const [promptFor, setPromptFor] = useState<Record<string, string>>({});
  const isSuper = me?.role === 'super_admin';

  React.useEffect(() => {
    if (!isSuper) return;
    apiFetch<Template[]>('/platform/templates').then(setTemplates).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load templates.'));
  }, [isSuper]);

  if (!isSuper) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <FileWarning className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <h1 className="text-xl font-serif font-semibold mb-1">Not available</h1>
        <p className="text-sm text-muted-foreground">The template library is for the platform team only.</p>
      </div>
    );
  }

  const run = async (t: Template, mode: 'use' | 'ai') => {
    setErr(null);
    const partnerId = t.kind === 'practice' ? partnerFor[t.key] : undefined;
    if (t.kind === 'practice' && !partnerId) { setErr(`Choose a partner for "${t.name}" first.`); return; }
    const prompt = (promptFor[t.key] ?? '').trim();
    if (mode === 'ai' && !prompt) { setErr(`Describe what AI should develop for "${t.name}" first.`); return; }
    setBusy(`${t.key}:${mode}`);
    try {
      const path = mode === 'ai' ? '/platform/templates/develop' : '/platform/templates/use';
      const r = await apiFetch<UseResult>(path, {
        method: 'POST',
        body: JSON.stringify({ key: t.key, ...(partnerId ? { partnerId } : {}), ...(mode === 'ai' ? { prompt } : {}) }),
      });
      if (r.kind === 'practice' && r.partnerId) setActivePartner(r.partnerId);
      navigate(r.redirect);
    } catch (e) {
      setErr(`${t.name}: ${e instanceof Error ? e.message : 'Could not build from this template.'}`);
      setBusy(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-serif font-bold tracking-tight">Template Library</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          A starter template for every type of course the platform builds. Using one scaffolds a real draft — a course with starter modules, or a partner's starter practice credentials — that you then edit. Every new build starts from a consistent, well-formed structure instead of a blank page.
        </p>
      </div>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</div>
      )}

      {!templates && !err && (
        <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading templates…</div>
      )}

      <div className="space-y-3">
        {(templates ?? []).map((t) => (
          <Card key={t.key} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {t.kind === 'practice' ? <Award className="h-4 w-4 text-primary" /> : <BookOpen className="h-4 w-4 text-primary" />}
                  <h2 className="font-serif font-semibold">{t.name}</h2>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1.5 py-0.5">
                    {t.kind === 'practice' ? 'Practice credentials' : 'Module course'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{t.audience}</p>
                <p className="text-sm text-muted-foreground mt-2">{t.summary}</p>
                <ul className="mt-3 space-y-1">
                  {t.creates.map((c, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" /> <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {t.kind === 'practice' && (
              <div className="mt-4">
                <select
                  value={partnerFor[t.key] ?? ''}
                  onChange={(e) => setPartnerFor((p) => ({ ...p, [t.key]: e.target.value }))}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm max-w-[240px]"
                >
                  <option value="">Choose a partner…</option>
                  {((partners ?? []) as Array<{ id: string; name: string }>).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={busy === `${t.key}:use`} onClick={() => run(t, 'use')} className="gap-1.5">
                {busy === `${t.key}:use` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LayoutTemplate className="h-3.5 w-3.5" />}
                {busy === `${t.key}:use` ? 'Creating…' : 'Use starter'}
              </Button>
              <span className="text-xs text-muted-foreground">— a clean scaffold you fill in yourself.</span>
            </div>

            {/* AI development option — available on every template. */}
            <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" /> Develop with AI
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Describe your {t.kind === 'practice' ? 'practice programme' : 'course'} and AI drafts the {t.kind === 'practice' ? 'credentials' : 'modules and objectives'} for you, tailored to your brief. You still review and edit everything.
              </p>
              <textarea
                value={promptFor[t.key] ?? ''}
                onChange={(e) => setPromptFor((p) => ({ ...p, [t.key]: e.target.value }))}
                rows={2}
                placeholder={t.kind === 'practice'
                  ? 'e.g. Frontline supervision in community health: prioritising, delegating, difficult conversations…'
                  : 'e.g. Introduction to financial literacy for first-year undergraduates, 6 weeks, online…'}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <div className="mt-2">
                <Button size="sm" disabled={busy === `${t.key}:ai`} onClick={() => run(t, 'ai')} className="gap-1.5">
                  {busy === `${t.key}:ai` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {busy === `${t.key}:ai` ? 'Developing…' : 'Develop with AI'}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default TemplateLibrary;
