import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";

export interface TeacherMaterial {
  id: string;
  title: string;
  sourceType: string;
  charCount: number;
  preview: string;
}

const NONE = "__none__";

/**
 * Optional picker that lets a teacher base a generation on one of their
 * uploaded materials. Fetches once from GET /materials. If the teacher has no
 * materials it renders a subtle hint linking to the Materials page.
 */
export function MaterialPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (materialId: string | null) => void;
}) {
  const [materials, setMaterials] = useState<TeacherMaterial[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<{ materials: TeacherMaterial[] }>("/materials")
      .then((res) => {
        if (active) setMaterials(res.materials ?? []);
      })
      .catch(() => {
        if (active) setMaterials([]);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loaded && materials.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Want the output grounded in your own content?{" "}
        <Link href="/materials" className="text-primary underline underline-offset-2">
          Add a material
        </Link>{" "}
        first.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Base this on your material (optional)</Label>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {materials.map((m) => (
            <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
