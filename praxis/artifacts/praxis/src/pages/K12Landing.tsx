import { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import { K12_PERSONAS } from '@/lib/k12Personas';

/**
 * Public K-12 demo landing for praxis.synops-consulting.com/k12.
 * Bright and playful, with a card per learner persona (grades 3–11) — each showing a real learning
 * challenge and the accommodations that help, then a one-click entry into the live product as that
 * student. This is the "inclusive, adaptive, across grades" story. No sign-up.
 */
const INDIGO = '#4F46E5';
const AMBER = '#B45309';
const INK = '#20242E';

export default function K12Landing() {
  const { demoSignIn } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enter = async (key: string, lang?: string) => {
    setError(null);
    setBusy(key);
    try {
      // Set the UI language for this persona (Spanish for the Spanish-speaking learner, English otherwise).
      try { window.localStorage.setItem('praxis_language', lang || 'en'); } catch { /* ok */ }
      await demoSignIn('student', 'synops-k12', key);
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the demo. Please try again.');
      setBusy(null);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#FFFDF8 0%,#FBF6FF 55%,#F4FBFF 100%)', color: INK }} className="flex flex-col">
      <div style={{ height: 6, background: 'linear-gradient(90deg,#2563EB,#7C3AED,#0D9488,#D97706,#111827)' }} />

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-9 md:py-14">
        {/* Brand row */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl flex items-center justify-center font-bold text-white shadow-sm" style={{ background: `linear-gradient(135deg,${INDIGO},#7C3AED)` }}>S</span>
            <span className="text-[15px] font-semibold">Synops <span style={{ color: '#9b96a8' }}>Academy</span></span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full" style={{ background: '#FBEEDC', color: AMBER, border: '1px solid #f2ddbf' }}>
            <Sparkles className="h-3 w-3" /> Live demo, no sign-up
          </span>
        </div>

        {/* Hero */}
        <div className="max-w-2xl">
          <h1 className="text-[30px] md:text-[38px] font-bold leading-[1.1] tracking-tight" style={{ color: INK }}>
            One platform that adapts to{' '}
            <span style={{ background: `linear-gradient(90deg,${INDIGO},#7C3AED,${AMBER})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>every kind of learner</span>.
          </h1>
          <p className="mt-4 text-[15px] md:text-base leading-relaxed" style={{ color: '#5a5766' }}>
            Meet six students from Grade 3 to Grade 11 — each with a different learning style or
            challenge, and the accommodations that help them thrive. Step into any of their days.
            Real lessons, aligned to US standards. No sign-up.
          </p>
        </div>

        {/* Persona grid */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {K12_PERSONAS.map((p) => (
            <div key={p.key} className="rounded-2xl bg-white p-5 flex flex-col shadow-sm" style={{ border: '1px solid #ece7f2' }}>
              <div className="flex items-center gap-3">
                <span className="h-11 w-11 rounded-full flex items-center justify-center text-base font-bold text-white shadow-sm" style={{ background: p.avatarBg }}>{p.first[0]}</span>
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] leading-tight">{p.name}</div>
                  <div className="text-[12px]" style={{ color: p.accent }}>{p.gradeLabel} · {p.subjectEmoji} {p.subject}</div>
                </div>
              </div>

              <span className="mt-3 self-start inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ background: `${p.accent}14`, color: p.accent }}>
                {p.challenge}
              </span>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: '#4a4756' }}>{p.challengeLong}</p>

              <div className="mt-3 rounded-xl px-3 py-2.5 text-[12px] leading-snug flex-1" style={{ background: '#f7f5fb', color: '#3d3a48' }}>
                <span className="font-semibold" style={{ color: p.accent }}>What&rsquo;s turned on: </span>{p.supports}
              </div>

              <button
                onClick={() => enter(p.key, p.defaultLang)}
                disabled={busy !== null}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                style={{ background: p.accent }}
              >
                {busy === p.key ? 'Starting…' : `Enter as ${p.first}`}
                {busy !== p.key && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
        {error && <p className="mt-3 text-sm" style={{ color: '#b42318' }}>{error}</p>}

        {/* Feature strip */}
        <div className="mt-7 flex flex-wrap gap-2">
          {['Adapts by grade level', 'Built-in accommodations', 'AI tutor', 'Gamified for engagement', 'English + Español', 'Common Core · NGSS · C3'].map((t) => (
            <span key={t} className="text-[11px] px-3 py-1.5 rounded-full bg-white/70" style={{ color: '#5a5766', border: '1px solid #eae6f0' }}>{t}</span>
          ))}
        </div>

        <div className="mt-8 pt-4 flex items-center gap-1.5 text-[11px]" style={{ borderTop: '1px solid #ece7f2', color: '#9b96a8' }}>
          <Sparkles className="h-3 w-3" style={{ color: AMBER }} />
          Synops Academy · Confidential demo · <a href="https://synops-consulting.com" style={{ color: INDIGO }}>synops-consulting.com</a>
          <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </div>
  );
}
