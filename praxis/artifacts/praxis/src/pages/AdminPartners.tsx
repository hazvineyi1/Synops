import React, { useState } from 'react';
import { useListPartners } from '@workspace/api-client-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building, Plus, Palette, Settings2, Upload, Mail, BookOpen, Check, Copy, Loader2, Trash2, Wrench, AlertTriangle, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { setActivePartner } from '@/lib/partnerHubData';

interface Partner {
  id: string;
  name: string;
  slug: string;
  status: string;
  orgCount?: number;
  learnerCount?: number;
  primaryColor?: string;
  logoUrl?: string;
  displayName?: string;
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// Read an image file into the shapes we need: a data URL (to store + preview) and the raw
// base64 + media type (to hand to Claude vision for the brand kit).
function readImage(file: File): Promise<{ dataUrl: string; base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = String(r.result);
      const base64 = dataUrl.split(',')[1] ?? '';
      resolve({ dataUrl, base64, mediaType: file.type });
    };
    r.onerror = () => reject(new Error('Could not read the image.'));
    r.readAsDataURL(file);
  });
}

interface CourseLite { id: string; title: string; status?: string }

// The full "Create partner" flow: details -> AI brand kit from a logo -> first partner admin
// (emailed a set-password link) -> optional starter courses. Orchestrates the real endpoints
// that already exist: POST /partners, PUT /brand/partner/:id, POST /platform/users, PUT
// /partners/:id/courses.
function CreatePartnerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', slug: '', slugTouched: false, contactEmail: '', website: '' });
  const [logo, setLogo] = useState<{ dataUrl: string; base64: string; mediaType: string } | null>(null);
  const [brand, setBrand] = useState({
    displayName: '', logoUrl: '', primaryColor: '#1e293b', secondaryColor: '#3b82f6',
    accentColor: '#6366f1', fontFamily: 'Inter, system-ui, sans-serif', credentialTitle: 'Certificate',
  });
  const [admin, setAdmin] = useState({ firstName: '', lastName: '', email: '' });
  const [courseIds, setCourseIds] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ partnerName: string; adminLink?: string; adminEmail?: string; emailed?: boolean } | null>(null);

  // Once the user edits the slug, ALWAYS show exactly what they typed (even empty), the old
  // `form.slugTouched && form.slug` fell back to the name-derived slug whenever the field was
  // cleared, so deletions were ignored and new keystrokes appended to the name-derived value
  // ("test-partner-inc" + "hello" = "test-partner-inchello"). Before they touch it, auto-derive.
  const slug = form.slugTouched ? form.slug : slugify(form.name);
  // What actually gets submitted / validated: a fully cleaned slug (trailing hyphens stripped).
  // We keep those NOT stripped in the live field so a hyphen can be typed mid-word.
  const finalSlug = slugify(slug);

  // Super-admin assignment/seeding view: include incomplete courses so the whole catalogue (including
  // courses still being built) is assignable to partners; the catalogue filter still hides them from
  // learners until complete.
  const { data: courses } = useQuery({
    queryKey: ['courses', 'authoring'],
    queryFn: () => apiFetch<CourseLite[]>('/courses?includeIncomplete=true'),
  });

  const onLogo = async (file?: File | null) => {
    if (!file) return;
    try {
      const img = await readImage(file);
      setLogo(img);
      setBrand((b) => ({ ...b, logoUrl: img.dataUrl }));
    } catch {
      toast({ title: 'Could not read that image', variant: 'destructive' });
    }
  };

  const aiGen = useMutation({
    mutationFn: () =>
      apiFetch<any>('/brand/ai-generate', {
        method: 'POST',
        body: JSON.stringify({ logoBase64: logo!.base64, logoMediaType: logo!.mediaType, website: form.website || undefined, businessName: form.name || undefined }),
      }),
    onSuccess: (r) =>
      setBrand((b) => ({
        ...b,
        displayName: r.displayName || b.displayName || form.name,
        primaryColor: r.primaryColor || b.primaryColor,
        secondaryColor: r.secondaryColor || b.secondaryColor,
        accentColor: r.accentColor || b.accentColor,
        fontFamily: r.fontFamily || b.fontFamily,
        credentialTitle: r.credentialTitle || b.credentialTitle,
      })),
    onError: (e: any) => toast({ title: 'Brand kit failed', description: e?.message ?? 'You can set colours manually.', variant: 'destructive' }),
  });

  const provision = useMutation({
    mutationFn: async () => {
      const partner = await apiFetch<{ id: string; name: string }>('/partners', {
        method: 'POST',
        body: JSON.stringify({ name: form.name.trim(), slug: finalSlug, contactEmail: form.contactEmail.trim() }),
      });
      const pid = partner.id;
      // Brand (only if a logo or a non-default palette was set).
      if (brand.logoUrl || aiGen.isSuccess) {
        await apiFetch(`/brand/partner/${pid}`, {
          method: 'PUT',
          body: JSON.stringify({
            displayName: brand.displayName || form.name.trim(),
            logoUrl: brand.logoUrl || undefined,
            primaryColor: brand.primaryColor, secondaryColor: brand.secondaryColor, accentColor: brand.accentColor,
            fontFamily: brand.fontFamily, credentialTitle: brand.credentialTitle,
          }),
        });
      }
      // First partner admin, scoped to the new partner, emailed a set-password link.
      let adminRes: any = null;
      if (admin.email.trim()) {
        adminRes = await apiFetch<any>('/platform/users', {
          method: 'POST',
          body: JSON.stringify({
            email: admin.email.trim(), firstName: admin.firstName.trim(), lastName: admin.lastName.trim(),
            role: 'partner_admin', partnerId: pid,
          }),
        });
      }
      // Starter courses.
      if (courseIds.size) {
        await apiFetch(`/partners/${pid}/courses`, { method: 'PUT', body: JSON.stringify({ courseIds: [...courseIds] }) });
      }
      return { partnerName: partner.name, adminLink: adminRes?.link, adminEmail: adminRes?.email, emailed: adminRes?.emailed };
    },
    onSuccess: (r) => { setResult(r); onCreated(); },
    onError: (e: any) => toast({ title: 'Could not create partner', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  const canCreate = form.name.trim().length > 1 && !!finalSlug && form.contactEmail.includes('@');

  if (result) {
    return (
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2"><Check className="h-5 w-5 text-emerald-600" /> {result.partnerName} created</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">The partner tenant is provisioned with its branding{courseIds.size ? ` and ${courseIds.size} starter course${courseIds.size === 1 ? '' : 's'}` : ''}.</p>
          {result.adminEmail && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium"><Mail className="h-4 w-4 text-muted-foreground" /> First admin: {result.adminEmail}</div>
              <p className="text-xs text-muted-foreground">
                {result.emailed
                  ? 'A set-password email has been sent to them.'
                  : 'Email is not configured on the server, so share this one-time set-password link with them:'}
              </p>
              {result.adminLink && (
                <div className="flex gap-2">
                  <Input readOnly value={result.adminLink} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(result.adminLink!); toast({ title: 'Link copied' }); }}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
        </div>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="font-serif">New partner</DialogTitle>
      </DialogHeader>
      <div className="space-y-5 pt-2">
        {/* Details */}
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Partner name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Acme Learning" />
            </div>
            <div className="space-y-1.5">
              <Label>Tenant slug</Label>
              <Input value={slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40), slugTouched: true }))} className="font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Website <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="acme.com" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Organisation contact email</Label>
              <Input type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} placeholder="ops@acme.com" />
            </div>
          </div>
        </section>

        {/* Brand kit */}
        <section className="space-y-3 rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4 text-primary" /> Brand kit</div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-input px-3 py-2 hover:bg-muted">
              <Upload className="h-4 w-4" /> {logo ? 'Change logo' : 'Upload logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
            </label>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={!logo || aiGen.isPending} onClick={() => aiGen.mutate()}>
              {aiGen.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Generate colours from logo
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['primaryColor', 'secondaryColor', 'accentColor'] as const).map((k) => (
              <div key={k} className="space-y-1">
                <Label className="text-[11px] capitalize">{k.replace('Color', '')}</Label>
                <div className="flex items-center gap-1.5">
                  <input type="color" value={brand[k]} onChange={(e) => setBrand((b) => ({ ...b, [k]: e.target.value }))} className="h-8 w-9 cursor-pointer rounded border border-input p-0.5" />
                  <Input value={brand[k]} onChange={(e) => setBrand((b) => ({ ...b, [k]: e.target.value }))} className="font-mono text-xs h-8" />
                </div>
              </div>
            ))}
          </div>
          {/* Preview */}
          <div className="rounded-md border border-border p-3 flex items-center gap-3" style={{ borderLeftColor: brand.primaryColor, borderLeftWidth: 4 }}>
            {brand.logoUrl
              ? <img src={brand.logoUrl} alt="" className="h-8 w-auto object-contain" />
              : <div className="h-8 w-8 rounded flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: brand.primaryColor }}>{(brand.displayName || form.name || 'P')[0]}</div>}
            <span className="font-serif font-bold text-sm" style={{ color: brand.primaryColor }}>{brand.displayName || form.name || 'Partner name'}</span>
          </div>
        </section>

        {/* First admin */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4 text-primary" /> First partner admin <span className="text-muted-foreground font-normal text-xs">(optional, emailed a set-password link)</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>First name</Label><Input value={admin.firstName} onChange={(e) => setAdmin((a) => ({ ...a, firstName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Last name</Label><Input value={admin.lastName} onChange={(e) => setAdmin((a) => ({ ...a, lastName: e.target.value }))} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Admin email</Label><Input type="email" value={admin.email} onChange={(e) => setAdmin((a) => ({ ...a, email: e.target.value }))} placeholder="admin@acme.com" /></div>
          </div>
        </section>

        {/* Starter courses */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-primary" /> Starter courses <span className="text-muted-foreground font-normal text-xs">(optional)</span></div>
          {!courses?.length ? (
            <p className="text-xs text-muted-foreground">No courses in the catalogue yet.</p>
          ) : (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y">
              {courses.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm px-3 py-2 cursor-pointer hover:bg-muted/50">
                  <input type="checkbox" className="h-4 w-4" checked={courseIds.has(c.id)} onChange={() => setCourseIds((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />
                  <span className="flex-1">{c.title}</span>
                  {c.status && <Badge variant="outline" className="text-[10px] capitalize">{c.status}</Badge>}
                </label>
              ))}
            </div>
          )}
        </section>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!canCreate || provision.isPending} onClick={() => provision.mutate()}>
            {provision.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : 'Create partner'}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

function BrandingPanel({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    displayName: partner.displayName ?? partner.name,
    logoUrl: partner.logoUrl ?? '',
    primaryColor: partner.primaryColor ?? '#1e293b',
    accentColor: '#6366f1',
  });

  const saveMutation = useMutation({
    mutationFn: () => apiFetch(`/brand/partner/${partner.id}`, { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: () => { toast({ title: 'Branding saved', description: `${form.displayName} theme updated.` }); onClose(); },
    onError: () => toast({ title: 'Failed to save branding', variant: 'destructive' }),
  });

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label htmlFor="display-name">Display Name</Label>
        <Input id="display-name" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="e.g. Acme Learning Portal" />
        <p className="text-xs text-muted-foreground">Shown to learners in place of "Synops Praxis".</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="logo-url">Logo</Label>
        <Input id="logo-url" type="url" value={form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="https://cdn.example.com/logo.svg" />
        {/* Parity with the Create-partner flow: let admins UPLOAD a logo, not only paste a URL. */}
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-primary hover:underline">
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try { const img = await readImage(file); setForm(f => ({ ...f, logoUrl: img.dataUrl })); } catch { toast({ title: 'Could not read that image', variant: 'destructive' }); }
          }} />
          <Upload className="h-4 w-4" /> Upload logo
        </label>
        <p className="text-xs text-muted-foreground">Paste a hosted URL or upload an image file.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="primary-color">Primary Colour</Label>
          <div className="flex items-center gap-2">
            <input id="primary-color" type="color" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} className="h-9 w-12 cursor-pointer rounded border border-input p-0.5" />
            <Input value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} className="font-mono text-sm" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="accent-color">Accent Colour</Label>
          <div className="flex items-center gap-2">
            <input id="accent-color" type="color" value={form.accentColor} onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))} className="h-9 w-12 cursor-pointer rounded border border-input p-0.5" />
            <Input value={form.accentColor} onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))} className="font-mono text-sm" />
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-border p-4 flex items-center gap-3" style={{ borderLeftColor: form.primaryColor, borderLeftWidth: 4 }}>
        {form.logoUrl ? (
          <img src={form.logoUrl} alt="Logo preview" className="h-8 w-auto object-contain" />
        ) : (
          <div className="h-8 w-8 rounded flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: form.primaryColor }}>
            {form.displayName?.[0] ?? 'P'}
          </div>
        )}
        <span className="font-serif font-bold text-sm" style={{ color: form.primaryColor }}>{form.displayName}</span>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : 'Save Branding'}</Button>
      </div>
    </div>
  );
}

function PartnerDetailDialog({ partner, onClose }: { partner: Partner | null; onClose: () => void }) {
  if (!partner) return null;
  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="font-serif flex items-center gap-2"><Building className="h-4 w-4 text-muted-foreground" />{partner.name}</DialogTitle>
      </DialogHeader>
      <Tabs defaultValue="branding">
        <TabsList className="w-full">
          <TabsTrigger value="branding" className="flex-1"><Palette className="h-3.5 w-3.5 mr-1.5" />Branding</TabsTrigger>
          <TabsTrigger value="settings" className="flex-1"><Settings2 className="h-3.5 w-3.5 mr-1.5" />Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="branding" className="mt-4"><BrandingPanel partner={partner} onClose={onClose} /></TabsContent>
        <TabsContent value="settings" className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>Tenant Slug</Label>
            <Input value={partner.slug} readOnly className="font-mono text-sm bg-muted" />
            <p className="text-xs text-muted-foreground">URL prefix, contact platform support to change.</p>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <div>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${partner.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{partner.status}</span>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

export function AdminPartners() {
  const { data: partners, isLoading, refetch } = useListPartners();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Master key: a super admin enters a partner's hub by selecting it as the active partner and
  // navigating to /partner. The selection persists (localStorage), so the hub stays put on refresh.
  const enterPartner = (id: string) => { setActivePartner(id); navigate('/partner'); };

  const [createOpen, setCreateOpen] = useState(false);
  const [showDevTools, setShowDevTools] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  // One-click provisioning of the real Enza Global Media partner (brand + 15 courses + content).
  const seedEnza = useMutation({
    mutationFn: () => apiFetch<{ created: boolean; courses?: number; message?: string }>('/platform/seed-enza', { method: 'POST' }),
    onSuccess: (r) => {
      refetch(); qc.invalidateQueries({ queryKey: ['partners'] }); qc.invalidateQueries({ queryKey: ['courses'] });
      toast({ title: r.created ? 'Enza Global provisioned' : 'Already provisioned', description: r.created ? `${r.courses} branded courses created and assigned to Enza Global Media.` : (r.message ?? 'Enza partner already exists.') });
    },
    onError: (e: any) => toast({ title: 'Could not provision Enza', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Hard-delete a partner and all its data (super admin).
  const deletePartner = useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted?: string }>(`/partners/${id}`, { method: 'DELETE' }),
    onSuccess: (r) => { refetch(); qc.invalidateQueries({ queryKey: ['partners'] }); toast({ title: 'Partner deleted', description: `${r?.deleted ?? 'Partner'} and all its organisations, learners and data were removed.` }); },
    onError: (e: any) => toast({ title: 'Could not delete partner', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Build every Enza module into a full lesson (slides, video, readings, case, assignment, workshop).
  const enrich = useMutation({
    mutationFn: () => apiFetch<{ modules: number; enriched: number; error?: string }>('/platform/enrich-enza', { method: 'POST' }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['courses'] });
      toast({ title: 'Full courses built', description: `${r.modules} modules processed, ${r.enriched} newly built out.${r.error ? ' First error: ' + r.error : ''}` });
    },
    onError: (e: any) => toast({ title: 'Could not build courses', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Re-point the demo learners' progress at the current content after a rebuild (fixes low completion / wrong off-track).
  const resync = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; learners?: number; beats?: number; message?: string }>('/platform/resync-enza-progress', { method: 'POST' }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['courses'] }); toast({ title: r.ok ? 'Learner progress resynced' : 'Nothing to resync', description: r.ok ? `${r.learners} learners re-pointed to current content (${r.beats} progress records), off-track status recomputed, stale notifications cleared.` : (r.message ?? 'Seed the cohort first.') }); },
    onError: (e: any) => toast({ title: 'Could not resync', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Reset Enza back to an empty branded partner: wipe every org, the whole cohort, partner-owned
  // courses and seeded hub data. Keeps the partner, its branding, and the partner admin login.
  const resetEnza = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; partner?: string }>('/platform/reset-enza', { method: 'POST' }),
    onSuccess: (r) => {
      refetch(); qc.invalidateQueries({ queryKey: ['partners'] }); qc.invalidateQueries({ queryKey: ['organisations'] }); qc.invalidateQueries({ queryKey: ['courses'] });
      toast({ title: 'Enza reset', description: `${r.partner ?? 'Enza'} is now an empty branded partner. Start building from here.` });
    },
    onError: (e: any) => toast({ title: 'Could not reset Enza', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Provision the MRB executive programme as PRACTICE CREDENTIALS (Option 5): creates the credential
  // catalogue + demo candidate, replacing the course-based experience. Runs the table migration too.
  const seedMrbPractice = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; credentials?: number }>('/platform/seed-mrb-practice', { method: 'POST' }),
    onSuccess: (r) => {
      refetch(); qc.invalidateQueries({ queryKey: ['partners'] });
      toast({ title: 'Practice Credentials provisioned', description: `${r.credentials ?? 0} credentials created for the MRB programme.` });
    },
    onError: (e: any) => toast({ title: 'Could not provision Practice Credentials', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Provision the Educator Professional Development demo (Thoughtful AI in teaching): a separate partner
  // reusing the whole practice engine, with adult-learning-grounded credentials and a demo educator.
  const seedEducatorPd = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; credentials?: number }>('/platform/seed-educator-pd', { method: 'POST' }),
    onSuccess: (r) => {
      refetch(); qc.invalidateQueries({ queryKey: ['partners'] });
      toast({ title: 'Educator PD demo provisioned', description: `${r.credentials ?? 0} credentials created. Enter at /demos/educator.` });
    },
    onError: (e: any) => toast({ title: 'Could not provision Educator PD demo', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Provision the PEJ Justice Practice demo: a justice-sector practice-credentials class (prosecutors /
  // investigators) drawn from the PEJ-EVD-01 objectives, reusing the whole practice engine with coach Mira.
  const seedPejPractice = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; credentials?: number }>('/platform/seed-pej-practice', { method: 'POST' }),
    onSuccess: (r) => {
      refetch(); qc.invalidateQueries({ queryKey: ['partners'] });
      toast({ title: 'PEJ Justice Practice demo provisioned', description: `${r.credentials ?? 0} credentials created. Enter at /demos/pej-practice.` });
    },
    onError: (e: any) => toast({ title: 'Could not provision PEJ Justice Practice demo', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Build the Educator "Teaching Well with AI" demo COURSE into the Educator partner's org.
  const seedEducatorCourse = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; created?: boolean; message?: string }>('/platform/seed-educator-course', { method: 'POST' }),
    onSuccess: (r) => {
      refetch(); qc.invalidateQueries({ queryKey: ['partners'] }); qc.invalidateQueries({ queryKey: ['courses'] });
      toast({ title: 'Educator demo course ready', description: r.message ?? 'Built and assigned to the Educator org.' });
    },
    onError: (e: any) => toast({ title: 'Could not build the Educator course', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Build the PEJ Justice demo COURSE into the PEJ partner's org (populates its Courses list).
  const seedPejCourse = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; created?: boolean; message?: string }>('/platform/seed-pej-course', { method: 'POST' }),
    onSuccess: (r) => {
      refetch(); qc.invalidateQueries({ queryKey: ['partners'] }); qc.invalidateQueries({ queryKey: ['courses'] });
      toast({ title: 'PEJ demo course ready', description: r.message ?? 'Built and assigned to the PEJ org.' });
    },
    onError: (e: any) => toast({ title: 'Could not build the PEJ course', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // One-off cleanup: permanently delete the stray "Leading with Purpose" MRB course (all copies). MRB's
  // demo is its practice credentials (/practice), not this course.
  const deleteStrayMrbCourse = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; deleted?: number }>('/courses/_delete-by-title', { method: 'POST', body: JSON.stringify({ title: 'Leading with Purpose · Zambian Clinician Leadership' }) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['courses'] });
      toast({ title: 'Old MRB course deleted', description: `${r.deleted ?? 0} course${r.deleted === 1 ? '' : 's'} permanently removed. MRB's demo is its practice credentials.` });
    },
    onError: (e: any) => toast({ title: 'Could not delete the course', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Delete every learner-role account and its learning records across the whole platform. Keeps
  // courses, organisations, coaches and admins.
  const removeLearners = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; removed?: number }>('/platform/remove-all-learners', { method: 'POST' }),
    onSuccess: (r) => {
      refetch(); qc.invalidateQueries({ queryKey: ['partners'] }); qc.invalidateQueries({ queryKey: ['organisations'] });
      toast({ title: 'Learners removed', description: `${r.removed ?? 0} learner account${r.removed === 1 ? '' : 's'} deleted across the platform.` });
    },
    onError: (e: any) => toast({ title: 'Could not remove learners', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Seed 10 high-demand South African skills courses (platform-owned), assigned to Enza.
  const seedSkills = useMutation({
    mutationFn: () => apiFetch<{ total: number; created: number; assigned: number; error?: string }>('/platform/seed-skills-catalog', { method: 'POST' }),
    onSuccess: (r) => {
      refetch(); qc.invalidateQueries({ queryKey: ['courses'] });
      toast({ title: 'SA skills catalogue seeded', description: `${r.created} new courses created, ${r.assigned} assigned to Enza (of ${r.total}).${r.error ? ' First error: ' + r.error : ''} Run "Build Full Courses" next to fully build every module.` });
    },
    onError: (e: any) => toast({ title: 'Could not seed skills catalogue', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Seed the 3 priority flagship courses (Business Model Canvas, Costing/Pricing/Margin, Compliance), assigned to Enza.
  const seedFlagship = useMutation({
    mutationFn: () => apiFetch<{ total: number; created: number; assigned: number; error?: string }>('/platform/seed-flagship-courses', { method: 'POST' }),
    onSuccess: (r) => {
      refetch(); qc.invalidateQueries({ queryKey: ['courses'] });
      toast({ title: 'Flagship courses seeded', description: `${r.created} new courses created, ${r.assigned} assigned to Enza (of ${r.total}).${r.error ? ' First error: ' + r.error : ''} Run "Build Full Courses" next to fully build every module.` });
    },
    onError: (e: any) => toast({ title: 'Could not seed flagship courses', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Seed a realistic delivery cohort (org + admin + coach + 4 learners at different levels) under Enza.
  const seedCohort = useMutation({
    mutationFn: () => apiFetch<{ created: boolean; learners?: number; message?: string }>('/platform/seed-enza-cohort', { method: 'POST' }),
    onSuccess: (r) => {
      refetch(); qc.invalidateQueries({ queryKey: ['partners'] });
      toast({ title: r.created ? 'Enza cohort seeded' : 'Learner logins refreshed', description: r.message ?? (r.created ? `Organisation, org admin, coach and ${r.learners} learners created.` : 'Cohort already exists.') });
    },
    onError: (e: any) => toast({ title: 'Could not seed cohort', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Provision the public Synops Demo tenant (demo.synops-consulting.com): partner + graphite/amber
  // brand + org + cohort + Demo Learner/Admin, reusing Enza's course catalogue and pre-filling progress.
  const seedSynopsDemo = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; courses?: number; learners?: number; message?: string }>('/platform/seed-synops-demo', { method: 'POST' }),
    onSuccess: (r) => {
      refetch(); qc.invalidateQueries({ queryKey: ['partners'] });
      toast({ title: 'Synops Demo ready', description: r.message ?? `${r.courses} courses, ${r.learners} learners.` });
    },
    onError: (e: any) => toast({ title: 'Could not seed Synops Demo', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Provision the public K-12 demo tenant (praxis.synops-consulting.com/k12): Grade-6 courses across
  // Math/ELA/Science/Social Studies/History (CCSS/NGSS/C3) + Maya (standard) and Leo (accommodations).
  const seedK12 = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; courses?: number; learners?: number; standards?: number; message?: string }>('/platform/seed-k12', { method: 'POST' }),
    onSuccess: (r) => {
      refetch(); qc.invalidateQueries({ queryKey: ['partners'] });
      toast({ title: 'Synops K-12 ready', description: r.message ?? `${r.courses} courses, ${r.standards} standards, ${r.learners} learners.` });
    },
    onError: (e: any) => toast({ title: 'Could not seed Synops K-12', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  // Seed the reusable Game Library repository (Jeopardy, Feud, Bingo, Password, Wheel, Escape Room per
  // grade band) + a curated linked catalog of commercial titles. Platform library, browsable by every tenant.
  const seedGameLibrary = useMutation({
    mutationFn: () => apiFetch<{ games: number; catalog: number; created: number; updated: number }>('/platform/seed-game-library', { method: 'POST' }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['activities'] });
      toast({ title: 'Game Library ready', description: `${r.games} game activities + ${r.catalog} catalog links (${r.created} new, ${r.updated} updated).` });
    },
    onError: (e: any) => toast({ title: 'Could not seed Game Library', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-4xl font-serif font-bold tracking-tight">Partner Management</h1>
          <p className="text-muted-foreground">Provision partner tenants with white-label branding, a first admin, and starter courses.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setShowDevTools((v) => !v)} title="Data-seeding / maintenance tools">
            <Wrench className="h-4 w-4 mr-2" /> Internal tools
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Create partner</Button>
            </DialogTrigger>
            {createOpen && (
              <CreatePartnerDialog
                onClose={() => setCreateOpen(false)}
                onCreated={() => { refetch(); qc.invalidateQueries({ queryKey: ['courses'] }); }}
              />
            )}
          </Dialog>
        </div>
      </div>

      {showDevTools && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p><strong>Data-seeding &amp; maintenance tools.</strong> These write demo data and can overwrite partner/course/learner records. Each asks for confirmation. Do not run casually against live tenants.</p>
            </div>
            {/* Enza Global Media: provision the real partner, its course catalogue, and reset. */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800/80 dark:text-amber-300/80 mb-1.5">Enza Global Media</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={seedEnza.isPending}
                  onClick={() => { if (window.confirm('Provision Enza Global Media (brand + 15 courses)? This writes/overwrites partner + course records. No demo org or learners are created.')) seedEnza.mutate(); }}
                  title="Provision Enza Global Media with brand + platform courses">
                  {seedEnza.isPending ? 'Provisioning…' : 'Provision Enza Global'}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={seedSkills.isPending}
                  onClick={() => { if (window.confirm('Seed the 10 high-demand SA skills courses (NQF/SETA-mapped) and assign them to Enza? Run "Build Full Courses" afterwards to fully build every module.')) seedSkills.mutate(); }}
                  title="Seed 10 in-demand South African vocational courses and assign to Enza">
                  {seedSkills.isPending ? 'Seeding…' : 'Seed SA Skills Catalogue'}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={seedFlagship.isPending}
                  onClick={() => { if (window.confirm('Seed the 3 flagship courses (Business Model Canvas, Costing/Pricing/Margin, Compliance Essentials) and assign them to Enza? Run "Build Full Courses" afterwards to fully build every module.')) seedFlagship.mutate(); }}
                  title="Seed the 3 priority flagship courses (8-module architecture) and assign to Enza">
                  {seedFlagship.isPending ? 'Seeding…' : 'Seed Flagship Courses'}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={enrich.isPending}
                  onClick={() => { if (window.confirm('Build Full Courses? This REBUILDS every Enza course module, generating full lesson content (beats + readings) from each module title and objectives. It REPLACES existing content; learner progress may need a resync afterward. Continue?')) enrich.mutate(); }}
                  title="Generate full lesson content (beats + readings) for every Enza module from its title/objectives">
                  {enrich.isPending ? 'Building…' : 'Build Full Courses'}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={seedCohort.isPending}
                  onClick={() => { if (window.confirm('Seed the Enza DEMO cohort? This creates a demo organisation (Enza SMME Academy), an org admin, a coach and 4 demo learners. Only run this if you want demo delivery data. Continue?')) seedCohort.mutate(); }}
                  title="Seed a demo Enza delivery cohort (creates a demo organisation + learners)">
                  {seedCohort.isPending ? 'Seeding…' : 'Seed Enza Cohort (demo)'}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={resync.isPending}
                  onClick={() => { if (window.confirm('Resync demo learner progress against the current content?')) resync.mutate(); }}
                  title="Re-point the demo learners' progress at the current content">
                  {resync.isPending ? 'Resyncing…' : 'Resync Learner Progress'}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-400" disabled={resetEnza.isPending}
                  onClick={() => { if (window.confirm('RESET ENZA to a bare shell: permanently delete ALL of Enza\'s organisations, its whole cohort (learners, coaches, org admins), the seeded Enza Faculty login, partner-owned courses, seeded hub data, and unassign all courses. ONLY the partner, its branding and the partner-admin login remain. This cannot be undone. Continue?')) resetEnza.mutate(); }}
                  title="Wipe Enza's seeded content down to a bare branded partner">
                  <Trash2 className="h-4 w-4 mr-2" /> {resetEnza.isPending ? 'Resetting…' : 'Reset Enza (wipe content)'}
                </Button>
              </div>
            </div>

            {/* Demos & other programmes: each is its own partner/tenant. */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800/80 dark:text-amber-300/80 mb-1.5">Demos &amp; other programmes</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={seedSynopsDemo.isPending}
                  onClick={() => { if (window.confirm('Provision the public Synops Demo tenant (demo.synops-consulting.com): partner, brand, cohort, Demo Learner/Admin, reusing Enza courses?')) seedSynopsDemo.mutate(); }}
                  title="Provision the Synops Demo tenant for demo.synops-consulting.com">
                  {seedSynopsDemo.isPending ? 'Provisioning…' : 'Seed Synops Demo'}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={seedK12.isPending}
                  onClick={() => { if (window.confirm('Provision the public K-12 demo (praxis.synops-consulting.com/k12): Grade-6 Math/ELA/Science/Social Studies/History aligned to Common Core, NGSS and C3, plus Maya (standard) and Leo (accommodations)?')) seedK12.mutate(); }}
                  title="Provision the Synops K-12 demo tenant for praxis.synops-consulting.com/k12">
                  {seedK12.isPending ? 'Provisioning…' : 'Seed K-12 Demo'}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={seedMrbPractice.isPending}
                  onClick={() => { if (window.confirm('Provision the MRB executive programme as PRACTICE CREDENTIALS (Option 5)? Creates the credential catalogue + demo candidate. Safe to re-run.')) seedMrbPractice.mutate(); }}
                  title="Provision the MRB executive programme as Practice Credentials">
                  {seedMrbPractice.isPending ? 'Provisioning…' : 'Provision MRB Practice'}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={seedEducatorPd.isPending}
                  onClick={() => { if (window.confirm('Provision the Educator PD demo (Thoughtful AI in teaching)? Creates a separate partner, 6 credentials, branding and demo educator Maria Alvarez. Safe to re-run. Enter at /demos/educator.')) seedEducatorPd.mutate(); }}
                  title="Provision the Educator Professional Development demo class">
                  {seedEducatorPd.isPending ? 'Provisioning…' : 'Provision Educator PD demo'}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={seedPejPractice.isPending}
                  onClick={() => { if (window.confirm('Provision the PEJ Justice Practice demo (prosecutors/investigators, from PEJ-EVD-01)? Creates a separate partner, 6 credentials, serious branding and a demo investigator. Composite and SME-pending. Safe to re-run. Enter at /demos/pej-practice.')) seedPejPractice.mutate(); }}
                  title="Provision the PEJ Justice Practice demo class">
                  {seedPejPractice.isPending ? 'Provisioning…' : 'Provision PEJ Justice demo'}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={seedPejCourse.isPending}
                  onClick={() => { if (window.confirm('Build the PEJ Justice demo COURSE (Justice-Sector Practice: Sound Decisions Under Pressure) and add it to the PEJ org\'s Courses? Safe to re-run.')) seedPejCourse.mutate(); }}
                  title="Build the PEJ Justice demo course into the PEJ org">
                  {seedPejCourse.isPending ? 'Building…' : 'Build PEJ demo course'}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={seedEducatorCourse.isPending}
                  onClick={() => { if (window.confirm('Build the Educator demo COURSE (Teaching Well with AI) and add it to the Educator org\'s Courses? Safe to re-run.')) seedEducatorCourse.mutate(); }}
                  title="Build the Educator demo course into the Educator org">
                  {seedEducatorCourse.isPending ? 'Building…' : 'Build Educator demo course'}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={seedGameLibrary.isPending}
                  onClick={() => { if (window.confirm('Seed the reusable Game Library: Jeopardy, Family Feud, Bingo, Password, Wheel/Guess-the-Word and Escape Room per grade band, plus a curated catalog of commercial titles. Safe to re-run.')) seedGameLibrary.mutate(); }}
                  title="Seed the shared Game Library repository of ready-to-use game activities">
                  {seedGameLibrary.isPending ? 'Seeding…' : 'Seed Game Library'}
                </Button>
              </div>
            </div>

            {/* Platform tools + destructive maintenance. */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800/80 dark:text-amber-300/80 mb-1.5">Platform tools</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <ShipCoursesButton />
                <Button variant="outline" size="sm" className="w-full justify-start border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-400" disabled={deleteStrayMrbCourse.isPending}
                  onClick={() => { if (window.confirm('Permanently delete the old "Leading with Purpose · Zambian Clinician Leadership" course (all copies) and everything in it? MRB\'s demo is its practice credentials, not this course. This cannot be undone.')) deleteStrayMrbCourse.mutate(); }}
                  title="Permanently delete the stray MRB course">
                  {deleteStrayMrbCourse.isPending ? 'Deleting…' : 'Delete old MRB course'}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-400" disabled={removeLearners.isPending}
                  onClick={() => { if (window.confirm('REMOVE ALL LEARNERS: permanently delete EVERY learner/student account and its progress, submissions and enrolments across the ENTIRE platform (all partners). Courses, organisations, coaches and admins are kept. This cannot be undone. Continue?')) removeLearners.mutate(); }}
                  title="Delete every learner account and its records platform-wide">
                  <Trash2 className="h-4 w-4 mr-2" /> {removeLearners.isPending ? 'Removing…' : 'Remove all learners (platform-wide)'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-4 font-medium">Partner</th>
                  <th className="px-6 py-4 font-medium">Slug</th>
                  <th className="px-6 py-4 font-medium">Orgs</th>
                  <th className="px-6 py-4 font-medium">Learners</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-4 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y border-t border-border">
                {isLoading && (<tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading partners…</td></tr>)}
                {!isLoading && !(partners as Partner[] | undefined)?.length && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No partners yet. Create your first one.</td></tr>
                )}
                {(partners as Partner[] | undefined)?.map(partner => (
                  <tr key={partner.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: partner.primaryColor ?? 'hsl(222,47%,11%)' }}>
                          {partner.logoUrl ? <img src={partner.logoUrl} alt="" className="h-5 w-5 object-contain" /> : (partner.displayName ?? partner.name)[0]}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{partner.displayName ?? partner.name}</p>
                          {partner.displayName && partner.displayName !== partner.name && (<p className="text-xs text-muted-foreground">{partner.name}</p>)}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground font-mono text-xs">{partner.slug}</td>
                    <td className="px-6 py-4">{partner.orgCount ?? 0}</td>
                    <td className="px-6 py-4">{partner.learnerCount ?? 0}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${partner.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{partner.status}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => enterPartner(partner.id)} title={`Open ${partner.name}'s hub as super admin`}>
                          Enter hub <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                        <a href={partner.slug === 'enza-global' ? '/enzaglobalmedia' : `/p/${partner.slug}`} target="_blank" rel="noreferrer">
                          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Open landing page"><Building className="h-4 w-4" /></Button>
                        </a>
                        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Configure branding" onClick={() => setSelectedPartner(partner)}><Palette className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-600 hover:text-red-700" title="Delete partner" disabled={deletePartner.isPending}
                          onClick={() => { if (window.confirm(`Delete partner "${partner.name}" and ALL its organisations, learners, courses and data? This cannot be undone.`)) deletePartner.mutate(partner.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedPartner} onOpenChange={open => { if (!open) setSelectedPartner(null); }}>
        <PartnerDetailDialog partner={selectedPartner} onClose={() => setSelectedPartner(null)} />
      </Dialog>
    </div>
  );
}

/** Super-admin bulk "ship completed courses to a partner": pick a partner, multi-select platform
 * courses, and add them to that partner's pool in one go (idempotent). */
function ShipCoursesButton() {
  const { toast } = useToast();
  const { data: partnersData } = useListPartners();
  const partnerList: Array<{ id: string; name: string }> = Array.isArray(partnersData)
    ? (partnersData as any) : ((partnersData as any)?.partners ?? []);
  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const { data: courses = [] } = useQuery({
    queryKey: ['shippable-courses'],
    queryFn: () => apiFetch<Array<{ id: string; title: string; status: string | null }>>('/courses/shippable'),
    enabled: open,
  });
  const ship = useMutation({
    mutationFn: () => apiFetch<{ shipped: number }>('/platform/ship-courses', { method: 'POST', body: JSON.stringify({ partnerId, courseIds: [...sel] }) }),
    onSuccess: (r) => {
      const pn = partnerList.find((p) => p.id === partnerId)?.name ?? 'the partner';
      toast({ title: 'Courses shipped', description: `${r.shipped} course${r.shipped === 1 ? '' : 's'} added to ${pn}. They can now allocate them to organisations.` });
      setOpen(false); setSel(new Set());
    },
    onError: (e: any) => toast({ title: 'Could not ship courses', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start gap-1.5"><ArrowRight className="h-4 w-4" /> Ship courses to partner</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-w-[calc(100vw-2rem)] overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 min-w-0"><BookOpen className="h-5 w-5 text-primary shrink-0" /> <span className="truncate">Ship completed courses to a partner</span></DialogTitle>
        </DialogHeader>
        <div className="space-y-4 min-w-0">
          <div className="min-w-0">
            <Label className="text-xs">Partner</Label>
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}
              className="mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select a partner…</option>
              {partnerList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <Label className="text-xs">Courses ({sel.size} selected)</Label>
            <div className="mt-1 max-h-64 overflow-y-auto overflow-x-hidden rounded-md border border-border divide-y">
              {courses.length === 0 && <div className="p-3 text-sm text-muted-foreground">No platform courses found. Adopt courses to the platform first.</div>}
              {courses.map((c) => (
                <label key={c.id} className="flex items-center gap-2.5 p-2.5 text-sm cursor-pointer hover:bg-muted/30 min-w-0">
                  <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{c.title}</span>
                  {c.status && <span className="text-[11px] text-muted-foreground capitalize shrink-0">{c.status}</span>}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!partnerId || sel.size === 0 || ship.isPending} onClick={() => ship.mutate()} className="gap-1.5">
              <ArrowRight className="h-4 w-4" /> {ship.isPending ? 'Shipping…' : `Ship ${sel.size || ''} course${sel.size === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
