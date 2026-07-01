import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { ClassProfile } from "@/lib/types";

export function useClassProfiles() {
  const [profiles, setProfiles] = useState<ClassProfile[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get<{ profiles: ClassProfile[] }>("/profiles")
      .then((r) => setProfiles(r.profiles))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);
  return { profiles, loading };
}

export function ClassProfileSelector({
  onSelect,
  label = "Class profile (optional)",
}: {
  onSelect: (p: ClassProfile) => void;
  label?: string;
}) {
  const { profiles, loading } = useClassProfiles();
  if (loading || profiles.length === 0) return null;
  return (
    <div className="space-y-2 bg-secondary/40 border rounded-md p-3">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Select onValueChange={(id) => {
        const p = profiles.find((x) => x.id === id);
        if (p) onSelect(p);
      }}>
        <SelectTrigger><SelectValue placeholder="Pick a class to auto-fill" /></SelectTrigger>
        <SelectContent>
          {profiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name} - {p.subject} · {p.yearGroup}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
