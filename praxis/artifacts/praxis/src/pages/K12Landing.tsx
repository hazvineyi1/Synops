import { useState } from 'react';
import { GraduationCap, Heart, Sparkles, ArrowRight, BookOpen } from 'lucide-react';
import { useSession } from '@/context/SessionContext';

/**
 * Public K-12 demo landing for praxis.synops-consulting.com/k12 - the link for the K-12 story.
 * Two one-click entry points into the live product as a Grade 6 learner:
 *   - "Enter as a 6th grader"  -> Maya (standard learner, two subjects already complete)
 *   - "Enter with accommodations" -> Leo (accommodations profile + the visible support layer)
 * Both call /auth/demo-login with tenant "synops-k12". No sign-up, no forms.
 */
const INDIGO = '#3730A3';
const AMBER = '#B45309';
const PAPER = '#FBF7EF';
const INK = '#20242E';

const SUBJECTS = [
  { emoji: '➗', name: 'Math' },
  { emoji: '📖', name: 'ELA' },
  { emoji: '🔬', name: 'Science' },
  { emoji: '🌍', name: 'Social Studies' },
  { emoji: '🏛️', name: 'History' },
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
    <div style={{ minHeight: '100dvh', background: PAPER, color: INK }} className="flex flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 md:py-16">

        {/* Brand row */}
        <div className="flex items-center justify-between mb-12 md:mb-16">
          <div className="flex items-center gap-2.5">
            <span className="h-8 w-8 rounded-lg flex items-center justify-center font-semibold text-white" style={{ background: INDIGO }}>S</span>
            <span className="text-[15px] font-medium">Synops <span style={{ color: '#8f8b83' }}>Academy</span></span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full" style={{ background: '#FBEEDC', color: AMBER, border: '1px solid #ecdcc2' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: AMBER }} /> Grade 6 · live demo, no sign-up
          </span>
        </div>

        {/* Hero */}
        <div className="max-w-xl">
          <h1 className="text-3xl md:text-[34px] font-medium leading-tight" style={{ color: INK }}>
            A 6th-grade classroom that actually holds their attention.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: '#55524b' }}>
            Real Grade 6 lessons across five subjects — with an AI tutor, quizzes, and badges to earn —
            all aligned to Common Core, NGSS, and the C3 Framework. Try it as a student, or as a student
            who learns with accommodations. No sign-up.
          </p>

          {/* Subject chips */}
          <div className="mt-5 flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <span key={s.name} className="text-[12px] px-3 py-1.5 rounded-full bg-white" style={{ color: '#46443c', border: '1px solid #e6e2da' }}>
                <span className="mr-1">{s.emoji}</span>{s.name}
              </span>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={() => enter('student')}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-[10px] px-5 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-60"
              style={{ background: INDIGO }}
            >
              <GraduationCap className="h-4 w-4" />
              {busy === 'student' ? 'Starting…' : 'Enter as a 6th grader'}
            </button>
            <button
              onClick={() => enter('student_alt')}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-[10px] px-5 py-3 text-sm font-medium bg-white transition-opacity disabled:opacity-60"
              style={{ color: AMBER, border: '1px solid #ead9c2' }}
            >
              <Heart className="h-4 w-4" />
              {busy === 'student_alt' ? 'Starting…' : 'Enter with accommodations'}
            </button>
          </div>
          {error && <p className="mt-3 text-sm" style={{ color: '#b42318' }}>{error}</p>}
        </div>

        {/* What you'll explore */}
        <div className="mt-9 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-4" style={{ border: '1px solid #e6e2da' }}>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide mb-2" style={{ color: '#8f8b83' }}>
              <GraduationCap className="h-3.5 w-3.5" style={{ color: INDIGO }} /> As a 6th grader
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: '#3a382f' }}>
              Work through fun lessons and quizzes, chat with an AI tutor, and see two subjects already
              finished — with badges earned and standards mastered.
            </p>
          </div>
          <div className="rounded-xl bg-white p-4" style={{ border: '1px solid #e6e2da' }}>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide mb-2" style={{ color: '#8f8b83' }}>
              <Heart className="h-3.5 w-3.5" style={{ color: AMBER }} /> With accommodations
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: '#3a382f' }}>
              See a learner whose supports are visible and active — read-aloud, easy-reading text,
              extra thinking time, and a tutor that adapts to how they learn.
            </p>
          </div>
        </div>

        {/* Feature strip */}
        <div className="mt-6 flex flex-wrap gap-2">
          {['AI tutor', 'Interactive quizzes', 'Earned badges', 'Common Core · NGSS · C3', 'Built-in accommodations'].map((t) => (
            <span key={t} className="text-[11px] px-3 py-1.5 rounded-full bg-white" style={{ color: '#46443c', border: '1px solid #e6e2da' }}>{t}</span>
          ))}
        </div>

        <div className="mt-8 pt-4 flex items-center gap-1.5 text-[11px]" style={{ borderTop: '1px solid #e2ddd4', color: '#8f8b83' }}>
          <Sparkles className="h-3 w-3" style={{ color: AMBER }} />
          Synops Academy · Confidential demo · <a href="https://synops-consulting.com" style={{ color: AMBER }}>synops-consulting.com</a>
          <ArrowRight className="h-3 w-3" />
          <BookOpen className="h-3 w-3 ml-auto" style={{ color: '#c9c3b6' }} />
        </div>
      </div>
    </div>
  );
}
