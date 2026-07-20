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
          <a href="/sign-in" className="rounded-full px-5 py-2 text-sm font-semibold text-white" style={{ background: primary }}>Sign in</a>
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
            <Btn href="/sign-in">Enter the platform</Btn>
            <Btn href="#programmes" filled={false}>Explore programmes</Btn>
          </div>
          {isEnza && <div className="mt-6 text-sm text-slate-300">{c.accreditation}</div>}
        </div>
      </section>

      {/* Programmes */}
      <section id="programmes" className="max-w-6xl mx-auto px-5 py-20">
        <div className="text-center mb-12">
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: accent }}>What we do</div>
          <h2 className="text-3xl font-bold mt-2">Accredited skills-development programmes</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {c.programmes.map((p) => (
            <div key={p.name} className="rounded-2xl border border-slate-200 p-6 hover:shadow-lg transition-shadow">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-4" style={{ background: `${accent}22` }}><span className="font-black" style={{ color: primary }}>{p.name[0]}</span></div>
              <h3 className="font-bold text-lg">{p.name}</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Impact stats */}
      <section style={{ background: primary }} className="py-16">
        <div className="max-w-6xl mx-auto px-5 grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
          {c.stats.map((s) => (
            <div key={s.l}>
              <div className="text-4xl sm:text-5xl font-black" style={{ color: accent }}>{s.n}</div>
              <div className="text-sm text-slate-300 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Guiding principles */}
      <section className="max-w-6xl mx-auto px-5 py-20">
        <div className="text-center mb-12">
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: accent }}>Our guiding principles</div>
          <h2 className="text-3xl font-bold mt-2">How we work with every entrepreneur</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {c.principles.map((p) => (
            <div key={p.h} className="rounded-2xl bg-slate-50 p-6 border-l-4" style={{ borderColor: accent }}>
              <h3 className="font-bold text-lg">{p.h}</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{p.t}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Our organisations & stakeholders (dynamic) */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: accent }}>Our network</div>
            <h2 className="text-3xl font-bold mt-2">Organisations & stakeholders</h2>
            <p className="text-slate-600 mt-2 max-w-2xl mx-auto">The programmes, academies and partners delivering impact through {name}.</p>
          </div>
          {data.orgs.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.orgs.map((o) => (
                <div key={o.name} className="rounded-xl bg-white border border-slate-200 p-5 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center font-black text-white shrink-0" style={{ background: primary }}>{o.name[0]}</div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{o.name}</div>
                    {o.industry && <div className="text-xs text-slate-500 truncate">{o.industry}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-slate-400">Organisations will appear here as they join.</p>
          )}
        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-6xl mx-auto px-5 py-20">
        <div className="text-center mb-12">
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: accent }}>What our entrepreneurs say</div>
          <h2 className="text-3xl font-bold mt-2">Real businesses, real growth</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {c.testimonials.map((t) => (
            <div key={t.name} className="rounded-2xl border border-slate-200 p-6">
              <p className="text-sm text-slate-700 leading-relaxed italic">&ldquo;{t.quote}&rdquo;</p>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full flex items-center justify-center font-bold text-white" style={{ background: accent, color: primary }}>{t.name[0]}</div>
                <div><div className="font-semibold text-sm">{t.name}</div><div className="text-xs text-slate-500">{t.biz}</div></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: `linear-gradient(135deg, ${primary} 0%, #1c2a10 100%)` }} className="py-16">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h2 className="text-3xl font-bold text-white">Ready to grow with {name}?</h2>
          <p className="text-slate-300 mt-3 max-w-xl mx-auto">Sign in to your learning platform, or reach out to partner with us on high-impact coaching, training and incubation.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Btn href="/sign-in">Enter the platform</Btn>
            {isEnza && <a href={`mailto:${c.contact.email}`} className="inline-block rounded-full px-6 py-3 text-sm font-semibold text-white" style={{ border: `2px solid ${accent}` }}>Partner with us</a>}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: primary }} className="text-slate-300 py-12">
        <div className="max-w-6xl mx-auto px-5 grid sm:grid-cols-3 gap-8 text-sm">
          <div>
            {brand.logoUrl ? <img src={brand.logoUrl} alt={name} className="h-10 max-w-[160px] object-contain bg-white rounded p-1 mb-3" /> : <div className="font-bold text-white text-lg mb-3">{name}</div>}
            <p className="leading-relaxed">Locally inspired, entrepreneurially driven - advancing SMMEs and Enterprise &amp; Supplier Development.</p>
          </div>
          <div>
            <div className="font-semibold text-white mb-2">Get in touch</div>
            {isEnza ? (
              <div className="space-y-1">
                <div>{c.contact.addr}</div>
                <div><a href={`tel:${c.contact.phone.replace(/\s/g, '')}`} className="hover:text-white">{c.contact.phone}</a></div>
                <div><a href={`mailto:${c.contact.email}`} className="hover:text-white">{c.contact.email}</a></div>
              </div>
            ) : <div>Contact your programme team to get started.</div>}
          </div>
          <div>
            <div className="font-semibold text-white mb-2">Quick links</div>
            <div className="space-y-1">
              <div><a href="/sign-in" className="hover:text-white">Sign in</a></div>
              <div><a href="#programmes" className="hover:text-white">Programmes</a></div>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-5 mt-8 pt-6 border-t border-white/10 text-xs text-slate-400">© {new Date().getFullYear()} {name}. Powered by Synops Praxis.</div>
      </footer>
    </div>
  );
}
