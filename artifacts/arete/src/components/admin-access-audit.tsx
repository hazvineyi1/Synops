import { useState } from "react";
import { useAuditLog, useSetUserRole, ADMIN_ROLES, type AdminUser } from "@/lib/admin-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";

function roleLabel(r: string) {
  return r.replace(/_/g, " ");
}

export function AccessAudit({
  users,
  isSuperAdmin,
  enabled,
}: {
  users: AdminUser[];
  isSuperAdmin: boolean;
  enabled: boolean;
}) {
  const { data: audit } = useAuditLog(enabled);
  const setRole = useSetUserRole();
  const [userId, setUserId] = useState("");
  const [role, setRoleVal] = useState("support");

  const entries = audit?.entries ?? [];
  const admins = users.filter((u) => u.role && u.role !== "user");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access &amp; audit</CardTitle>
        <CardDescription>Assign admin roles and review the admin action log.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {admins.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {admins.map((u) => (
              <Badge key={u.id} variant="secondary" className="font-normal">
                {u.email} · {roleLabel(u.role)}
              </Badge>
            ))}
          </div>
        )}

        {isSuperAdmin ? (
          <div className="rounded-md border p-4">
            <div className="mb-3 text-sm font-medium">Assign a role</div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <label className="mb-1 block text-xs text-muted-foreground">User</label>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.email}
                        {u.role && u.role !== "user" ? ` · ${roleLabel(u.role)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[170px]">
                <label className="mb-1 block text-xs text-muted-foreground">Role</label>
                <Select value={role} onValueChange={setRoleVal}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADMIN_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {roleLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                disabled={!userId || setRole.isPending}
                onClick={() => setRole.mutate({ id: userId, role })}
              >
                {setRole.isPending ? "Saving…" : "Set role"}
              </Button>
            </div>
            {setRole.isError && (
              <p className="mt-2 text-xs text-destructive">{(setRole.error as Error)?.message}</p>
            )}
            {setRole.isSuccess && <p className="mt-2 text-xs text-primary">Role updated.</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only super admins can change roles. You can view the audit log below.
          </p>
        )}

        <div>
          <div className="mb-2 text-sm font-medium">Recent admin actions</div>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin actions logged yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {format(parseISO(e.created_at), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell className="text-sm">{e.actor_email || e.actor_user_id}</TableCell>
                    <TableCell className="text-sm font-medium">{e.action}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {e.target_id || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.metadata ? JSON.stringify(e.metadata) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
