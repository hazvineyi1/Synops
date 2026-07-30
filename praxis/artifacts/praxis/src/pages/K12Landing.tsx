import { useState } from 'react';
import { GraduationCap, Heart, ArrowRight, Sparkles, Star } from 'lucide-react';
import { useSession } from '@/context/SessionContext';

/**
 * Public K-12 demo landing for praxis.synops-consulting.com/k12.
 * Bright, playful, Grade-6-appropriate — with real background for each of the two learners so a
 * visitor knows who they're stepping into. Two one-click entries into the live product:
 *   - "Enter as Maya" -> Maya (standard learner, two subjects already complete + badges)
 *   - "Enter with Leo's supports" -> Leo (accommodations profile + the visible support layer)
 * Both call /auth/demo-login with tenant "synops-k12". No sign-up, no forms.
 */
const INDIGO = '#4F46E5';
const AMBER = '#D97706';
const INK = '#1E2233';

const SUBJECTS = [
  { emoji: '➗', name: 'Math', c: '#2563EB', bg: '#E9F1FE' },
  { emoji: '📖', name: 'ELA', c: '#7C3AED', bg: '#F1EAFE' },
  { emoji: '🔬', name: 'Science', c: '#059669', bg: '#E4F6EF' },
  { emoji: '🌍', name: 'Social Studies', c: '#0D9488', bg: '#E1F5F2' },
  { emoji: '🏛️', name: 'History', c: '#D97706', bg: '#FCF0DC' },
];

const LEARNERS = [
  {
    role: 'student' as const,
    initial: 'M', name: 'Maya Chen', meta: 'Grade 6 · age 11',
    c: INDIGO, bg: '#EEF0FE', ring: '#D9DCFB',
    bio: "Loves science and doodling in the margins. A quick, confident reader who races ahead — she's already finished Math and English Language Arts and earned her first badges.",
    see: 'An on-track student: two completed subjects, badges earned, standards mastered, and an AI tutor lined up for what’s next.',
    cta: 'Enter as Maya', icon: GraduationCap,
  },
  {
    role: 'student_alt' as const,
    initial: 'L', name: 'Leo Rivera', meta: 'Grade 6 · age 12',
    c: AMBER, bg: '#FDF2E0', ring: '#F6E2C2',
    bio: 'Full of big ideas and great questions — and he learns differently. Reading on a page is hard and his focus comes in bursts. This is where the platform meets him.',
    see: 'The supports switched on and visible: read-aloud, easy-reading text, one idea at a time, extra time — and a tutor that quietly adapts.',
    cta: "Enter with Leo’s supports", icon: Heart,
  },
];

export default function K12Landing() {
  const { demoSignIn } = useSession();
  const [busy, setBusy] = useState<null | 'student' | 'student_alt'>(null);
  const [error, setError] = useState<string | null>(null);

  const enter = async (role: 'student' | 'student_alt') => {
    setError(null);
    setBusy(role);
    try {
      await demoSignIn(role, 'synops-k12');
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the demo. Please try again.');
      setBusy(null);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#FFFDF8 0%,#FBF6FF 55%,#F4FBFF 100%)', color: INK }} className="flex flex-col">
      {/* Colorful top ribbon */}
      <div style={{ height: 6, background: 'linear-gradient(90deg,#2563EB,#7C3AED,#059669,#0D9488,#D97706)' }} />

      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-9 md:py-14">
        {/* Brand row */}
        <div className="flex items-center justify-between mb-9">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl flex items-center justify-center font-bold text-white shadow-sm" style={{ background: `linear-gradient(135deg,${INDIGO},#7C3AED)` }}>S</span>
            <span className="text-[15px] font-semibold">Synops <span style={{ color: '#9b96a8' }}>Academy</span></span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full" style={{ background: '#FBEEDC', color: AMBER, border: '1px solid #f2ddbf' }}>
            <Sparkles className="h-3 w-3" /> Grade 6 · live demo, no sign-up
          </span>
        </div>

        {/* Hero */}
        <div className="max-w-2xl">
          <h1 className="text-[32px] md:text-[40px] font-bold leading-[1.1] tracking-tight" style={{ color: INK }}>
            A 6th-grade classroom<br />that&rsquo;s actually{' '}
            <span style={{ background: `linear-gradient(90deg,${INDIGO},#7C3AED,${AMBER})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>fun</span>.
          </h1>
          <p className="mt-4 text-[15px] md:text-base leading-relaxed" style={{ color: '#5a5766' }}>
            Real Grade 6 lessons across five subjects — with an AI tutor, quick quizzes, and badges to
            earn — all aligned to Common Core, NGSS, and the C3 Framework. Meet two students and step
            into their day. No sign-up.
          </p>

          {/* Colorful subject chips */}
          <div className="mt-5 flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <span key={s.name} className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full" style={{ background: s.bg, color: s.c, border: `1px solid ${s.c}22` }}>
                <span>{s.emoji}</span>{s.name}
              </span>
            ))}
          </div>
        </div>

        {/* Learner cards — with background + their own entry */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {LEARNERS.map((l) => {
            const Icon = l.icon;
            return (
              <div key={l.role} className="rounded-2xl bg-white p-5 flex flex-col shadow-sm" style={{ border: `1px solid ${l.ring}` }}>
                <div className="flex items-center gap-3">
                  <span className="h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-sm" style={{ background: l.c }}>{l.initial}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-[15px] leading-tight">{l.name}</div>
                    <div className="text-[12px]" style={{ color: l.c }}>{l.meta}</div>
                  </div>
                  <Star className="h-4 w-4 ml-auto" style={{ color: l.ring }} />
                </div>

                <p className="mt-3 text-[13px] leading-relaxed" style={{ color: '#4a4756' }}>{l.bio}</p>

                <div className="mt-3 rounded-xl px-3 py-2.5 text-[12.5px] leading-snug" style={{ background: l.bg, color: '#3d3a48' }}>
                  <span className="font-semibold" style={{ color: l.c }}>You&rsquo;ll see: </span>{l.see}
                </div>

                <button
                  onClick={() => enter(l.role)}
                  disabled={busy !== null}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                  style={{ background: l.c }}
                >
                  <Icon className="h-4 w-4" />
                  {busy === l.role ? 'Starting…' : l.cta}
                  {busy !== l.role && <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
            );
          })}
        </div>
        {error && <p className="mt-3 text-sm" style={{ color: '#b42318' }}>{error}</p>}

        {/* Feature strip */}
        <div className="mt-7 flex flex-wrap gap-2">
          {['AI tutor', 'Interactive quizzes', 'Earned badges', 'Common Core · NGSS · C3', 'Built-in accommodations'].map((t) => (
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
