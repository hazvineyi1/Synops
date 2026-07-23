import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useBrandTheme, type BrandTheme } from '@/context/ThemeProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2, Palette, Globe, CheckCircle2, Clock, Sparkles, Upload, Wand2 } from 'lucide-react';

type Form = Partial<BrandTheme>;

type ImgParts = { dataUrl: string; base64: string; mediaType: string };
function readImage(file: File): Promise<ImgParts> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = String(r.result);
      resolve({ dataUrl, base64: dataUrl.split(',')[1] || '', mediaType: (dataUrl.match(/^data:([^;]+);/)?.[1]) || file.type || 'image/png' });
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function ColorField({ label, value, onChange, fallback }: { label: string; value: string; onChange: (v: string) => void; fallback: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-3">
        <Input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} className="w-16 h-10 p-1 cursor-pointer" />
        <Input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} className="flex-1 font-mono uppercase" placeholder={fallback} />
      </div>
    </div>
  );
}

export function PartnerTheme() {
  const { data: theme, isLoading } = useBrandTheme();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<Form>({});

  useEffect(() => {
    if (theme) setForm({
      displayName: theme.displayName || '',
      primaryColor: theme.primaryColor || '#0f172a',
      secondaryColor: theme.secondaryColor || '',
      accentColor: theme.accentColor || '',
      logoUrl: theme.logoUrl || '',
      faviconUrl: theme.faviconUrl || '',
      fontFamily: theme.fontFamily || '',
      credentialTitle: theme.credentialTitle || 'PraxisMark',
      emailSenderName: theme.emailSenderName || '',
      customDomain: theme.customDomain || '',
    });
  }, [theme]);

  const domain = (form.customDomain || '').trim().toLowerCase();
  const domainLive = !!domain && typeof window !== 'undefined' && window.location.hostname === domain;

  const save = useMutation({
    mutationFn: () => apiFetch<BrandTheme>('/brand/theme', { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand-theme'] });
      toast({ title: 'Branding saved', description: 'Your theme is now live across the app.' });
    },
    onError: (e: any) => toast({ title: 'Could not save', description: e?.message ?? 'Try again', variant: 'destructive' }),
  });

  const upd = (patch: Form) => setForm((f) => ({ ...f, ...patch }));

  // AI brand kit: upload a logo (+ optional business card + website), let AI derive colours + copy.
  const logoRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLInputElement>(null);
  const [logoParts, setLogoParts] = useState<ImgParts | null>(null);
  const [cardParts, setCardParts] = useState<ImgParts | null>(null);
  const [aiWebsite, setAiWebsite] = useState('');
  const [aiName, setAiName] = useState('');

  const onLogo = async (f: File | null) => { if (!f) return; const p = await readImage(f); setLogoParts(p); upd({ logoUrl: p.dataUrl }); };
  const onCard = async (f: File | null) => { if (!f) return; setCardParts(await readImage(f)); };

  const gen = useMutation({
    mutationFn: () => apiFetch<{ displayName: string; primaryColor: string; secondaryColor: string; accentColor: string; fontFamily: string; credentialTitle: string; tagline: string }>(
      '/brand/ai-generate',
      { method: 'POST', body: JSON.stringify({
        logoBase64: logoParts!.base64, logoMediaType: logoParts!.mediaType,
        cardBase64: cardParts?.base64, cardMediaType: cardParts?.mediaType,
        website: aiWebsite.trim() || undefined, businessName: (aiName.trim() || form.displayName || undefined),
      }) }),
    onSuccess: (r) => {
      upd({
        displayName: r.displayName || form.displayName,
        primaryColor: r.primaryColor, secondaryColor: r.secondaryColor, accentColor: r.accentColor,
        fontFamily: r.fontFamily || form.fontFamily, credentialTitle: r.credentialTitle || form.credentialTitle,
      });
      toast({ title: 'Brand generated', description: r.tagline ? `"${r.tagline}" — review and Save to apply.` : 'Review and Save to apply.' });
    },
    onError: (e: any) => toast({ title: 'Could not generate', description: e?.message ?? 'Try again', variant: 'destructive' }),
  });

  if (isLoading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif font-bold tracking-tight">Branding</h1>
        <p className="text-muted-foreground">White-label the whole experience - name, logo, colours, favicon and sender identity. Changes go live across the app on save.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> AI brand kit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Upload the partner's logo (and optionally a business card and website). AI reads the logo and generates the colours, font and personalization. Review below, then Save.</p>

              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0] ?? null)} />
              <input ref={cardRef} type="file" accept="image/*" className="hidden" onChange={(e) => onCard(e.target.files?.[0] ?? null)} />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Logo (required)</Label>
                  <button type="button" onClick={() => logoRef.current?.click()} className="w-full h-24 rounded-lg border border-dashed border-border hover:border-primary/40 flex items-center justify-center overflow-hidden bg-muted/30">
                    {logoParts?.dataUrl || form.logoUrl ? <img src={logoParts?.dataUrl || form.logoUrl || undefined} alt="Logo" className="max-h-20 object-contain" /> : <span className="text-xs text-muted-foreground flex items-center gap-1"><Upload className="h-3.5 w-3.5" /> Upload logo</span>}
                  </button>
                </div>
                <div className="space-y-1.5">
                  <Label>Business card (optional)</Label>
                  <button type="button" onClick={() => cardRef.current?.click()} className="w-full h-24 rounded-lg border border-dashed border-border hover:border-primary/40 flex items-center justify-center overflow-hidden bg-muted/30">
                    {cardParts?.dataUrl ? <img src={cardParts.dataUrl} alt="Card" className="max-h-20 object-contain" /> : <span className="text-xs text-muted-foreground flex items-center gap-1"><Upload className="h-3.5 w-3.5" /> Upload card</span>}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Business name</Label><Input value={aiName} onChange={(e) => setAiName(e.target.value)} placeholder="Their brand name" /></div>
                <div className="space-y-1.5"><Label>Website</Label><Input value={aiWebsite} onChange={(e) => setAiWebsite(e.target.value)} placeholder="https://theirsite.com" /></div>
              </div>

              <Button onClick={() => gen.mutate()} disabled={!logoParts || gen.isPending} className="w-full gap-1.5">
                {gen.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Wand2 className="h-4 w-4" /> Generate brand with AI</>}
              </Button>
              <p className="text-xs text-muted-foreground">The logo is stored with the brand. Needs AI to be configured on the server; if not, set the colours manually below.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5 text-primary" /> Visual identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={form.displayName || ''} onChange={(e) => upd({ displayName: e.target.value })} placeholder="Your Academy" />
              </div>

              <ColorField label="Primary colour" value={form.primaryColor || ''} onChange={(v) => upd({ primaryColor: v })} fallback="#0f172a" />
              <ColorField label="Secondary colour" value={form.secondaryColor || ''} onChange={(v) => upd({ secondaryColor: v })} fallback="#3b82f6" />
              <ColorField label="Accent colour" value={form.accentColor || ''} onChange={(v) => upd({ accentColor: v })} fallback="#10b981" />

              <div className="space-y-2">
                <Label>Logo URL</Label>
                <Input placeholder="https://example.com/logo.png" value={form.logoUrl || ''} onChange={(e) => upd({ logoUrl: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Favicon URL</Label>
                <Input placeholder="https://example.com/favicon.png" value={form.faviconUrl || ''} onChange={(e) => upd({ faviconUrl: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Font family</Label>
                <Input placeholder='e.g. Inter, sans-serif' value={form.fontFamily || ''} onChange={(e) => upd({ fontFamily: e.target.value })} />
                <p className="text-xs text-muted-foreground">A CSS font-family stack. The font must be available to the browser (a web-safe stack or one your logo host serves).</p>
              </div>

              <div className="space-y-2 pt-4 border-t border-border">
                <Label>Credential title</Label>
                <Input value={form.credentialTitle || ''} onChange={(e) => upd({ credentialTitle: e.target.value })} placeholder="e.g. Leadership PraxisMark" />
                <p className="text-xs text-muted-foreground">Shown on learner credential cards.</p>
              </div>
              <div className="space-y-2">
                <Label>Email sender name</Label>
                <Input value={form.emailSenderName || ''} onChange={(e) => upd({ emailSenderName: e.target.value })} placeholder="e.g. Your Academy Team" />
                <p className="text-xs text-muted-foreground">Display name shown on transactional emails (used once branded email is enabled).</p>
              </div>

              <div className="pt-6">
                <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
                  <Save className="h-4 w-4 mr-2" /> {save.isPending ? 'Saving…' : 'Save branding'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5 text-primary" /> Custom domain</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Serve the whole platform on your own address - e.g. <span className="font-mono">learn.youracademy.com</span>. Learners never see a Synops URL; even the sign-in page carries your branding.
              </p>
              <div className="space-y-2">
                <Label>Domain</Label>
                <Input
                  value={form.customDomain || ''}
                  onChange={(e) => upd({ customDomain: e.target.value })}
                  placeholder="learn.youracademy.com"
                  className="font-mono"
                />
                {domain && (
                  <div className={`flex items-center gap-2 text-xs font-medium ${domainLive ? 'text-green-600' : 'text-amber-600'}`}>
                    {domainLive ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                    {domainLive ? 'Live - this domain is serving the platform now.' : 'Saved. Finish the two setup steps below, then it goes live (TLS can take a few minutes).'}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-2">
                <p className="font-bold text-foreground uppercase tracking-wider text-[11px]">Two steps to go live</p>
                <p><span className="font-bold text-foreground">1.</span> Add the domain to the Praxis service in Railway (Settings → Networking → Custom Domain). Railway issues the TLS certificate and shows you a <span className="font-mono">CNAME</span> target.</p>
                <p><span className="font-bold text-foreground">2.</span> At your domain registrar, add a <span className="font-mono">CNAME</span> record for the subdomain pointing to that Railway target. Save it here - done.</p>
              </div>
              <div className="pt-2">
                <Button onClick={() => save.mutate()} disabled={save.isPending} variant="outline" className="w-full">
                  <Save className="h-4 w-4 mr-2" /> {save.isPending ? 'Saving…' : 'Save domain'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Live preview</h3>
          <div className="rounded-2xl border border-border p-8 bg-muted/30 shadow-inner flex flex-col items-center justify-center min-h-[500px]">
            <div className="w-full max-w-sm bg-card rounded-xl shadow-lg border border-border overflow-hidden mb-8">
              <div className="h-14 border-b border-border flex items-center px-4 gap-2" style={{ backgroundColor: form.primaryColor || '#0f172a', color: '#fff' }}>
                {form.logoUrl ? <img src={form.logoUrl} alt="Logo" className="h-6 object-contain" /> : <span className="font-serif font-bold text-lg">{form.displayName || 'Your Brand'}</span>}
              </div>
              <div className="p-6 space-y-4">
                <div className="h-4 w-1/3 bg-muted rounded" />
                <div className="h-20 w-full bg-muted/50 rounded" />
                <Button className="w-full" style={{ backgroundColor: form.primaryColor || '#0f172a' }}>Continue Learning</Button>
              </div>
            </div>
            <div className="w-full max-w-sm bg-card rounded-xl shadow-lg border border-border p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: form.accentColor || form.primaryColor || '#0f172a' }} />
              <div className="flex justify-between items-center mb-4">
                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs" style={{ color: form.primaryColor || '#0f172a' }}>Logo</div>
                <div className="text-[10px] font-bold uppercase border rounded-full px-2 py-0.5 border-green-200 bg-green-50 text-green-700">Valid</div>
              </div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{form.displayName || 'Platform'}</p>
              <h3 className="font-serif font-bold text-xl mb-6">{form.credentialTitle || 'PraxisMark'}</h3>
              <div className="flex justify-between items-end">
                <div className="h-3 w-20 bg-muted rounded" />
                <div className="h-10 w-10 rounded-full border-4 border-muted" style={{ borderLeftColor: form.primaryColor || '#0f172a' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
