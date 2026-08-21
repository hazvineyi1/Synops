import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useAdaptive, type Mode, type NextMove } from '@/lib/adaptive';

/**
 * Editorial primitives (shared design system). High-contrast, type-led, sharp. These are the building
 * blocks every revamped screen composes from, so the language stays consistent as it rolls out from the
 * Practice flagship across the rest of Praxis.
 */

export function Overline({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`ed-overline text-muted-foreground ${className}`}>{children}</div>;
}

export function Rule({ strong = false, className = '' }: { strong?: boolean; className?: string }) {
  return <hr className={`${strong ? 'ed-rule-strong' : 'ed-rule'} ${className}`} />;
}

export function EditorialCard({ children, hover = false, accent = false, className = '', onClick }: { children: React.ReactNode; hover?: boolean; accent?: boolean; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`ed-card ${hover ? 'ed-card-hover' : ''} ${accent ? 'ed-accentbar' : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function Meter({ value }: { value: number }) {
  return <div className="ed-meter" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>;
}

/** Living cycle ring: four Kolb arcs that fill as the practice moves round. Replaces the static strip. */
export function CycleRing({ e, r, n, t, size = 76 }: { e: boolean; r: boolean; n: boolean; t: boolean; size?: number }) {
  const lit = [e, r, n, t].filter(Boolean).length;
  const seg = (d: string, on: boolean, key: string) => (
    <path key={key} d={d} fill="none" strokeWidth={5} strokeLinecap="round"
      className={`transition-[stroke] duration-700 ${on ? 'stroke-primary' : 'stroke-muted-foreground/20'}`} />
  );
  return (
    <svg viewBox="0 0 72 72" width={size} height={size} className="shrink-0" role="img" aria-label={`${lit} of 4 cycle moves worked`}>
      {seg('M18.76 13.94 A28 28 0 0 1 53.24 13.94', e, 'e')}
      {seg('M58.06 18.76 A28 28 0 0 1 58.06 53.24', r, 'r')}
      {seg('M53.24 58.06 A28 28 0 0 1 18.76 58.06', n, 'n')}
      {seg('M13.94 53.24 A28 28 0 0 1 13.94 18.76', t, 't')}
      <text x="36" y="35" textAnchor="middle" className="fill-foreground ed-num" style={{ fontSize: 17 }}>{lit}</text>
      <text x="36" y="47" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 8.5, letterSpacing: '.14em' }}>OF 4</text>
    </svg>
  );
}

/** Adaptive interface control: choose the depth the product meets you at. */
export function ModeToggle() {
  const { mode, set } = useAdaptive();
  const opts: { key: Mode; label: string; hint: string }[] = [
    { key: 'guided', label: 'Guided', hint: 'Guided: more explanation and step-by-step help. Best when you are new.' },
    { key: 'pro', label: 'Pro', hint: 'Pro: a denser view with less hand-holding, once you know your way around.' },
  ];
  return (
    <div className="inline-flex items-center border border-foreground/15" role="group" aria-label="How much help you see">
      {opts.map((o) => (
        <button key={o.key} type="button" onClick={() => set(o.key)} aria-pressed={mode === o.key} title={o.hint}
          className={`ed-overline px-3 py-1.5 transition-colors ${mode === o.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The adaptive learning path made visible: one recommended next move, front and centre. */
export function NextMoveBanner({ move, onCta }: { move: NextMove; onCta: () => void }) {
  return (
    <EditorialCard accent className="p-6 sm:p-8">
      <Overline>{move.overline}</Overline>
      <h2 className="ed-h2 mt-2">{move.title}</h2>
      {move.momentum && <p className="text-sm font-medium text-primary mt-2">{move.momentum}</p>}
      <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{move.detail}</p>
      <button onClick={onCta} className="group mt-5 inline-flex items-center gap-2 ed-overline text-foreground ed-underline underline">
        {move.cta}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </button>
    </EditorialCard>
  );
}
