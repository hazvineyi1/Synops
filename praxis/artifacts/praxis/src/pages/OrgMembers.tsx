import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useGetMe } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, MoreVertical, Shield, GraduationCap, Briefcase, Trash2 } from 'lucide-react';

type OrgRole = 'learner' | 'coach' | 'org_admin';

interface Member {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  role: string;
  organisationId?: string | null;
}

const ROLE_CONFIG: Record<OrgRole, { label: string; icon: React.ElementType; colour: string }> = {
  learner:   { label: 'Learner',   icon: GraduationCap, colour: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  coach:     { label: 'Coach',     icon: Briefcase,     colour: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300' },
  org_admin: { label: 'Org Admin', icon: Shield,        colour: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
};

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CONFIG[role as OrgRole];
  if (!cfg) return <span className="text-xs text-muted-foreground">{role}</span>;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.colour}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

export function OrgMembers() {
  const { t } = useTranslation();
  const { data: me } = useGetMe();
  const { toast } = useToast();
  const qc = useQueryClient();

  const orgId = me?.organisationId;

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ['org', orgId, 'members'],
    queryFn: () => apiFetch(`/organisations/${orgId}/members`),
    enabled: !!orgId,
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('learner');

  const inviteMutation = useMutation({
    mutationFn: (body: { email: string; role: OrgRole }) =>
      apiFetch(`/organisations/${orgId}/members`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: t('members.memberInvited') });
      qc.invalidateQueries({ queryKey: ['org', orgId, 'members'] });
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('learner');
    },
    onError: () => toast({ title: t('common.error'), variant: 'destructive' }),
  });

  const roleChangeMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: OrgRole }) =>
      apiFetch(`/organisations/${orgId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      toast({ title: t('members.roleChanged') });
      qc.invalidateQueries({ queryKey: ['org', orgId, 'members'] });
    },
    onError: () => toast({ title: t('common.error'), variant: 'destructive' }),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) =>
      apiFetch(`/organisations/${orgId}/members/${memberId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: t('members.memberRemoved') });
      qc.invalidateQueries({ queryKey: ['org', orgId, 'members'] });
    },
    onError: () => toast({ title: t('common.error'), variant: 'destructive' }),
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const initials = (m: Member) =>
    `${m.firstName?.[0] ?? ''}${m.lastName?.[0] ?? ''}`.toUpperCase() || m.email[0].toUpperCase();

  const displayName = (m: Member) =>
    m.firstName || m.lastName
      ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim()
      : m.email;

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight">{t('members.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('members.subtitle')}</p>
        </div>

        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              {t('members.inviteMember')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-serif">{t('members.inviteMember')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="inv-email">{t('members.inviteEmail')}</Label>
                <Input
                  id="inv-email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="person@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label>{t('members.inviteRole')}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(ROLE_CONFIG) as OrgRole[]).map(r => {
                    const cfg = ROLE_CONFIG[r];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setInviteRole(r)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-sm font-medium transition-colors ${
                          inviteRole === r
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border text-muted-foreground hover:border-muted-foreground'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {t(`members.roles.${r}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? t('common.saving') : t('common.invite')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {(['learner', 'coach', 'org_admin'] as OrgRole[]).map(r => {
          const count = members.filter(m => m.role === r).length;
          const cfg = ROLE_CONFIG[r];
          const Icon = cfg.icon;
          return (
            <Card key={r} className="border-border">
              <CardContent className="pt-5 pb-4 flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${cfg.colour}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{count}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t(`members.roles.${r}`)}s</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Member table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">{t('common.loading')}</div>
          ) : members.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <UserPlus className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t('members.noMembers')}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {members.map(member => (
                <div key={member.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={member.avatarUrl ?? undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {initials(member)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{displayName(member)}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>

                  <RoleBadge role={member.role} />

                  {/* Actions — don't allow editing yourself */}
                  {member.id !== me?.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {t('members.inviteRole')}
                        </div>
                        {(Object.keys(ROLE_CONFIG) as OrgRole[]).map(r => (
                          <DropdownMenuItem
                            key={r}
                            disabled={member.role === r || roleChangeMutation.isPending}
                            onClick={() => roleChangeMutation.mutate({ memberId: member.id, role: r })}
                            className={member.role === r ? 'text-primary font-semibold' : ''}
                          >
                            {t(`members.roles.${r}`)}
                            {member.role === r && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
                          </DropdownMenuItem>
                        ))}
                        <div className="h-px bg-border my-1" />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            if (confirm(t('members.confirmRemove'))) {
                              removeMutation.mutate(member.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          {t('common.remove')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
