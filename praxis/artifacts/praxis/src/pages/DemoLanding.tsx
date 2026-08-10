import { useState } from 'react';
import { GraduationCap, LayoutDashboard, TrendingUp } from 'lucide-react';
import { useSession } from '@/context/SessionContext';

/**
 * Public demo landing for demo.synops-consulting.com - the link sent to investors and prospects.
 * Its own graphite + amber identity (distinct from any partner brand). Two one-click entry points
 * that call /auth/demo-login (host-locked, credential-less) and drop the visitor straight into the
 * live product as a learner or as a partner admin. No sign-up, no forms.
 */
// Deep teal + warm amber on a warm off-white. The teal matches the Synops investor deck/memo
// (TEAL #133C43), so the demo reads as one brand alongside the pitch materials.
const INK = '#17211F';      // near-black, teal-tinted, for headlines and body
const TEAL = '#133C43';     // primary: logo, primary button
const AMBER = '#C2601C';    // warm burnt-amber accent
const GREIGE = '#F3F1EC';   // warm off-white page surface

export default function DemoLanding() {
  const { demoSignIn } = useSession();
  const [busy, setBusy] = useState<null | 'student' | 'admin'>(null);
  const [error, setError] = useState<string | null>(null);

  const enter = async (role: 'student' | 'admin') => {
    setError(null);
    setBusy(role);
    try {
      await demoSignIn(role);
      window.location.href = '/dashboard'; // full reload so caches start fresh for the demo identity
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the demo. Please try again.');
      setBusy(null);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', background: GREIGE, color: INK }} className="flex flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 md:py-16">

        {/* Brand row */}
        <div className="flex items-center justify-between mb-12 md:mb-16">
          <div className="flex items-center gap-2.5">
            <span className="h-8 w-8 rounded-lg flex items-center justify-center font-semibold text-white" style={{ background: TEAL }}>S</span>
            <span className="text-[15px] font-medium">Synops <span style={{ color: '#8f8b83' }}>Demo</span></span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full" style={{ background: '#FBEEDC', color: AMBER, border: '1px solid #ecdcc2' }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: AMBER }} /> Live product, no sign-up
            </span>
            <a href="https://synops-consulting.com/contact" className="inline-flex items-center rounded-lg px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm" style={{ background: TEAL }}>Request access</a>
          </div>
        </div>

        {/* Hero */}
        <div className="max-w-xl">
          <h1 className="text-3xl md:text-[34px] font-medium leading-tight" style={{ color: INK }}>
            The learning platform for funded programmes.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: '#55524b' }}>
            A working demo of the platform behind funded enterprise and skills programmes. Explore it
            as a learner, or as the administrator funders report to. No sign-up.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={() => enter('student')}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-[10px] px-5 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-60"
              style={{ background: TEAL }}
            >
              <GraduationCap className="h-4 w-4" />
              {busy === 'student' ? 'Starting…' : 'Enter as a learner'}
            </button>
            <button
              onClick={() => enter('admin')}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-[10px] px-5 py-3 text-sm font-medium bg-white transition-opacity disabled:opacity-60"
              style={{ color: AMBER, border: '1px solid #ead9c2' }}
            >
              <LayoutDashboard className="h-4 w-4" />
              {busy === 'admin' ? 'Starting…' : 'Explore the admin view'}
            </button>
          </div>
          {error && <p className="mt-3 text-sm" style={{ color: '#b42318' }}>{error}</p>}
        </div>

        {/* What you'll explore */}
        <div className="mt-9 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-4" style={{ border: '1px solid #e6e2da' }}>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide mb-2" style={{ color: '#8f8b83' }}>
              <GraduationCap className="h-3.5 w-3.5" style={{ color: TEAL }} /> As a learner
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: '#3a382f' }}>
              Work through the AI tutor, complete a real case, build mastery, and earn a credential.
            </p>
          </div>
          <div className="rounded-xl bg-white p-4" style={{ border: '1px solid #e6e2da' }}>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide mb-2" style={{ color: '#8f8b83' }}>
              <TrendingUp className="h-3.5 w-3.5" style={{ color: AMBER }} /> As an admin
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: '#3a382f' }}>
              Review organisations, learner evidence, alignment to standards, and export a funder-ready report.
            </p>
          </div>
        </div>

        {/* Feature strip */}
        <div className="mt-6 flex flex-wrap gap-2">
          {['AI tutor', 'Funder-ready evidence', 'White-label per partner', 'POPIA-compliant'].map((t) => (
            <span key={t} className="text-[11px] px-3 py-1.5 rounded-full bg-white" style={{ color: '#46443c', border: '1px solid #e6e2da' }}>{t}</span>
          ))}
        </div>

        <div className="mt-8 pt-4 flex items-center gap-1.5 text-[11px]" style={{ borderTop: '1px solid #e2ddd4', color: '#8f8b83' }}>
          Synops · Confidential demo · <a href="https://synops-consulting.com" style={{ color: AMBER }}>synops-consulting.com</a>
        </div>
      </div>
    </div>
  );
}
