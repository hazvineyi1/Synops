import React, { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2 } from 'lucide-react';

/**
 * Public "request access" form (SA-2). Prospective facilitators / instructional designers
 * submit here; a super admin reviews from the platform console. Learners sign in instead.
 */
export function RequestAccess() {
  const [f, setF] = useState({
    firstName: '',
    lastName: '',
    email: '',
    organisationName: '',
    requestedRole: 'org_admin',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/access-requests', { method: 'POST', body: JSON.stringify(f) });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Request access to Synops Praxis</CardTitle>
          <CardDescription>Tell us who you are and we'll be in touch. Existing learners should sign in instead.</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-10 w-10 text-teal-600 mx-auto mb-3" />
              <p className="font-medium">Request received</p>
              <p className="text-sm text-muted-foreground mt-1">Our team will review it and reach out by email.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="First name" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} />
                <Input placeholder="Last name" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} />
              </div>
              <Input placeholder="Work email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
              <Input placeholder="Organisation" value={f.organisationName} onChange={(e) => set('organisationName', e.target.value)} />
              <select
                value={f.requestedRole}
                onChange={(e) => set('requestedRole', e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="org_admin">Organisation admin / facilitator</option>
                <option value="instructional_designer">Instructional designer</option>
                <option value="coach">Co-facilitator / coach</option>
              </select>
              <textarea
                placeholder="Anything we should know? (optional)"
                value={f.message}
                onChange={(e) => set('message', e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button className="w-full" onClick={submit} disabled={!f.firstName || !f.email || submitting}>
                {submitting ? 'Sending…' : 'Submit request'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
