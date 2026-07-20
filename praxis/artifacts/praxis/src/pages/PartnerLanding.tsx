import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Brand { displayName?: string | null; primaryColor?: string | null; secondaryColor?: string | null; accentColor?: string | null; logoUrl?: string | null; fontFamily?: string | null }
interface Landing { slug: string; name: string; brand: Brand | null; orgs: { name: string; industry: string | null }[] }

// Enza-specific marketing content, inspired by enzaglobalmedia.co.za. Other partners get a generic
// version built from their brand name + organisations.
const ENZA = {
  tagline: 'Connect. Create. Elevate.',
  heroLead: 'We empower township and rural entrepreneurs through business coaching, practical training and incubation - helping new ventures launch, existing SMMEs grow, and entrepreneurial skills flourish.',
  accreditation: 'A QCTO-accredited training provider',
  programmes: [
    { name: 'BizAscend Starter', desc: 'From idea to first sales - the fundamentals to start and sustain a business.' },
    { name: 'BizAscend Builder', desc: 'Systems that support growth - operations, finance and repeatable selling.' },
    { name: 'BizAscend Scaler', desc: 'Markets, margins and partnerships - becoming corporate-ready.' },
    { name: 'New Venture Creation', desc: 'Equipping aspiring entrepreneurs to launch viable enterprises.' },
    { name: 'Techprenure', desc: 'Blending technology and entrepreneurship for digital-age competitiveness.' },
    { name: 'Workplace Essentials', desc: 'Critical skills for operational excellence and leadership.' },
  ],
  principles: [
    { h: 'Guiding with purpose', t: 'We lead with clarity, vision and integrity, lighting the path for SMMEs to grow with confidence.' },
    { h: 'Helping with heart', t: 'Hands-on and human-centered - every interaction is a chance to uplift, educate and make a difference.' },
    { h: 'Supporting with strength', t: 'Consistent, reliable support rooted in a deep belief in our partners’ potential.' },
    { h: 'Valuing every voice', t: 'A culture of respect, inclusion and appreciation where every entrepreneur feels seen.' },
  ],
  stats: [
    { n: '657', l: 'Entrepreneur journeys' },
    { n: '78%', l: 'Women entrepreneurs' },
    { n: '260', l: 'Training sessions' },
    { n: '1,276', l: 'Coaching hours' },
  ],
  testimonials: [
    { name: 'Wendy', biz: 'Founder, CakesbyWendy', quote: 'Enza Global did not just teach me - they walked the journey with me, and I launched CakesbyWendy into a growing business.' },
    { name: 'Thabang Calvin Monama', biz: 'Founder, Mofine Foods', quote: 'Their hands-on coaching helped me streamline operations and make smarter decisions at Mofine Foods.' },
    { name: 'Talita Giqo', biz: 'Founder, EMBODGTECH', quote: 'Enza’s mentorship helped me build EMBODGTECH into a thriving innovation hub in the rural Eastern Cape.' },
  ],
  contact: { addr: '61 Bowling Avenue, Morningside Manor, Sandton, 2196', phone: '+27 10 447 1071', email: 'connect@enzaglobalmedia.co.za' },
};

export function PartnerLanding({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const [data, setData] = useState<Landing | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { apiFetch<Landing>(`/p/${slug}`).then(setData).catch(() => setErr(true)); }, [slug]);

  if (err) return <div className="min-h-[100dvh] flex items-center justify-center text-slate-500">This page is not available.</div>;
  if (!data) return <div className="min-h-[100dvh] flex items-center justify-center text-slate-400">Loading…</div>;

  const isEnza = slug === 'enza-global';
  const brand = data.brand ?? {};
  const primary = brand.primaryColor || '#111111';
  const accent = brand.secondaryColor || '#9CDF00';
  const name = brand.displayName || data.name;
  const font = brand.fontFamily || 'Heebo, system-ui, sans-serif';
  const c = ENZA; // content (Enza-specific; used as the template for the generic case too)

  const Btn = ({ href, children, filled = true }: { href: string; children: any; filled?: boolean }) => (
    <a href={href} className="inline-block rounded-full px-6 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5"
      style={filled ? { background: accent, color: primary } : { border: `2px solid ${accent}`, color: '#fff' }}>{children}</a>
  );

  return (
    <div style={{ fontFamily: font }} className="bg-white text-slate-900">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {brand.logoUrl ? <img src={brand.logoUrl} alt={name} className="h-9 max-w-[160px] object-contain" /> : <span className="font-bold text-lg" style={{ color: primary }}>{name}</span>}
          </div>
          <a href={`/sign-in?p=${slug}`} className="rounded-full px-5 py-2 text-sm font-semibold text-white" style={{ background: primary }}>Sign in</a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${primary} 0%, #1c2a10 100%)` }}>
        <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full" style={{ background: accent, opacity: 0.12 }} />
        <div className="max-w-6xl mx-auto px-5 py-20 sm:py-28 relative">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] mb-4" style={{ color: accent }}>{isEnza ? c.tagline : 'Learn. Grow. Succeed.'}</div>
          <h1 className="text-4xl sm:text-6xl font-black text-white leading-[1.05] max-w-3xl">Growth comes from <span style={{ color: accent }}>skilling your people</span>.</h1>
          <p className="mt-6 text-lg text-slate-200 max-w-2xl leading-relaxed">{isEnza ? c.heroLead : `${name} delivers practical, accredited training and coaching so people and businesses can grow with confidence.`}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Btn href={`/sign-in?p=${slug}`}>Enter the platform</Btn>
          </div>
          {isEnza && <div className="mt-6 text-sm text-slate-300">{c.accreditation}</div>}
        </div>
      </section>

    </div>
  );
}
