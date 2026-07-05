import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStudySubscription,
  useStudyAdminCoupons,
  useStudyCreateCoupon,
  useStudyUpdateCoupon,
  useStudyDeleteCoupon,
  type AdminCoupon,
  type AdminCouponInput,
} from "@/hooks/use-study-api";
import { ArrowLeft, Loader2, Plus, Trash2, Pencil, X } from "lucide-react";

type DiscountType = "percent" | "fixed" | "grant";

interface FormState {
  id: string | null;
  code: string;
  description: string;
  discountType: DiscountType;
  percentOff: string;
  amountOffMajor: string;
  currency: string;
  appliesToTier: "" | "plus" | "pro";
  active: boolean;
  maxRedemptions: string;
  expiresAt: string;
  grantTier: "plus" | "pro";
  grantDays: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  code: "",
  description: "",
  discountType: "percent",
  percentOff: "20",
  amountOffMajor: "",
  currency: "USD",
  appliesToTier: "",
  active: true,
  maxRedemptions: "",
  expiresAt: "",
  grantTier: "pro",
  grantDays: "30",
};

const CURRENCIES = ["USD", "ZAR", "ZMW", "BWP"];

function describeCoupon(c: AdminCoupon): string {
  if (c.discountType === "grant") {
    return `Grants ${c.grantTier ?? "?"} · ${c.grantDays != null ? `${c.grantDays} days` : "forever"} (free)`;
  }
  if (c.discountType === "percent") return `${c.percentOff}% off`;
  const amount = (c.amountOffMinor ?? 0) / 100;
  return `${c.currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} off`;
}

export default function StudyAdminCoupons() {
  const [, setLoc] = useLocation();
  const queryClient = useQueryClient();
  const { isLoading: subLoading } = useStudySubscription();
  const { data, isLoading } = useStudyAdminCoupons();
  const createCoupon = useStudyCreateCoupon();
  const updateCoupon = useStudyUpdateCoupon();
  const deleteCoupon = useStudyDeleteCoupon();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["studyAdminCoupons"] });
  }

  function startCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  function startEdit(c: AdminCoupon) {
    setForm({
      id: c.id,
      code: c.code,
      description: c.description ?? "",
      discountType: c.discountType,
      percentOff: c.percentOff != null ? String(c.percentOff) : "",
      amountOffMajor: c.amountOffMinor != null ? String(c.amountOffMinor / 100) : "",
      currency: c.currency ?? "USD",
      appliesToTier: c.appliesToTier ?? "",
      active: c.active,
      maxRedemptions: c.maxRedemptions != null ? String(c.maxRedemptions) : "",
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "",
      grantTier: c.grantTier ?? "pro",
      grantDays: c.grantDays != null ? String(c.grantDays) : "",
    });
    setError(null);
    setShowForm(true);
  }

  async function handleSubmit() {
    setError(null);
    const payload: AdminCouponInput = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || null,
      discountType: form.discountType,
      appliesToTier: form.appliesToTier || null,
      active: form.active,
      maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    };
    if (form.discountType === "percent") {
      payload.percentOff = Number(form.percentOff);
    } else if (form.discountType === "fixed") {
      payload.amountOffMinor = Math.round(Number(form.amountOffMajor) * 100);
      payload.currency = form.currency;
    } else {
      payload.grantTier = form.grantTier;
      payload.grantDays = form.grantDays ? Number(form.grantDays) : null;
      payload.appliesToTier = null;
    }

    try {
      if (form.id) {
        await updateCoupon.mutateAsync({ id: form.id, ...payload });
      } else {
        await createCoupon.mutateAsync(payload);
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      refresh();
    } catch (e) {
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Could not save the coupon.";
      setError(message);
    }
  }

  async function handleDelete(id: string) {
    await deleteCoupon.mutateAsync(id);
    refresh();
  }

  if (subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  const coupons = data?.coupons ?? [];
  const saving = createCoupon.isPending || updateCoupon.isPending;

  return (
    <div className="min-h-screen bg-background">
      <header className="px-6 py-4 flex items-center justify-between border-b border-border/40">
        <button
          onClick={() => setLoc("/coach")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="font-serif text-lg tracking-tight">Synops admin</div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl mb-1">Codes</h1>
            <p className="text-muted-foreground text-sm">
              Discount codes apply at checkout. Access-grant codes unlock a plan for free — learners redeem them on the upgrade page.
            </p>
          </div>
          {!showForm && (
            <Button onClick={startCreate} className="gap-2">
              <Plus className="h-4 w-4" /> New coupon
            </Button>
          )}
        </div>

        {showForm && (
          <section className="rounded-xl border border-border/60 p-6 mb-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-medium">{form.id ? "Edit coupon" : "New coupon"}</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="BACK2SCHOOL"
                  className="mt-1.5 uppercase"
                />
              </div>
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Back to school sale"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>Discount type</Label>
                <div className="mt-1.5 inline-flex rounded-lg border border-border/60 p-1">
                  {(["percent", "fixed", "grant"] as DiscountType[]).map((dt) => (
                    <button
                      key={dt}
                      type="button"
                      onClick={() => setForm({ ...form, discountType: dt })}
                      className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                        form.discountType === dt
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {dt === "percent" ? "Percent off" : dt === "fixed" ? "Fixed amount" : "Access grant"}
                    </button>
                  ))}
                </div>
              </div>

              {form.discountType === "percent" ? (
                <div>
                  <Label htmlFor="percentOff">Percent off (1-100)</Label>
                  <Input
                    id="percentOff"
                    type="number"
                    min={1}
                    max={100}
                    value={form.percentOff}
                    onChange={(e) => setForm({ ...form, percentOff: e.target.value })}
                    className="mt-1.5 max-w-[140px]"
                  />
                </div>
              ) : form.discountType === "fixed" ? (
                <div className="flex gap-3">
                  <div>
                    <Label htmlFor="amountOff">Amount off</Label>
                    <Input
                      id="amountOff"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.amountOffMajor}
                      onChange={(e) => setForm({ ...form, amountOffMajor: e.target.value })}
                      className="mt-1.5 max-w-[140px]"
                    />
                  </div>
                  <div>
                    <Label htmlFor="currency">Currency</Label>
                    <select
                      id="currency"
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value })}
                      className="mt-1.5 block rounded-md border border-border/60 bg-background px-3 py-2 text-sm h-10"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <div>
                    <Label htmlFor="grantTier">Grants plan</Label>
                    <select
                      id="grantTier"
                      value={form.grantTier}
                      onChange={(e) => setForm({ ...form, grantTier: e.target.value as "plus" | "pro" })}
                      className="mt-1.5 block rounded-md border border-border/60 bg-background px-3 py-2 text-sm h-10"
                    >
                      <option value="plus">Plus</option>
                      <option value="pro">Pro</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="grantDays">For (days)</Label>
                    <Input
                      id="grantDays"
                      type="number"
                      min={1}
                      value={form.grantDays}
                      onChange={(e) => setForm({ ...form, grantDays: e.target.value })}
                      placeholder="Forever"
                      className="mt-1.5 max-w-[140px]"
                    />
                  </div>
                </div>
              )}

              {form.discountType !== "grant" && (
                <div>
                  <Label htmlFor="appliesToTier">Applies to</Label>
                  <select
                    id="appliesToTier"
                    value={form.appliesToTier}
                    onChange={(e) =>
                      setForm({ ...form, appliesToTier: e.target.value as FormState["appliesToTier"] })
                    }
                    className="mt-1.5 block rounded-md border border-border/60 bg-background px-3 py-2 text-sm h-10 w-full"
                  >
                    <option value="">Any paid plan</option>
                    <option value="plus">Plus only</option>
                    <option value="pro">Pro only</option>
                  </select>
                </div>
              )}

              <div>
                <Label htmlFor="maxRedemptions">Max redemptions (optional)</Label>
                <Input
                  id="maxRedemptions"
                  type="number"
                  min={1}
                  value={form.maxRedemptions}
                  onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
                  placeholder="Unlimited"
                  className="mt-1.5 max-w-[160px]"
                />
              </div>

              <div>
                <Label htmlFor="expiresAt">Expires (optional)</Label>
                <Input
                  id="expiresAt"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  className="mt-1.5 max-w-[200px]"
                />
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
                Active (learners can use this code)
              </label>
            </div>

            {error && <p className="text-sm text-destructive mt-4">{error}</p>}

            <div className="mt-6 flex gap-3">
              <Button onClick={handleSubmit} disabled={saving || !form.code.trim()} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {form.id ? "Save changes" : "Create coupon"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </section>
        )}

        {isLoading ? (
          <div className="py-16 text-center">
            <Loader2 className="h-6 w-6 text-primary animate-spin mx-auto" />
          </div>
        ) : coupons.length === 0 ? (
          <p className="text-muted-foreground text-sm py-16 text-center">
            No coupons yet. Create one to run a sale.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Discount</th>
                  <th className="px-4 py-3 font-medium">Applies to</th>
                  <th className="px-4 py-3 font-medium">Used</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => {
                  const expired = c.expiresAt && new Date(c.expiresAt).getTime() < Date.now();
                  return (
                    <tr key={c.id} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium">{c.code}</div>
                        {c.description && (
                          <div className="text-xs text-muted-foreground">{c.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">{describeCoupon(c)}</td>
                      <td className="px-4 py-3 capitalize">{c.appliesToTier ?? "Any plan"}</td>
                      <td className="px-4 py-3">
                        {c.timesRedeemed}
                        {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""}
                      </td>
                      <td className="px-4 py-3">
                        {!c.active ? (
                          <span className="text-muted-foreground">Inactive</span>
                        ) : expired ? (
                          <span className="text-muted-foreground">Expired</span>
                        ) : (
                          <span className="text-primary">Active</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => startEdit(c)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            disabled={deleteCoupon.isPending}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
