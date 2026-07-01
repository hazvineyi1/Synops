import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

export default function AwaitingApproval() {
  const { teacher, signOut } = useAuth();
  const [, setLoc] = useLocation();
  const onSignOut = async () => {
    await signOut();
    setLoc("/login");
  };
  return (
    <AuthShell
      title="Almost there"
      subtitle="Your account is being reviewed by the founder."
    >
      <div className="space-y-4 text-sm">
        <p>
          Thanks for signing up, {teacher?.name ?? "teacher"}. To keep Synops
          focused on real classrooms, every new account is reviewed before it can
          start creating lessons. You will get access as soon as we approve you.
        </p>
        <p className="text-muted-foreground">
          If this is urgent, send a quick note from your school address to
          info@synops-consulting.com and mention the email you signed up with
          ({teacher?.email}).
        </p>
        <div className="pt-2">
          <Button variant="outline" className="w-full" onClick={onSignOut} data-track="awaiting_approval_signout">
            Sign out
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
