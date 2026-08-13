import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/RichTextEditor';
import {
  Image as ImageIcon, FileText, Link2, StickyNote, Trash2, Pencil, Sparkles,
  ExternalLink, Presentation, Check,
} from 'lucide-react';

type PortfolioT = { id: string; title: string; tagline: string | null; template: string; aboutHtml: string | null; coverImageUrl: string | null };
type ItemT = { id: string; kind: 'image' | 'file' | 'link' | 'note'; title: string | null; descriptionHtml: string | null; fileUrl: string | null; linkUrl: string | null; thumbnailUrl: string | null; courseId: string | null; order: number; createdAt: string };

const TEMPLATES: Record<string, { name: string; cover: string; accent: string; dark?: boolean }> = {
  classic: { name: 'Classic', cover: 'from-slate-800 via-slate-700 to-slate-900', accent: 'bg-slate-700' },
  bold: { name: 'Bold', cover: 'from-indigo-600 via-purple-600 to-fuchsia-600', accent: 'bg-indigo-600' },
  minimal: { name: 'Minimal', cover: 'from-stone-200 via-stone-100 to-stone-50', accent: 'bg-stone-700', dark: true },
  warm: { name: 'Warm', cover: 'from-orange-500 via-amber-500 to-rose-500', accent: 'bg-orange-600' },
};

// A comprehensive, grounding rubric the learner builds their portfolio toward — the same standard
// across every course, so the portfolio stays coherent and rigorous.
const PORTFOLIO_RUBRIC: { name: string; descriptor: string }[] = [
  { name: 'Breadth & relevance of evidence', descriptor: 'A range of artifacts (work, projects, media) that clearly connect to your learning goals.' },
  { name: 'Depth of reflection', descriptor: 'Thoughtful reflection on what you learned, how you grew, and what challenged you — not just what you did.' },
  { name: 'Demonstration of growth', descriptor: 'Evidence of progress and increasing sophistication over time, course to course.' },
  { name: 'Quality & craft', descriptor: 'The work itself is accurate, complete, and well-executed.' },
  { name: 'Presentation & professionalism', descriptor: 'Clear, well-organised, visually coherent, and free of errors.' },
  { name: 'Goal alignment', descriptor: 'The collection makes a coherent case toward your stated goals and aspirations.' },
];

const fileToBase64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = rej;
  r.readAsDataURL(f);
});
const extOf = (name?: string | null) => (name?.split('.').pop() ?? '').toLowerCase();
const isPresentation = (name?: string | null) => ['ppt', 'pptx', 'key'].includes(extOf(name));

export function Portfolio() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['portfolio'], queryFn: () => apiFetch<{ portfolio: PortfolioT; items: ItemT[] }>('/portfolio') });
  const portfolio = data?.portfolio;
  const items = data?.items ?? [];
  const tpl = TEMPLATES[portfolio?.template ?? 'classic'] ?? TEMPLATES.classic;

  const savePortfolio = useMutation({
    mutationFn: (patch: Record<string, unknown>) => apiFetch('/portfolio', { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio'] }),
  });
  const addItem = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch('/portfolio/items', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio'] }),
  });
  const patchItem = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiFetch(`/portfolio/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio'] }),
  });
  const delItem = useMutation({
    mutationFn: (id: string) => apiFetch(`/portfolio/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio'] }),
  });

  // Editing state
  const [editHead, setEditHead] = useState(false);
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [aboutEditing, setAboutEditing] = useState(false);
  const [aboutDraft, setAboutDraft] = useState('');
  const [coverBusy, setCoverBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [addLink, setAddLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [addNote, setAddNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteHtml, setNoteHtml] = useState('');
  const imgInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (portfolio) { setTitle(portfolio.title); setTagline(portfolio.tagline ?? ''); } }, [portfolio?.id]);

  const upload = async (f: File) => {
    const dataBase64 = await fileToBase64(f);
    return apiFetch<{ url: string; filename: string; isImage: boolean }>('/portfolio/upload', { method: 'POST', body: JSON.stringify({ filename: f.name, dataBase64 }) });
  };

  const onAddFile = async (f: File | undefined, forceImage: boolean) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { setErr('That file is too large (25MB maximum).'); return; }
    setUploadBusy(true); setErr(null);
    try {
      const r = await upload(f);
      const image = forceImage || r.isImage;
      await addItem.mutateAsync({ kind: image ? 'image' : 'file', title: f.name.replace(/\.[^.]+$/, ''), fileUrl: r.url, thumbnailUrl: image ? r.url : null });
    } catch (e) { setErr(e instanceof Error ? e.message : 'Upload failed. File storage may not be configured.'); }
    finally { setUploadBusy(false); if (imgInput.current) imgInput.current.value = ''; if (fileInput.current) fileInput.current.value = ''; }
  };

  const onCover = async (f: File | undefined) => {
    if (!f) return;
    setCoverBusy(true); setErr(null);
    try { const r = await upload(f); savePortfolio.mutate({ coverImageUrl: r.url }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not set the cover.'); }
    finally { setCoverBusy(false); if (coverInput.current) coverInput.current.value = ''; }
  };

  const generate = async () => {
    setGenBusy(true); setErr(null);
    try {
      const r = await apiFetch<{ aboutHtml: string; tagline: string; template: string }>('/portfolio/generate', { method: 'POST', body: JSON.stringify({}) });
      savePortfolio.mutate({ aboutHtml: r.aboutHtml, tagline: r.tagline, template: r.template });
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not generate an intro.'); }
    finally { setGenBusy(false); }
  };

  if (isLoading || !portfolio) {
    return <div className="max-w-5xl mx-auto px-4 py-10"><div className="h-48 rounded-2xl bg-muted animate-pulse" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-20 space-y-6">
      {/* Cover hero */}
      <div className="relative h-52 sm:h-64 w-full overflow-hidden rounded-3xl">
        {portfolio.coverImageUrl ? (
          <img src={portfolio.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className={cn('absolute inset-0 bg-gradient-to-br', tpl.cover)} />
        )}
        <div className={cn('absolute inset-0', tpl.dark && !portfolio.coverImageUrl ? 'bg-gradient-to-t from-black/25 to-transparent' : 'bg-gradient-to-t from-black/65 via-black/25 to-black/5')} />
        <div className={cn('absolute inset-x-0 bottom-0 p-6', tpl.dark && !portfolio.coverImageUrl ? 'text-stone-900' : 'text-white')}>
          {editHead ? (
            <div className="space-y-2 max-w-lg">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg font-bold text-foreground" placeholder="Portfolio title" />
              <Input value={tagline} onChange={(e) => setTagline(e.target.value)} className="text-sm text-foreground" placeholder="A short tagline" />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => savePortfolio.mutate({ title, tagline }, { onSuccess: () => setEditHead(false) })}><Check className="h-4 w-4 mr-1" /> Save</Button>
                <Button size="sm" variant="secondary" onClick={() => setEditHead(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-3xl sm:text-4xl font-serif font-bold drop-shadow-sm">{portfolio.title}</h1>
              {portfolio.tagline && <p className="mt-1 text-sm sm:text-base opacity-90 drop-shadow-sm">{portfolio.tagline}</p>}
            </>
          )}
        </div>
        {!editHead && (
          <div className="absolute top-3 right-3 flex gap-2">
            <button onClick={() => setEditHead(true)} className="flex items-center gap-1 rounded-md bg-black/45 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/60"><Pencil className="h-3.5 w-3.5" /> Edit</button>
            <button onClick={() => coverInput.current?.click()} disabled={coverBusy} className="flex items-center gap-1 rounded-md bg-black/45 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/60"><ImageIcon className="h-3.5 w-3.5" /> {coverBusy ? 'Uploading…' : 'Cover'}</button>
          </div>
        )}
        <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={(e) => onCover(e.target.files?.[0])} />
      </div>

      {/* Template + generate */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mr-1">Template</span>
        {Object.entries(TEMPLATES).map(([key, t]) => (
          <button key={key} onClick={() => savePortfolio.mutate({ template: key })}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium', portfolio.template === key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/60')}>{t.name}</button>
        ))}
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" disabled={genBusy} onClick={generate}>
          {genBusy ? 'Writing…' : 'Generate intro from my work'}
        </Button>
      </div>

      {/* About */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-serif font-bold text-lg flex items-center gap-2"><span className="h-4 w-1 rounded-full bg-primary" /> About me</h2>
          {!aboutEditing && <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => { setAboutDraft(portfolio.aboutHtml ?? ''); setAboutEditing(true); }}><Pencil className="h-3.5 w-3.5" /> Edit</Button>}
        </div>
        {aboutEditing ? (
          <div className="space-y-2">
            <RichTextEditor value={aboutDraft} onChange={setAboutDraft} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAboutEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={() => savePortfolio.mutate({ aboutHtml: aboutDraft }, { onSuccess: () => setAboutEditing(false) })}>Save</Button>
            </div>
          </div>
        ) : portfolio.aboutHtml ? (
          <div className="prose prose-sm max-w-none text-foreground/85 leading-relaxed" dangerouslySetInnerHTML={{ __html: portfolio.aboutHtml }} />
        ) : (
          <p className="text-sm text-muted-foreground">Tell people who you are and what you're working towards — or click "Generate intro from my work".</p>
        )}
      </section>

      {/* Grounding rubric */}
      <details className="rounded-2xl border border-border bg-card p-5 group">
        <summary className="flex items-center gap-2 cursor-pointer list-none font-serif font-bold text-lg"><span className="h-4 w-1 rounded-full bg-primary" /> What makes a strong portfolio <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">show</span></summary>
        <p className="text-sm text-muted-foreground mt-2 mb-3">Build toward these — they hold across every course.</p>
        <div className="divide-y divide-border/60">
          {PORTFOLIO_RUBRIC.map((c, i) => (
            <div key={i} className="py-2.5">
              <p className="text-sm font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.descriptor}</p>
            </div>
          ))}
        </div>
      </details>

      {/* Add toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold mr-1">My work</span>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={uploadBusy} onClick={() => imgInput.current?.click()}><ImageIcon className="h-3.5 w-3.5" /> Image</Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={uploadBusy} onClick={() => fileInput.current?.click()}><Presentation className="h-3.5 w-3.5" /> Presentation / file</Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setAddLink(true); setAddNote(false); }}><Link2 className="h-3.5 w-3.5" /> Link</Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setAddNote(true); setAddLink(false); }}><StickyNote className="h-3.5 w-3.5" /> Note</Button>
        {uploadBusy && <span className="text-xs text-muted-foreground">Uploading…</span>}
        <input ref={imgInput} type="file" accept="image/*" className="hidden" onChange={(e) => onAddFile(e.target.files?.[0], true)} />
        <input ref={fileInput} type="file" accept=".pdf,.ppt,.pptx,.key,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => onAddFile(e.target.files?.[0], false)} />
      </div>
      {err && <p className="text-xs text-rose-600">{err}</p>}

      {addLink && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <Input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Link title (e.g. My published article)" />
          <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setAddLink(false); setLinkUrl(''); setLinkTitle(''); }}>Cancel</Button>
            <Button size="sm" disabled={!linkUrl.trim()} onClick={() => addItem.mutate({ kind: 'link', title: linkTitle.trim() || linkUrl.trim(), linkUrl: linkUrl.trim() }, { onSuccess: () => { setAddLink(false); setLinkUrl(''); setLinkTitle(''); } })}>Add link</Button>
          </div>
        </div>
      )}
      {addNote && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <Input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Note title" />
          <RichTextEditor value={noteHtml} onChange={setNoteHtml} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setAddNote(false); setNoteTitle(''); setNoteHtml(''); }}>Cancel</Button>
            <Button size="sm" disabled={!noteTitle.trim() && !noteHtml.trim()} onClick={() => addItem.mutate({ kind: 'note', title: noteTitle.trim() || 'Note', descriptionHtml: noteHtml }, { onSuccess: () => { setAddNote(false); setNoteTitle(''); setNoteHtml(''); } })}>Add note</Button>
          </div>
        </div>
      )}

      {/* Items — masonry via CSS columns */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nothing here yet. Add images, presentations, links and notes — they'll carry with you across every course.
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid">
          {items.map((it) => <ItemCard key={it.id} it={it} onDelete={() => delItem.mutate(it.id)} onSave={(body) => patchItem.mutate({ id: it.id, body })} />)}
        </div>
      )}
    </div>
  );
}

function ItemCard({ it, onDelete, onSave }: { it: ItemT; onDelete: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(it.title ?? '');
  const [desc, setDesc] = useState(it.descriptionHtml ?? '');
  const kindIcon = it.kind === 'image' ? ImageIcon : it.kind === 'link' ? Link2 : it.kind === 'note' ? StickyNote : (isPresentation(it.fileUrl) || isPresentation(it.title) ? Presentation : FileText);
  const Icon = kindIcon;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      {it.kind === 'image' && it.thumbnailUrl && (
        <a href={it.fileUrl ?? '#'} target="_blank" rel="noreferrer"><img src={it.thumbnailUrl} alt={it.title ?? ''} className="w-full object-cover" loading="lazy" /></a>
      )}
      <div className="p-4 space-y-2">
        {editing ? (
          <div className="space-y-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            {(it.kind === 'note' || it.kind === 'image' || it.kind === 'file') && <RichTextEditor value={desc} onChange={setDesc} />}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={() => { onSave({ title, descriptionHtml: desc }); setEditing(false); }}>Save</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm leading-snug">{it.title || (it.kind === 'link' ? it.linkUrl : 'Untitled')}</p>
                {it.kind === 'link' && it.linkUrl && <a href={it.linkUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline break-all">{it.linkUrl}</a>}
              </div>
            </div>
            {it.descriptionHtml && <div className="prose prose-sm max-w-none text-muted-foreground text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: it.descriptionHtml }} />}
            <div className="flex items-center gap-2 pt-1">
              {(it.kind === 'file' || it.kind === 'image') && it.fileUrl && (
                <a href={it.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" /> Open</a>
              )}
              <button onClick={() => { setTitle(it.title ?? ''); setDesc(it.descriptionHtml ?? ''); setEditing(true); }} className="ml-auto text-muted-foreground hover:text-foreground" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => { if (window.confirm('Remove this from your portfolio?')) onDelete(); }} className="text-muted-foreground hover:text-rose-600" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
