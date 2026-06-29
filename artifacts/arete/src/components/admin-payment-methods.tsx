import { useState } from "react";
import {
  useAdminPaymentMethods,
  useCreatePaymentMethod,
  useUpdatePaymentMethod,
  useTogglePaymentMethod,
  type PaymentMethod,
  type PaymentMethodInput,
} from "@/lib/admin-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Plus } from "lucide-react";

const RAIL_LABEL: Record<string, string> = {
  stripe: "Stripe (live)",
  flutterwave: "Flutterwave",
  paynow: "Paynow",
  manual: "Manual",
};

const RAIL_NOTE: Record<string, string> = {
  stripe: "Live — cards / Apple Pay.",
  flutterwave: "Charging lands in the Flutterwave slice.",
  paynow: "Charging lands when Paynow is integrated.",
  manual: "Customer pays out-of-band; an admin marks them paid.",
};

const EMPTY: PaymentMethodInput = {
  code: "",
  label: "",
  rail: "flutterwave",
  regions: ["global"],
  instructions: "",
  sort: 0,
};

function MethodDialog({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: PaymentMethod | null;
}) {
  const create = useCreatePaymentMethod();
  const update = useUpdatePaymentMethod();
  const [form, setForm] = useState<PaymentMethodInput>(EMPTY);
  const [regionsStr, setRegionsStr] = useState("global");
  const [seeded, setSeeded] = useState<number | null>(null);

  const seedKey = editing?.id ?? 0;
  if (open && seeded !== seedKey) {
    if (editing) {
      setForm({
        code: editing.code,
        label: editing.label,
        rail: editing.rail,
        regions: editing.regions,
        instructions: editing.instructions ?? "",
        sort: editing.sort,
      });
      setRegionsStr(editing.regions.join(", "));
    } else {
      setForm(EMPTY);
      setRegionsStr("global");
    }
    setSeeded(seedKey);
  }

  function set<K extends keyof PaymentMethodInput>(k: K, v: PaymentMethodInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const busy = create.isPending || update.isPending;
  const err = (create.error || update.error) as Error | null;

  function save() {
    const regions = regionsStr.split(",").map((s) => s.trim()).filter(Boolean);
    const input: PaymentMethodInput = {
      ...form,
      regions: regions.length > 0 ? regions : ["global"],
      instructions: form.rail === "manual" ? (form.instructions || null) : (form.instructions || null),
    };
    const onDone = () => { setSeeded(null); onClose(); };
    if (editing) update.mutate({ id: editing.id, input }, { onSuccess: onDone });
    else create.mutate(input, { onSuccess: onDone });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSeeded(null); onClose(); } }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-serif">{editing ? "Edit payment method" : "Add payment method"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Code</Label>
            <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="ecocash" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Label (shown to customer)</Label>
            <Input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="EcoCash" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Rail (settlement)</Label>
            <Select value={form.rail} onValueChange={(v) => set("rail", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="flutterwave">Flutterwave</SelectItem>
                <SelectItem value="paynow">Paynow</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{RAIL_NOTE[form.rail]}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sort order</Label>
            <Input
              inputMode="numeric"
              value={String(form.sort)}
              onChange={(e) => set("sort", Number(e.target.value) || 0)}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Regions (comma-separated)</Label>
            <Input
              value={regionsStr}
              onChange={(e) => setRegionsStr(e.target.value)}
              placeholder="ZW, ZM, ZA  ·  or  global"
            />
            <p className="text-[11px] text-muted-foreground">
              Use the same region codes as your plans. <code>global</code> shows it everywhere.
            </p>
          </div>
          {form.rail === "manual" && (
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Payment instructions (required for manual)</Label>
              <Textarea
                value={form.instructions ?? ""}
                onChange={(e) => set("instructions", e.target.value)}
                rows={3}
                placeholder="e.g. Send via Remitly to +263… (name …). Email the reference to billing@… and we'll activate your Pro plan within 24h."
              />
            </div>
          )}
        </div>
        {err && <p className="text-xs text-destructive">{err.message}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setSeeded(null); onClose(); }} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add method"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentMethodsManager({
  enabled,
  isSuperAdmin,
}: {
  enabled: boolean;
  isSuperAdmin: boolean;
}) {
  const { data, isLoading } = useAdminPaymentMethods(enabled);
  const toggle = useTogglePaymentMethod();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);

  const methods = data?.methods ?? [];

  function openAdd() { setEditing(null); setDialogOpen(true); }
  function openEdit(m: PaymentMethod) { setEditing(m); setDialogOpen(true); }

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base font-serif flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" /> Payment methods
          </CardTitle>
          <CardDescription>
            The options learners see at checkout, by region. Each routes to a settlement rail; live charging lights up as each rail is integrated (Stripe is live, Flutterwave next).
          </CardDescription>
        </div>
        {isSuperAdmin && (
          <Button size="sm" onClick={openAdd} className="shrink-0">
            <Plus className="w-4 h-4 mr-1" /> Add method
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground px-6 pb-6">Loading…</p>
        ) : methods.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 pb-6">
            No payment methods yet. {isSuperAdmin ? 'Click "Add method" to create one.' : ""}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead>Rail</TableHead>
                  <TableHead>Regions</TableHead>
                  <TableHead>Status</TableHead>
                  {isSuperAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {methods.map((m) => (
                  <TableRow key={m.id} className={m.active ? "" : "opacity-60"}>
                    <TableCell>
                      <span className="font-medium">{m.label}</span>
                      <span className="text-xs text-muted-foreground ml-1 font-mono">{m.code}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">{RAIL_LABEL[m.rail] ?? m.rail}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{m.regions.join(", ")}</TableCell>
                    <TableCell>
                      {m.active ? (
                        <Badge className="bg-primary/10 text-primary font-normal">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="font-normal text-muted-foreground">Inactive</Badge>
                      )}
                    </TableCell>
                    {isSuperAdmin && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>Edit</Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate({ id: m.id, active: !m.active })}
                        >
                          {m.active ? "Deactivate" : "Activate"}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <MethodDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editing={editing} />
    </Card>
  );
}
