import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Link2, Eraser, Target, Circle, Square, Star, ChevronRight, Check,
} from 'lucide-react';

// Shared palette + bullet shapes for overview styling controls.
export const STYLE_COLORS = ['#111827', '#f97316', '#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];
export const HEADING_SIZES: { key: string; label: string; cls: string }[] = [
  { key: 'sm', label: 'S', cls: 'text-base' },
  { key: 'md', label: 'M', cls: 'text-lg' },
  { key: 'lg', label: 'L', cls: 'text-2xl' },
  { key: 'xl', label: 'XL', cls: 'text-3xl' },
];
export const headingSizeCls = (k?: string) => HEADING_SIZES.find((s) => s.key === k)?.cls ?? 'text-lg';
export const BULLET_SHAPES = ['target', 'dot', 'check', 'square', 'star', 'arrow'] as const;
type BulletShape = typeof BULLET_SHAPES[number];

export function BulletIcon({ shape, color, className }: { shape?: string; color?: string; className?: string }) {
  const cls = cn('h-3 w-3 shrink-0', className);
  const style = { color: color || '#f97316' };
  switch (shape as BulletShape) {
    case 'dot': return <Circle className={cls} style={style} fill="currentColor" strokeWidth={0} />;
    case 'check': return <Check className={cls} style={style} strokeWidth={3} />;
    case 'square': return <Square className={cls} style={style} fill="currentColor" strokeWidth={0} />;
    case 'star': return <Star className={cls} style={style} fill="currentColor" strokeWidth={0} />;
    case 'arrow': return <ChevronRight className={cls} style={style} strokeWidth={3} />;
    default: return <Target className={cls} style={style} strokeWidth={2.5} />;
  }
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
export const stripHtml = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// Turn objectives HTML from the rich editor into per-item HTML strings, and into plain text.
export function objectivesHtmlToItems(html: string): string[] {
  const li = [...(html || '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1].trim());
  if (li.length) return li.filter(Boolean);
  return (html || '')
    .split(/<br\s*\/?>|<\/p>|<\/div>|\n/i)
    .map((s) => s.replace(/<\/?(p|div|ul|ol)[^>]*>/gi, '').trim())
    .filter(Boolean);
}
export function itemsToPlain(items: string[]): string[] {
  return items.map((h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** Lightweight rich-text editor with a formatting toolbar. Stores HTML. No extra deps. */
export function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.innerHTML = value || ''; /* eslint-disable-next-line */ }, []);
  const sync = () => onChange(ref.current?.innerHTML ?? '');
  const exec = (cmd: string, arg?: string) => { ref.current?.focus(); document.execCommand(cmd, false, arg); sync(); };
  const Btn = ({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) => (
    <button type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className="h-7 min-w-7 px-1.5 rounded hover:bg-muted text-sm text-foreground inline-flex items-center justify-center">{children}</button>
  );
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 p-1">
        <select title="Text style" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => { exec('formatBlock', e.target.value); e.target.value = ''; }}
          className="h-7 rounded border border-input bg-background px-1 text-xs">
          <option value="">Style</option><option value="H2">Heading</option><option value="H3">Subheading</option><option value="P">Paragraph</option>
        </select>
        <select title="Font" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => { exec('fontName', e.target.value); e.target.value = ''; }}
          className="h-7 rounded border border-input bg-background px-1 text-xs">
          <option value="">Font</option><option value="Georgia, serif">Serif</option><option value="Inter, system-ui, sans-serif">Sans</option><option value="ui-monospace, monospace">Mono</option>
        </select>
        <select title="Font size" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => { exec('fontSize', e.target.value); e.target.value = ''; }}
          className="h-7 rounded border border-input bg-background px-1 text-xs">
          <option value="">Size</option><option value="1">XS</option><option value="2">Small</option><option value="3">Normal</option><option value="4">Medium</option><option value="5">Large</option><option value="6">X-Large</option><option value="7">XX-Large</option>
        </select>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <Btn title="Bold" onClick={() => exec('bold')}><Bold className="h-4 w-4" /></Btn>
        <Btn title="Italic" onClick={() => exec('italic')}><Italic className="h-4 w-4" /></Btn>
        <Btn title="Underline" onClick={() => exec('underline')}><Underline className="h-4 w-4" /></Btn>
        <Btn title="Strikethrough" onClick={() => exec('strikeThrough')}><Strikethrough className="h-4 w-4" /></Btn>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <Btn title="Align left" onClick={() => exec('justifyLeft')}><AlignLeft className="h-4 w-4" /></Btn>
        <Btn title="Align centre" onClick={() => exec('justifyCenter')}><AlignCenter className="h-4 w-4" /></Btn>
        <Btn title="Align right" onClick={() => exec('justifyRight')}><AlignRight className="h-4 w-4" /></Btn>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <Btn title="Bulleted list" onClick={() => exec('insertUnorderedList')}><List className="h-4 w-4" /></Btn>
        <Btn title="Numbered list" onClick={() => exec('insertOrderedList')}><ListOrdered className="h-4 w-4" /></Btn>
        <Btn title="Link" onClick={() => { const u = window.prompt('Link URL'); if (u) exec('createLink', u); }}><Link2 className="h-4 w-4" /></Btn>
        <Btn title="Clear formatting" onClick={() => exec('removeFormat')}><Eraser className="h-4 w-4" /></Btn>
        <span className="mx-0.5 h-5 w-px bg-border" />
        {STYLE_COLORS.map((c) => (
          <button key={c} type="button" title="Text colour" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('foreColor', c)}
            className="h-5 w-5 rounded-full border border-border" style={{ backgroundColor: c }} />
        ))}
        <input type="color" title="Custom colour" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => exec('foreColor', e.target.value)} className="h-6 w-6 rounded border border-border bg-transparent p-0" />
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning onInput={sync}
        className="prose prose-sm max-w-none min-h-[9rem] p-3 focus:outline-none [&_h2]:font-serif [&_h3]:font-serif" />
    </div>
  );
}

export function HeadingStyleBar({ style, onChange }: { style: { color?: string; size?: string }; onChange: (s: { color?: string; size?: string }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">Heading colour</span>
      {STYLE_COLORS.map((c) => (
        <button key={c} type="button" title={c} onClick={() => onChange({ ...style, color: c })}
          className={cn('h-4 w-4 rounded-full border border-border', style.color === c && 'ring-2 ring-primary ring-offset-1')} style={{ backgroundColor: c }} />
      ))}
      <span className="ml-2 text-[11px] font-medium text-muted-foreground">Size</span>
      {HEADING_SIZES.map((s) => (
        <button key={s.key} type="button" onClick={() => onChange({ ...style, size: s.key })}
          className={cn('h-6 px-1.5 rounded border text-xs', style.size === s.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground')}>{s.label}</button>
      ))}
    </div>
  );
}

export function BulletStyleBar({ bullet, onChange }: { bullet: { shape?: string; color?: string }; onChange: (b: { shape?: string; color?: string }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">Bullet</span>
      {BULLET_SHAPES.map((sh) => (
        <button key={sh} type="button" title={sh} onClick={() => onChange({ ...bullet, shape: sh })}
          className={cn('h-7 w-7 rounded border flex items-center justify-center', bullet.shape === sh ? 'border-primary bg-primary/10' : 'border-border')}>
          <BulletIcon shape={sh} color={bullet.color} />
        </button>
      ))}
      <span className="ml-2 text-[11px] font-medium text-muted-foreground">Colour</span>
      {STYLE_COLORS.map((c) => (
        <button key={c} type="button" title={c} onClick={() => onChange({ ...bullet, color: c })}
          className={cn('h-4 w-4 rounded-full border border-border', bullet.color === c && 'ring-2 ring-primary ring-offset-1')} style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}
