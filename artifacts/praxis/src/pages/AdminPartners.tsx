import React, { useState } from 'react';
import { useListPartners, useCreatePartner } from '@workspace/api-client-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building, Plus, MoreVertical, Palette, Settings2 } from 'lucide-react';
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

function BrandingPanel({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    displayName: partner.displayName ?? partner.name,
    logoUrl: partner.logoUrl ?? '',
    primaryColor: partner.primaryColor ?? '#1e293b',
    accentColor: '#6366f1',
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/brand/partner/${partner.id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      toast({ title: 'Branding saved', description: `${form.displayName} theme updated.` });
      onClose();
    },
    onError: () => toast({ title: 'Failed to save branding', variant: 'destructive' }),
  });

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label htmlFor="display-name">Display Name</Label>
        <Input
          id="display-name"
          value={form.displayName}
          onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
          placeholder="e.g. Acme Learning Portal"
        />
        <p className="text-xs text-muted-foreground">Shown to learners in place of "Synops Praxis".</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="logo-url">Logo URL</Label>
        <Input
          id="logo-url"
          type="url"
          value={form.logoUrl}
          onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
          placeholder="https://cdn.example.com/logo.svg"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="primary-color">Primary Colour</Label>
          <div className="flex items-center gap-2">
            <input
              id="primary-color"
              type="color"
              value={form.primaryColor}
              onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
              className="h-9 w-12 cursor-pointer rounded border border-input p-0.5"
            />
            <Input
              value={form.primaryColor}
              onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="accent-color">Accent Colour</Label>
          <div className="flex items-center gap-2">
            <input
              id="accent-color"
              type="color"
              value={form.accentColor}
              onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))}
              className="h-9 w-12 cursor-pointer rounded border border-input p-0.5"
            />
            <Input
              value={form.accentColor}
              onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))}
              className="font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {/* Live preview swatch */}
      <div
        className="rounded-lg border border-border p-4 flex items-center gap-3"
        style={{ borderLeftColor: form.primaryColor, borderLeftWidth: 4 }}
      >
        {form.logoUrl ? (
          <img src={form.logoUrl} alt="Logo preview" className="h-8 w-auto object-contain" />
        ) : (
          <div
            className="h-8 w-8 rounded flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: form.primaryColor }}
          >
            {form.displayName?.[0] ?? 'P'}
          </div>
        )}
        <span className="font-serif font-bold text-sm" style={{ color: form.primaryColor }}>
          {form.displayName}
        </span>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving…' : 'Save Branding'}
        </Button>
      </div>
    </div>
  );
}

function PartnerDetailDialog({ partner, onClose }: { partner: Partner | null; onClose: () => void }) {
  if (!partner) return null;
  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="font-serif flex items-center gap-2">
          <Building className="h-4 w-4 text-muted-foreground" />
          {partner.name}
        </DialogTitle>
      </DialogHeader>
      <Tabs defaultValue="branding">
        <TabsList className="w-full">
          <TabsTrigger value="branding" className="flex-1">
            <Palette className="h-3.5 w-3.5 mr-1.5" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex-1">
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="mt-4">
          <BrandingPanel partner={partner} onClose={onClose} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>Tenant Slug</Label>
            <Input value={partner.slug} readOnly className="font-mono text-sm bg-muted" />
            <p className="text-xs text-muted-foreground">URL prefix — contact platform support to change.</p>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <div>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider
                ${partner.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                {partner.status}
              </span>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

export function AdminPartners() {
  const { data: partners, isLoading, refetch } = useListPartners();
  const createPartner = useCreatePartner();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [formData, setFormData] = useState({ name: '', slug: '', contactEmail: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createPartner.mutate(
      { data: formData },
      {
        onSuccess: () => {
          toast({ title: 'Partner Created', description: `${formData.name} tenant provisioned successfully.` });
          setCreateOpen(false);
          setFormData({ name: '', slug: '', contactEmail: '' });
          refetch();
        },
      }
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight">Partner Management</h1>
          <p className="text-muted-foreground">Provision organisations and configure white-label branding.</p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Provision Partner</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-serif">New Partner Tenant</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Partner Name</Label>
                <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Tenant Slug</Label>
                <Input
                  value={formData.slug}
                  onChange={e => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="e.g. acme-corp"
                  required
                  pattern="[a-z0-9-]+"
                />
                <p className="text-xs text-muted-foreground">Lowercase letters, numbers, hyphens only.</p>
              </div>
              <div className="space-y-2">
                <Label>Admin Contact Email</Label>
                <Input type="email" value={formData.contactEmail} onChange={e => setFormData({ ...formData, contactEmail: e.target.value })} required />
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createPartner.isPending}>
                  {createPartner.isPending ? 'Provisioning…' : 'Create Tenant'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Partner list */}
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
                {isLoading && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading partners…</td></tr>
                )}
                {(partners as Partner[] | undefined)?.map(partner => (
                  <tr key={partner.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-8 w-8 rounded flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: partner.primaryColor ?? 'hsl(222,47%,11%)' }}
                        >
                          {partner.logoUrl
                            ? <img src={partner.logoUrl} alt="" className="h-5 w-5 object-contain" />
                            : (partner.displayName ?? partner.name)[0]}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{partner.displayName ?? partner.name}</p>
                          {partner.displayName && partner.displayName !== partner.name && (
                            <p className="text-xs text-muted-foreground">{partner.name}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground font-mono text-xs">{partner.slug}</td>
                    <td className="px-6 py-4">{partner.orgCount ?? 0}</td>
                    <td className="px-6 py-4">{partner.learnerCount ?? 0}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider
                        ${partner.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                        {partner.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setSelectedPartner(partner)}
                      >
                        <Palette className="h-3.5 w-3.5" />
                        Configure
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Partner detail dialog (branding + settings) */}
      <Dialog open={!!selectedPartner} onOpenChange={open => { if (!open) setSelectedPartner(null); }}>
        <PartnerDetailDialog partner={selectedPartner} onClose={() => setSelectedPartner(null)} />
      </Dialog>
    </div>
  );
}
