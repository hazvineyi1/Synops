import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGetMe } from '@workspace/api-client-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  NotebookPen, StickyNote, Pencil, Eraser, Trash2, Plus, X, Check,
  ListTodo, Bell, CalendarRange, Palette, Undo2,
} from 'lucide-react';

/**
 * The Student Jotter — the learner's own space.
 *
 * A single scratch surface for the things students actually do around studying: sticky
 * notes they can drag anywhere, free-hand sketching/diagrams, a to-do list, reminders, and
 * a weekly study planner. It is deliberately theirs: no coach, no grade, no one else sees
 * it. They can even change the paper colour.
 *
 * Persistence is per-user localStorage. That means it lives on this browser (a genuine
 * limitation — noted for a future backend-synced version), but it needs no schema, no
 * migration, and survives refreshes and restarts, which is what a personal scratchpad needs
 * on day one. Everything is keyed by the signed-in user's id so two people on one machine
 * never see each other's board.
 */

type Note = { id: string; x: number; y: number; text: string; color: string };
type Todo = { id: string; text: string; done: boolean };
type Reminder = { id: string; text: string; when: string };
type JotterState = {
  notes: Note[];
  todos: Todo[];
  reminders: Reminder[];
  planner: Record<string, string>;
  paper: string;
  drawing: string | null; // canvas dataURL
};

const NOTE_COLORS = ['#FEF08A', '#BFDBFE', '#BBF7D0', '#FBCFE8', '#FED7AA', '#E9D5FF'];
const PAPERS: { key: string; label: string; bg: string; dot: string }[] = [
  { key: 'cream', label: 'Cream', bg: '#FBF7EF', dot: 'rgba(0,0,0,0.06)' },
  { key: 'white', label: 'White', bg: '#FFFFFF', dot: 'rgba(0,0,0,0.05)' },
  { key: 'mint', label: 'Mint', bg: '#F0FBF4', dot: 'rgba(6,95,70,0.07)' },
  { key: 'sky', label: 'Sky', bg: '#F0F7FF', dot: 'rgba(30,64,175,0.07)' },
  { key: 'rose', label: 'Rose', bg: '#FFF5F7', dot: 'rgba(159,18,57,0.07)' },
  { key: 'slate', label: 'Slate', bg: '#1E293B', dot: 'rgba(255,255,255,0.08)' },
];
const PEN_COLORS = ['#1F2937', '#DC2626', '#2563EB', '#059669', '#D97706', '#7C3AED'];
const PLANNER_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const uid = () => Math.random().toString(36).slice(2, 10);
const EMPTY: JotterState = { notes: [], todos: [], reminders: [], planner: {}, paper: 'cream', drawing: null };

export function Jotter() {
  const { data: me } = useGetMe();
  const storeKey = me?.id ? `jotter:${me.id}` : null;

  const [state, setState] = useState<JotterState>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  // Load once we know who the user is.
  useEffect(() => {
    if (!storeKey) return;
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) setState({ ...EMPTY, ...JSON.parse(raw) });
    } catch { /* corrupt store -> start fresh */ }
    setLoaded(true);
  }, [storeKey]);

  // Persist on every change (once loaded, so we never overwrite saved data with EMPTY).
  useEffect(() => {
    if (!storeKey || !loaded) return;
    try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch { /* quota */ }
  }, [state, storeKey, loaded]);

  const patch = (p: Partial<JotterState>) => setState((s) => ({ ...s, ...p }));
  const paper = PAPERS.find((p) => p.key === state.paper) ?? PAPERS[0];

  // ── Drawing ───────────────────────────────────────────────────────────────
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [pen, setPen] = useState(PEN_COLORS[0]);
  const [erasing, setErasing] = useState(false);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Size the canvas to the board and (re)load the saved drawing.
  useEffect(() => {
    const cv = canvasRef.current, board = boardRef.current;
    if (!cv || !board || !loaded) return;
    const resize = () => {
      const { width, height } = board.getBoundingClientRect();
      // Preserve current bitmap across a resize.
      const prev = cv.toDataURL();
      cv.width = Math.max(1, Math.floor(width));
      cv.height = Math.max(1, Math.floor(height));
      const ctx = cv.getContext('2d');
      if (ctx && (state.drawing || prev)) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, cv.width, cv.height);
        img.src = state.drawing || prev;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(board);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const canvasPoint = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const startDraw = (e: React.PointerEvent) => {
    if (!drawMode) return;
    drawing.current = true;
    last.current = canvasPoint(e);
  };
  const moveDraw = (e: React.PointerEvent) => {
    if (!drawMode || !drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = canvasPoint(e);
    ctx.strokeStyle = erasing ? paper.bg : pen;
    ctx.lineWidth = erasing ? 22 : 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const endDraw = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    patch({ drawing: canvasRef.current!.toDataURL() });
  };
  const clearDrawing = () => {
    const cv = canvasRef.current;
    if (cv) cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height);
    patch({ drawing: null });
  };

  // ── Notes ─────────────────────────────────────────────────────────────────
  const addNote = () => {
    const color = NOTE_COLORS[state.notes.length % NOTE_COLORS.length];
    patch({ notes: [...state.notes, { id: uid(), x: 24 + (state.notes.length % 5) * 18, y: 24 + (state.notes.length % 5) * 18, text: '', color }] });
  };
  const updateNote = (id: string, p: Partial<Note>) =>
    patch({ notes: state.notes.map((n) => (n.id === id ? { ...n, ...p } : n)) });
  const removeNote = (id: string) => patch({ notes: state.notes.filter((n) => n.id !== id) });

  const dragNote = (id: string, e: React.PointerEvent) => {
    if (drawMode) return;
    const note = state.notes.find((n) => n.id === id);
    const board = boardRef.current;
    if (!note || !board) return;
    const startX = e.clientX, startY = e.clientY, ox = note.x, oy = note.y;
    const rect = board.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const nx = Math.max(0, Math.min(rect.width - 60, ox + (ev.clientX - startX)));
      const ny = Math.max(0, Math.min(rect.height - 40, oy + (ev.clientY - startY)));
      setState((s) => ({ ...s, notes: s.notes.map((n) => (n.id === id ? { ...n, x: nx, y: ny } : n)) }));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ── To-dos ────────────────────────────────────────────────────────────────
  const [todoText, setTodoText] = useState('');
  const addTodo = () => {
    const t = todoText.trim();
    if (!t) return;
    patch({ todos: [...state.todos, { id: uid(), text: t, done: false }] });
    setTodoText('');
  };
  const toggleTodo = (id: string) => patch({ todos: state.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) });
  const removeTodo = (id: string) => patch({ todos: state.todos.filter((t) => t.id !== id) });

  // ── Reminders ─────────────────────────────────────────────────────────────
  const [remText, setRemText] = useState('');
  const [remWhen, setRemWhen] = useState('');
  const addReminder = () => {
    const t = remText.trim();
    if (!t) return;
    patch({ reminders: [...state.reminders, { id: uid(), text: t, when: remWhen }] });
    setRemText(''); setRemWhen('');
  };
  const removeReminder = (id: string) => patch({ reminders: state.reminders.filter((r) => r.id !== id) });
  const sortedReminders = useMemo(
    () => [...state.reminders].sort((a, b) => (a.when || '9999').localeCompare(b.when || '9999')),
    [state.reminders],
  );

  const dark = paper.key === 'slate';

  return (
    <div className="space-y-5">
      <PageHeader title="My Jotter" icon={NotebookPen} subtitle="Your own space — sticky notes, sketches, to-dos, reminders and a study plan. Only you can see this." />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
        <Button size="sm" variant="outline" onClick={addNote} className="gap-1.5"><StickyNote className="h-4 w-4" /> Note</Button>
        <Button size="sm" variant={drawMode ? 'default' : 'outline'} onClick={() => setDrawMode((v) => !v)} className="gap-1.5">
          <Pencil className="h-4 w-4" /> {drawMode ? 'Drawing on' : 'Draw'}
        </Button>
        {drawMode && (
          <>
            <div className="flex items-center gap-1 pl-1">
              {PEN_COLORS.map((c) => (
                <button key={c} onClick={() => { setPen(c); setErasing(false); }} title="Pen colour"
                  className={cn('h-5 w-5 rounded-full border-2', pen === c && !erasing ? 'border-foreground' : 'border-transparent')}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <Button size="sm" variant={erasing ? 'default' : 'outline'} onClick={() => setErasing((v) => !v)} className="gap-1.5"><Eraser className="h-4 w-4" /> Eraser</Button>
            <Button size="sm" variant="ghost" onClick={clearDrawing} className="gap-1.5 text-muted-foreground"><Undo2 className="h-4 w-4" /> Clear ink</Button>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-1">
            {PAPERS.map((p) => (
              <button key={p.key} onClick={() => patch({ paper: p.key })} title={p.label}
                className={cn('h-6 w-6 rounded-md border-2', state.paper === p.key ? 'border-primary' : 'border-border')}
                style={{ backgroundColor: p.bg }} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        {/* Board */}
        <div
          ref={boardRef}
          className="relative h-[560px] overflow-hidden rounded-2xl border border-border shadow-inner"
          style={{ backgroundColor: paper.bg, backgroundImage: `radial-gradient(${paper.dot} 1px, transparent 1px)`, backgroundSize: '18px 18px' }}
        >
          {/* Drawing layer — captures pointer only in draw mode so notes stay draggable otherwise */}
          <canvas
            ref={canvasRef}
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
            className={cn('absolute inset-0 z-10', drawMode ? (erasing ? 'cursor-cell' : 'cursor-crosshair') : 'pointer-events-none')}
          />
          {/* Notes */}
          {state.notes.map((n) => (
            <div
              key={n.id}
              className="group absolute z-20 w-44 rounded-md p-2 shadow-md transition-shadow hover:shadow-lg animate-in fade-in zoom-in-95"
              style={{ left: n.x, top: n.y, backgroundColor: n.color, transform: 'rotate(-1deg)' }}
            >
              <div
                onPointerDown={(e) => dragNote(n.id, e)}
                className={cn('mb-1 flex items-center justify-between', drawMode ? 'cursor-default' : 'cursor-grab active:cursor-grabbing')}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-black/40">Note</span>
                <button onClick={() => removeNote(n.id)} className="text-black/30 opacity-0 transition-opacity hover:text-black/70 group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
              </div>
              <textarea
                value={n.text}
                onChange={(e) => updateNote(n.id, { text: e.target.value })}
                placeholder="Write something…"
                className="h-24 w-full resize-none bg-transparent text-sm text-black/80 placeholder:text-black/30 focus:outline-none"
              />
              <div className="flex items-center gap-1 pt-1">
                {NOTE_COLORS.map((c) => (
                  <button key={c} onClick={() => updateNote(n.id, { color: c })} className={cn('h-3.5 w-3.5 rounded-full border', n.color === c ? 'border-black/50' : 'border-black/10')} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          ))}
          {state.notes.length === 0 && !state.drawing && (
            <div className={cn('pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm', dark ? 'text-white/50' : 'text-black/30')}>
              <StickyNote className="h-6 w-6" />
              <p>Add a note or start drawing — this space is yours.</p>
            </div>
          )}
        </div>

        {/* Right rail: to-dos + reminders */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 font-serif font-semibold"><ListTodo className="h-4 w-4 text-primary" /> To-do</div>
            <div className="mb-2 flex gap-1.5">
              <input value={todoText} onChange={(e) => setTodoText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                placeholder="Add a task…" className="h-9 flex-1 rounded-md border border-input bg-background px-2.5 text-sm" />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={addTodo}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-1">
              {state.todos.length === 0 && <p className="text-xs text-muted-foreground">Nothing yet.</p>}
              {state.todos.map((t) => (
                <div key={t.id} className="group flex items-center gap-2 text-sm">
                  <button onClick={() => toggleTodo(t.id)} className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', t.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40')}>
                    {t.done && <Check className="h-3 w-3" />}
                  </button>
                  <span className={cn('flex-1', t.done && 'text-muted-foreground line-through')}>{t.text}</span>
                  <button onClick={() => removeTodo(t.id)} className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 font-serif font-semibold"><Bell className="h-4 w-4 text-primary" /> Reminders</div>
            <div className="mb-2 space-y-1.5">
              <input value={remText} onChange={(e) => setRemText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addReminder()}
                placeholder="Remind me to…" className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm" />
              <div className="flex gap-1.5">
                <input type="date" value={remWhen} onChange={(e) => setRemWhen(e.target.value)} className="h-9 flex-1 rounded-md border border-input bg-background px-2.5 text-sm" />
                <Button size="icon" className="h-9 w-9 shrink-0" onClick={addReminder}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-1.5">
              {sortedReminders.length === 0 && <p className="text-xs text-muted-foreground">No reminders set.</p>}
              {sortedReminders.map((r) => (
                <div key={r.id} className="group flex items-start gap-2 text-sm">
                  <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{r.text}</div>
                    {r.when && <div className="text-xs text-muted-foreground">{new Date(r.when + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>}
                  </div>
                  <button onClick={() => removeReminder(r.id)} className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Study planner */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 font-serif font-semibold"><CalendarRange className="h-4 w-4 text-primary" /> Weekly study plan</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-24 border border-border bg-muted/40 p-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Slot</th>
                {PLANNER_DAYS.map((d) => (
                  <th key={d} className="border border-border bg-muted/40 p-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['Morning', 'Afternoon', 'Evening'].map((slot) => (
                <tr key={slot}>
                  <td className="border border-border bg-muted/20 p-2 text-xs font-medium text-muted-foreground">{slot}</td>
                  {PLANNER_DAYS.map((d) => {
                    const key = `${slot}:${d}`;
                    return (
                      <td key={d} className="border border-border p-0 align-top">
                        <textarea
                          value={state.planner[key] ?? ''}
                          onChange={(e) => patch({ planner: { ...state.planner, [key]: e.target.value } })}
                          placeholder="—"
                          className="h-16 w-full resize-none bg-transparent p-2 text-xs leading-snug placeholder:text-muted-foreground/40 focus:bg-primary/5 focus:outline-none"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
