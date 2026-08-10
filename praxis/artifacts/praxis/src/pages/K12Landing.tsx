import { useState, useEffect } from 'react';
import { ArrowRight, Sparkles, Award, CheckCircle2, ChevronDown } from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import { K12_PERSONAS } from '@/lib/k12Personas';

interface Commendation { code: string; title: string; framework: string; coverageLevel: 'Assessed' | 'Practised'; masteryPct: number | null; learnersAssessed: number; howMet: string }
interface SubjectCommendations { courseTitle: string; subject: string; gradeLabel: string; framework: string; standardsMet: number; assessedCount: number; overallMasteryPct: number | null; standards: Commendation[] }
interface CommendationsReport { academy: string; totals: { subjects: number; standards: number; assessed: number; overallMasteryPct: number | null }; frameworks: string[]; subjects: SubjectCommendations[] }

/**
 * Public K-12 demo landing for praxis.synops-consulting.com/k12.
 * Bright and playful, with a card per learner persona (grades 3 to 11), each showing a real learning
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
  const [comm, setComm] = useState<CommendationsReport | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/k12/commendations')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setComm(d); })
      .catch(() => { /* section just stays hidden */ });
    return () => { alive = false; };
  }, []);

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
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full" style={{ background: '#FBEEDC', color: AMBER, border: '1px solid #f2ddbf' }}>
              <Sparkles className="h-3 w-3" /> Live demo, no sign-up
            </span>
            <a href="/sign-in" className="inline-flex items-center rounded-lg px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm" style={{ background: INDIGO }}>Sign in</a>
          </div>
        </div>

        {/* Hero */}
        <div className="max-w-2xl">
          <h1 className="text-[30px] md:text-[38px] font-bold leading-[1.1] tracking-tight" style={{ color: INK }}>
            One platform that adapts to{' '}
            <span style={{ background: `linear-gradient(90deg,${INDIGO},#7C3AED,${AMBER})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>every kind of learner</span>.
          </h1>
          <p className="mt-4 text-[15px] md:text-base leading-relaxed" style={{ color: '#5a5766' }}>
            Meet seven students from Grade 1 to Grade 11, each with a different learning style or
            challenge, and the accommodations that help them thrive. Every student studies
            <span className="font-semibold" style={{ color: INK }}> two subjects</span>, fully built
            and gamified. Step into any of their days. Real lessons, aligned to US standards. No sign-up.
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
                className="relative z-10 mt-4 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
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
          {['Adapts by grade level', 'Built-in accommodations', 'Read-aloud on everything', 'Gamified for engagement', 'English + Español', 'Common Core · NGSS · C3'].map((t) => (
            <span key={t} className="text-[11px] px-3 py-1.5 rounded-full bg-white/70" style={{ color: '#5a5766', border: '1px solid #eae6f0' }}>{t}</span>
          ))}
        </div>

        {comm && comm.subjects.length > 0 && <CommendationsSection data={comm} />}

        <div className="mt-8 pt-4 flex items-center gap-1.5 text-[11px]" style={{ borderTop: '1px solid #ece7f2', color: '#9b96a8' }}>
          <Sparkles className="h-3 w-3" style={{ color: AMBER }} />
          Synops Academy · Confidential demo · <a href="https://synops-consulting.com" style={{ color: INDIGO }}>synops-consulting.com</a>
          <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </div>
  );
}

/**
 * "Commendations" section: the standards each class meets, with the mastery evidence behind them,
 * pulled live from /api/k12/commendations (which mirrors the internal accreditation engine).
 */
function CommendationsSection({ data }: { data: CommendationsReport }) {
  const stats: Array<[string, string | number]> = [
    ['Subjects', data.totals.subjects],
    ['Standards aligned', data.totals.standards],
    ['Assessed with evidence', data.totals.assessed],
  ];
  if (data.totals.overallMasteryPct != null) stats.push(['Avg mastery', `${data.totals.overallMasteryPct}%`]);

  return (
    <section className="mt-12">
      <details className="group">
      <summary className="flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <Award className="h-5 w-5" style={{ color: AMBER }} />
        <h2 className="text-[22px] md:text-[26px] font-bold tracking-tight" style={{ color: INK }}>Why Synops Academy earns its commendations</h2>
        <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" style={{ color: '#8a8797' }} />
      </summary>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed" style={{ color: '#5a5766' }}>
        A commendation is a standard the program can prove it meets. Every class below aligns to a real
        accreditation framework, and each standard is assessed by interactive quizzes, games, and the
        Math Coach, so alignment isn&rsquo;t a claim, it&rsquo;s evidence drawn from actual learner work.
      </p>

      <div className="mt-4 flex flex-wrap gap-2.5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl px-4 py-2.5 bg-white shadow-sm" style={{ border: '1px solid #ece7f2' }}>
            <div className="text-[20px] font-bold leading-none" style={{ color: INK }}>{value}</div>
            <div className="text-[11px] mt-1" style={{ color: '#8a8797' }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {data.frameworks.map((f) => (
          <span key={f} className="text-[11px] px-3 py-1.5 rounded-full" style={{ background: '#EEF2FF', color: INDIGO, border: '1px solid #e0e7ff' }}>{f}</span>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.subjects.map((s) => (
          <div key={s.courseTitle} className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: '1px solid #ece7f2' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-[15px] leading-tight" style={{ color: INK }}>{s.courseTitle}</div>
                <div className="text-[12px] mt-0.5" style={{ color: '#8a8797' }}>{s.gradeLabel} · {s.subject}</div>
              </div>
              {s.overallMasteryPct != null && (
                <span className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #d1fae5' }}>{s.overallMasteryPct}% mastery</span>
              )}
            </div>
            <div className="mt-1 text-[11px] font-medium" style={{ color: INDIGO }}>{s.framework}</div>
            <ul className="mt-3 space-y-2.5">
              {s.standards.map((st) => (
                <li key={st.code} className="rounded-xl px-3 py-2.5" style={{ background: '#f7f8fb' }}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: st.coverageLevel === 'Assessed' ? '#059669' : '#9b96a8' }} />
                    <span className="text-[12px] font-semibold" style={{ color: INK }}>{st.code}</span>
                    <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: st.coverageLevel === 'Assessed' ? '#ECFDF5' : '#f1eff5', color: st.coverageLevel === 'Assessed' ? '#047857' : '#7c7889' }}>{st.coverageLevel}</span>
                  </div>
                  <div className="mt-1 text-[12px] leading-snug" style={{ color: '#4a4756' }}>{st.title}</div>
                  <div className="mt-1 text-[11px] leading-snug" style={{ color: '#8a8797' }}>{st.howMet}</div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      </details>
    </section>
  );
}
