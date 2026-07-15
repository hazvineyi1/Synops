import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building, Plus, Trash2, UserPlus, Landmark } from 'lucide-react';

type Funder = { id: string; email: string; firstName: string | null; lastName: string | null; status: string; scopeCount: number };
type Scope = { id: string; organisationId: string; organisationName: string | null; courseId: string | null; label: string | null };
type Org = { id: string; name: string };

/**
 * Super-admin funder provisioning (decision doc §10.2). Create funder accounts and grant
 * each read-only, aggregate visibility into the organisations it finances.
 */
export function AdminFunders() {
  const qc = useQueryClient();
  const { data: funders } = useQuery({ queryKey: ['funders'], queryFn: () => apiFetch<Funder[]>('/funders') });
  const { data: orgs } = useQuery({ queryKey: ['organisations'], queryFn: () => apiFetch<Org[]>('/organisations') });
  const [selected, setSelected] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const createFunder = useMutation({
    mutationFn: () => apiFetch('/funders', { method: 'POST', body: JSON.stringify({ email, firstName, lastName }) }),
    onSuccess: () => {
      setEmail('');
      setFirstName('');
      setLastName('');
      qc.invalidateQueries({ queryKey: ['funders'] });
    },
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-serif font-bold tracking-tight">Funders &amp; sponsors</h1>
        <p className="text-muted-foreground">
          Create funder accounts and grant them read-only, aggregate visibility into the organisations they finance.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              New funder
            </CardTitle>
            <CardDescription>Creates an invited account; they set a password via a reset link.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <Input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            {createFunder.isError && <p className="text-sm text-red-600">{(createFunder.error as Error).message}</p>}
            <Button onClick={() => createFunder.mutate()} disabled={!email || createFunder.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              Create funder
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              Funder accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(funders ?? []).length === 0 && <p className="text-sm text-muted-foreground">No funders yet.</p>}
            {(funders ?? []).map((f) => (
              <button
                key={f.id}
                onClick={() => setSelected(f.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selected === f.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {f.firstName || f.email}
                      {f.lastName ? ` ${f.lastName}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">{f.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {f.scopeCount} org{f.scopeCount === 1 ? '' : 's'}
                  </span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {selected && <FunderScopes funderId={selected} orgs={orgs ?? []} />}
    </div>
  );
}

function FunderScopes({ funderId, orgs }: { funderId: string; orgs: Org[] }) {
  const qc = useQueryClient();
  const { data: scopes } = useQuery({
    queryKey: ['funder-scopes', funderId],
    queryFn: () => apiFetch<Scope[]>(`/funders/${funderId}/scopes`),
  });
  const [orgId, setOrgId] = useState('');
  const [label, setLabel] = useState('');

  const addScope = useMutation({
    mutationFn: () => apiFetch(`/funders/${funderId}/scopes`, { method: 'POST', body: JSON.stringify({ organisationId: orgId, label }) }),
    onSuccess: () => {
      setOrgId('');
      setLabel('');
      qc.invalidateQueries({ queryKey: ['funder-scopes', funderId] });
      qc.invalidateQueries({ queryKey: ['funders'] });
    },
  });
  const removeScope = useMutation({
    mutationFn: (id: string) => apiFetch(`/funder-scopes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['funder-scopes', funderId] });
      qc.invalidateQueries({ queryKey: ['funders'] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="h-5 w-5" />
          Funded organisations
        </CardTitle>
        <CardDescription>Each grant gives this funder read-only aggregate visibility into one organisation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select organisation…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <Input placeholder="Label (optional, e.g. 2026 grant)" value={label} onChange={(e) => setLabel(e.target.value)} className="flex-1" />
          <Button onClick={() => addScope.mutate()} disabled={!orgId || addScope.isPending}>
            <Plus className="h-4 w-4 mr-2" />
            Grant
          </Button>
        </div>
        <div className="space-y-2">
          {(scopes ?? []).length === 0 && <p className="text-sm text-muted-foreground">No organisations granted yet.</p>}
          {(scopes ?? []).map((s) => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="font-medium">{s.organisationName ?? s.organisationId}</p>
                {s.label && <p className="text-xs text-muted-foreground">{s.label}</p>}
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeScope.mutate(s.id)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
