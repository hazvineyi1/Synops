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
import { Building, Plus, Palette, Settings2, Upload, Sparkles, Mail, BookOpen, Check, Copy, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

  const slug = form.slugTouched && form.slug ? form.slug : slugify(form.name);

  const { data: courses } = useQuery({
    queryKey: ['courses'],
    queryFn: () => apiFetch<CourseLite[]>('/courses'),
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
        body: JSON.stringify({ name: form.name.trim(), slug, contactEmail: form.contactEmail.trim() }),
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

  const canCreate = form.name.trim().length > 1 && !!slug && form.contactEmail.includes('@');

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
              <Input value={slug} onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value), slugTouched: true }))} className="font-mono text-sm" />
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
              {aiGen.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Generate colours from logo
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
          <div className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4 text-primary" /> First partner admin <span className="text-muted-foreground font-normal text-xs">(optional — emailed a set-password link)</span></div>
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
        <Label htmlFor="logo-url">Logo URL</Label>
        <Input id="logo-url" type="url" value={form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="https://cdn.example.com/logo.svg" />
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
            <p className="text-xs text-muted-foreground">URL prefix — contact platform support to change.</p>
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

  const [createOpen, setCreateOpen] = useState(false);
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

  // Seed a realistic delivery cohort (org + admin + coach + 4 learners at different levels) under Enza.
  const seedCohort = useMutation({
    mutationFn: () => apiFetch<{ created: boolean; learners?: number; message?: string }>('/platform/seed-enza-cohort', { method: 'POST' }),
    onSuccess: (r) => {
      refetch(); qc.invalidateQueries({ queryKey: ['partners'] });
      toast({ title: r.created ? 'Enza cohort seeded' : 'Learner logins refreshed', description: r.message ?? (r.created ? `Organisation, org admin, coach and ${r.learners} learners created.` : 'Cohort already exists.') });
    },
    onError: (e: any) => toast({ title: 'Could not seed cohort', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight">Partner Management</h1>
          <p className="text-muted-foreground">Provision partner tenants with white-label branding, a first admin, and starter courses.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={seedEnza.isPending} onClick={() => seedEnza.mutate()} title="Provision Enza Global Media with brand + 15 courses">
            {seedEnza.isPending ? 'Provisioning…' : 'Provision Enza Global'}
          </Button>
          <Button variant="outline" disabled={enrich.isPending} onClick={() => enrich.mutate()} title="Build every Enza module into a full lesson (slides, video, readings, case, assignment, workshop)">
            {enrich.isPending ? 'Building…' : 'Build Full Courses'}
          </Button>
          <Button variant="outline" disabled={seedCohort.isPending} onClick={() => seedCohort.mutate()} title="Seed a realistic Enza delivery cohort (org, admin, coach, 4 learners)">
            {seedCohort.isPending ? 'Seeding…' : 'Seed Enza Cohort'}
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
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
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
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a href={`/p/${partner.slug}`} target="_blank" rel="noreferrer">
                          <Button variant="outline" size="sm" className="gap-1.5"><Building className="h-3.5 w-3.5" />Landing</Button>
                        </a>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSelectedPartner(partner)}><Palette className="h-3.5 w-3.5" />Configure</Button>
                        <Button variant="ghost" size="sm" className="gap-1.5 text-red-600 hover:text-red-700" disabled={deletePartner.isPending}
                          onClick={() => { if (window.confirm(`Delete partner "${partner.name}" and ALL its organisations, learners, courses and data? This cannot be undone.`)) deletePartner.mutate(partner.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />Delete
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
