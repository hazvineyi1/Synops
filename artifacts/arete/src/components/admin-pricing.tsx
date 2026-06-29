import { useState } from "react";
import {
  useAdminPlans,
  useCreatePlan,
  useUpdatePlan,
  useTogglePlan,
  type Plan,
  type PlanInput,
} from "@/lib/admin-api";
import type { AdminOverview } from "@/lib/admin-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Clock, Users, Plus } from "lucide-react";

// Minor units (cents) -> a readable "USD 19.00".
function fmtPrice(currency: string, amountMinor: number): string {
  return `${currency} ${(amountMinor / 100).toFixed(2)}`;
}

const EMPTY: PlanInput = {
  code: "pro",
  name: "Pro",
  interval: "monthly",
  region: "global",
  currency: "USD",
  amountMinor: 0,
  processor: "stripe",
  stripePriceId: "",
  sort: 0,
};

function PlanDialog({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: Plan | null;
}) {
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const [form, setForm] = useState<PlanInput>(EMPTY);
  const [amountStr, setAmountStr] = useState("0");
  const [seeded, setSeeded] = useState<number | null>(null);

  // Seed the form once per open/editing target.
  const seedKey = editing?.id ?? 0;
  if (open && seeded !== seedKey) {
    if (editing) {
      setForm({
        code: editing.code,
        name: editing.name,
        interval: editing.interval,
        region: editing.region,
        currency: editing.currency,
        amountMinor: editing.amount_minor,
        processor: editing.processor,
        stripePriceId: editing.stripe_price_id ?? "",
        sort: editing.sort,
      });
      setAmountStr((editing.amount_minor / 100).toFixed(2));
    } else {
      setForm(EMPTY);
      setAmountStr("0");
    }
    setSeeded(seedKey);
  }

  function set<K extends keyof PlanInput>(k: K, v: PlanInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const busy = create.isPending || update.isPending;
  const err = (create.error || update.error) as Error | null;

  function save() {
    const amountMinor = Math.round(parseFloat(amountStr || "0") * 100);
    const input: PlanInput = {
      ...form,
      amountMinor: Number.isFinite(amountMinor) ? amountMinor : 0,
      stripePriceId: form.processor === "stripe" ? (form.stripePriceId || null) : null,
    };
    const onDone = () => {
      setSeeded(null);
      onClose();
    };
    if (editing) update.mutate({ id: editing.id, input }, { onSuccess: onDone });
    else create.mutate(input, { onSuccess: onDone });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSeeded(null); onClose(); } }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-serif">{editing ? "Edit price" : "Add price"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Plan code (entitlement)</Label>
            <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="pro" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Display name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Pro" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Interval</Label>
            <Select value={form.interval} onValueChange={(v) => set("interval", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Region</Label>
            <Input value={form.region} onChange={(e) => set("region", e.target.value)} placeholder="global / ZW / NG" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Currency</Label>
            <Input value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} placeholder="USD" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Price (in {form.currency || "currency"})</Label>
            <Input
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="19.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Processor</Label>
            <Select value={form.processor} onValueChange={(v) => set("processor", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="flutterwave">Flutterwave</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sort order</Label>
            <Input
              inputMode="numeric"
              value={String(form.sort)}
              onChange={(e) => set("sort", Number(e.target.value) || 0)}
            />
          </div>
          {form.processor === "stripe" && (
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Stripe price ID</Label>
              <Input
                value={form.stripePriceId ?? ""}
                onChange={(e) => set("stripePriceId", e.target.value)}
                placeholder="price_1Abc…"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Create the price in your Stripe dashboard, then paste its ID here. Flutterwave plans charge the amount above directly (no ID needed).
              </p>
            </div>
          )}
        </div>
        {err && <p className="text-xs text-destructive">{err.message}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setSeeded(null); onClose(); }} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add price"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PricingManager({
  enabled,
  isSuperAdmin,
  overview,
}: {
  enabled: boolean;
  isSuperAdmin: boolean;
  overview?: AdminOverview;
}) {
  const { data, isLoading } = useAdminPlans(enabled);
  const toggle = useTogglePlan();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  const plans = data?.plans ?? [];

  // Rough MRR from the global monthly Pro price × active Pro learners. With
  // regional pricing the true figure needs per-subscription currency data;
  // this is a directional estimate until that lands.
  const globalMonthly = plans.find(
    (p) => p.region === "global" && p.interval === "monthly" && p.active,
  );
  const estMrr =
    overview && globalMonthly
      ? `${globalMonthly.currency} ${((overview.pro_users * globalMonthly.amount_minor) / 100).toLocaleString()}`
      : "—";

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(p: Plan) {
    setEditing(p);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-serif flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Revenue
          </CardTitle>
          <CardDescription>Subscription mix today and an estimated monthly recurring revenue.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat icon={Sparkles} label="Pro learners" value={overview ? String(overview.pro_users) : "—"} />
            <Stat icon={Clock} label="On trial" value={overview ? String(overview.trial_users) : "—"} />
            <Stat icon={Users} label="Est. MRR" value={estMrr} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-serif">Pricing catalog</CardTitle>
            <CardDescription>
              Each row is a price for a region. Checkout picks the row matching the learner's region (falling back to <code>global</code>).
            </CardDescription>
          </div>
          {isSuperAdmin && (
            <Button size="sm" onClick={openAdd} className="shrink-0">
              <Plus className="w-4 h-4 mr-1" /> Add price
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground px-6 pb-6">Loading…</p>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-6">
              No prices yet. {isSuperAdmin ? 'Click "Add price" to create your first plan.' : ""}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Region</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Interval</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Processor</TableHead>
                    <TableHead>Status</TableHead>
                    {isSuperAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((p) => (
                    <TableRow key={p.id} className={p.active ? "" : "opacity-60"}>
                      <TableCell className="font-mono text-xs">{p.region}</TableCell>
                      <TableCell>
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground ml-1">({p.code})</span>
                      </TableCell>
                      <TableCell className="capitalize">{p.interval}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtPrice(p.currency, p.amount_minor)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal capitalize">{p.processor}</Badge>
                        {p.processor === "stripe" && !p.stripe_price_id && (
                          <span className="ml-2 text-[11px] text-destructive">no price ID</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.active ? (
                          <Badge className="bg-primary/10 text-primary font-normal">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="font-normal text-muted-foreground">Inactive</Badge>
                        )}
                      </TableCell>
                      {isSuperAdmin && (
                        <TableCell className="text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={toggle.isPending}
                            onClick={() => toggle.mutate({ id: p.id, active: !p.active })}
                          >
                            {p.active ? "Deactivate" : "Activate"}
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
      </Card>

      <PlanDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editing={editing} />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
