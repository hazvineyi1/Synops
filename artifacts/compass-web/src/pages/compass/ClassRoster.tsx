import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListClassRoster,
  getListClassRosterQueryKey,
  getListOrgMembersQueryKey,
  useAddClassMember,
  useRemoveClassMember,
  useListOrgMembers,
  type ClassMember,
} from "@workspace/compass-api-client";
import { useAuth, authErrorMessage } from "@/lib/auth-context";
import { canManageSchool } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, UserMinus } from "lucide-react";

interface ClassRosterProps {
  classId: number;
  courseId: number;
  className: string;
}

function roleLabel(role: string): string {
  switch (role) {
    case "school_admin":
      return "School administrator";
    case "builder":
      return "Builder";
    default:
      return role;
  }
}

export default function ClassRoster({ classId, courseId, className }: ClassRosterProps) {
  const { user } = useAuth();
  const canManage = canManageSchool(user?.role);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: roster, isLoading } = useListClassRoster(classId);
  const { data: orgMembers } = useListOrgMembers(
    {},
    { query: { enabled: canManage, queryKey: getListOrgMembersQueryKey() } },
  );

  const addMember = useAddClassMember();
  const removeMember = useRemoveClassMember();

  const [addOpen, setAddOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");

  const rosterUserIds = new Set((roster ?? []).map((m) => m.userId));
  const availableMembers = (orgMembers ?? []).filter(
    (m) => m.status === "active" && !rosterUserIds.has(m.id),
  );

  function resetForm() {
    setSelectedUserId("");
  }

  function onAdd() {
    if (!selectedUserId) {
      toast({ title: "Choose a person to add", variant: "destructive" });
      return;
    }
    addMember.mutate(
      { classId, data: { userId: Number(selectedUserId) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClassRosterQueryKey(classId) });
          setAddOpen(false);
          resetForm();
          toast({ title: "Person added to roster" });
        },
        onError: (err) =>
          toast({
            title: "Could not add person",
            description: authErrorMessage(err),
            variant: "destructive",
          }),
      },
    );
  }

  function onRemove(member: ClassMember) {
    removeMember.mutate(
      { classId, memberId: member.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClassRosterQueryKey(classId) });
          toast({ title: "Person removed from roster" });
        },
        onError: (err) =>
          toast({
            title: "Could not remove person",
            description: authErrorMessage(err),
            variant: "destructive",
          }),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Roster</h2>
          {roster && roster.length > 0 && (
            <Badge variant="secondary">{roster.length}</Badge>
          )}
        </div>

        {canManage && (
          <Dialog
            open={addOpen}
            onOpenChange={(next) => {
              setAddOpen(next);
              if (!next) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add to roster</DialogTitle>
                <DialogDescription>
                  Choose an active org member to add to the {className} roster. Only
                  people in your organization can be added.
                </DialogDescription>
              </DialogHeader>
              <div className="py-2">
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a person" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMembers.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No available org members
                      </SelectItem>
                    ) : (
                      availableMembers.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.name} ({m.email})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  onClick={onAdd}
                  disabled={addMember.isPending || !selectedUserId}
                >
                  {addMember.isPending ? "Adding..." : "Add to roster"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading roster...</div>
      ) : !roster || roster.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No members on the roster yet.
          {canManage && " Use the button above to add org members."}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Added</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.userName}</TableCell>
                  <TableCell className="text-muted-foreground">{member.userEmail}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{roleLabel(member.userRole)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(member.addedAt).toLocaleDateString()}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            aria-label={`Remove ${member.userName} from roster`}
                          >
                            <UserMinus className="mr-1 h-4 w-4" aria-hidden="true" /> Remove
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove from roster?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {member.userName} will be removed from the {className} roster.
                              This does not affect their account or allocations.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onRemove(member)}>
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
