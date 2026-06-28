import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPlatformOverview,
  getGetPlatformOverviewQueryKey,
  getPlatformReportMarkdown,
  useGetPlatformUsers,
  getGetPlatformUsersQueryKey,
  useUpdateOrganizationBranding,
  type PlatformOverviewOrganization,
  type PlatformOverviewTotals,
  type PlanFeatures,
  type UpdateBrandingInput,
} from "@workspace/kanon-api-client";
import { useAuth, authErrorMessage } from "@/lib/auth-context";
import { canImpersonate, roleLabel } from "@/lib/roles";
import { PRODUCTS, PRODUCT_MAP } from "@/lib/products";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShieldCheck,
  Download,
  ArrowRight,
  UserCheck,
  Palette,
  Check,
  Minus,
} from "lucide-react";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

interface BrandingForm {
  name: string;
  tagline: string;
  accentColor: string;
  logoUrl: string;
  domain: string;
}

function toForm(org: PlatformOverviewOrganization): BrandingForm {
  return {
    name: org.name,
    tagline: org.tagline ?? "",
    accentColor: org.accentColor ?? "",
    logoUrl: org.logoUrl ?? "",
    domain: org.domain ?? "",
  };
}

// Build a PATCH body containing only the fields the administrator changed. An
// emptied field that previously had a value becomes null (clear); name cannot be
// cleared. The server validates accent hex, logo URL, and domain uniqueness.
function diffBranding(org: PlatformOverviewOrganization, form: BrandingForm): UpdateBrandingInput {
  const body: UpdateBrandingInput = {};
  const name = form.name.trim();
  if (name && name !== org.name) body.name = name;

  const nullable: Array<[keyof UpdateBrandingInput, string, string | null | undefined]> = [
    ["tagline", form.tagline, org.tagline],
    ["accentColor", form.accentColor, org.accentColor],
    ["logoUrl", form.logoUrl, org.logoUrl],
    ["domain", form.domain, org.domain],
  ];
  for (const [key, value, current] of nullable) {
    const next = value.trim();
    if (next === (current ?? "")) continue;
    (body[key] as string | null) = next === "" ? null : next;
  }
  return body;
}

export default function Console() {
  const { user, startImpersonating } = useAuth();
  const role = user?.role;
  const canImp = canImpersonate(role);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: overview,
    isLoading,
    isError,
    error,
  } = useGetPlatformOverview({
    query: { queryKey: getGetPlatformOverviewQueryKey() },
  });

  const [downloading, setDownloading] = useState(false);

  async function downloadReport() {
    setDownloading(true);
    try {
      const markdown = await getPlatformReportMarkdown();
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "platform-overview.md";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: "Could not download report",
        description: authErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <ShieldCheck className="h-7 w-7" aria-hidden="true" /> Platform console
          </h1>
          <p className="mt-1 text-muted-foreground">
            {overview
              ? `Cross-organization overview (generated ${formatTimestamp(overview.generatedAt)}).`
              : "Cross-organization overview, impersonation, and white-label branding."}
          </p>
        </div>
        {overview && (
          <Button onClick={downloadReport} disabled={downloading}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            {downloading ? "Preparing..." : "Download report"}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading overview...</div>
      ) : isError ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {authErrorMessage(error) || "The platform overview is unavailable."}
        </div>
      ) : !overview ? null : (
        <>
          <TotalsGrid totals={overview.totals} />

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownCard
              title="Users by role"
              rows={overview.usersByRole.map((r) => ({ label: roleLabel(r.key), count: r.count }))}
            />
            <BreakdownCard
              title="Users by product"
              rows={overview.usersByProduct.map((r) => ({
                label: PRODUCT_MAP[r.key]?.name ?? r.key,
                count: r.count,
              }))}
            />
          </div>

          <PortalLauncher />

          {canImp && <ImpersonationCard onImpersonate={startImpersonating} selfId={user?.id} />}

          <OrganizationsCard
            organizations={overview.organizations}
            onSaved={() =>
              queryClient.invalidateQueries({ queryKey: getGetPlatformOverviewQueryKey() })
            }
          />
        </>
      )}
    </div>
  );
}

function TotalsGrid({ totals }: { totals: PlatformOverviewTotals }) {
  const cards = [
    { label: "Organizations", value: totals.organizations },
    { label: "Users", value: totals.users },
    { label: "Clients", value: totals.clients },
    { label: "Projects", value: totals.projects },
    { label: "Active projects", value: totals.activeProjects },
    { label: "Courses", value: totals.courses },
    { label: "Classes", value: totals.classes },
    { label: "Builders", value: totals.builders },
    { label: "Active allocations", value: totals.activeAllocations },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{card.value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{card.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-muted-foreground">No data.</div>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center justify-between text-sm">
                <span>{row.label}</span>
                <Badge variant="secondary">{row.count}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PortalLauncher() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Product portals</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((p) => {
            const Icon = p.icon;
            return (
              <Link
                key={p.key}
                href={`~/${p.key}`}
                className="group flex items-center gap-3 rounded-lg border p-3 hover:bg-accent"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white"
                  style={{ backgroundColor: p.accent }}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.title}</span>
                </span>
                <ArrowRight
                  className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ImpersonationCard({
  onImpersonate,
  selfId,
}: {
  onImpersonate: (userId: number) => Promise<void>;
  selfId?: number;
}) {
  const { toast } = useToast();
  const { data: users } = useGetPlatformUsers({
    query: { queryKey: getGetPlatformUsersQueryKey() },
  });
  const [selected, setSelected] = useState<string>("");
  const [working, setWorking] = useState(false);

  // Any active account other than the operator themselves is eligible. The server
  // independently enforces the same rules (no self, no deactivated, no nesting).
  const candidates = useMemo(
    () =>
      (users ?? []).filter(
        (u) =>
          u.id !== selfId &&
          u.status === "active",
      ),
    [users, selfId],
  );

  async function impersonate() {
    const userId = Number(selected);
    if (!userId) {
      toast({ title: "Select a user to impersonate", variant: "destructive" });
      return;
    }
    setWorking(true);
    try {
      await onImpersonate(userId);
    } catch (err) {
      toast({
        title: "Could not start impersonation",
        description: authErrorMessage(err),
        variant: "destructive",
      });
      setWorking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" aria-hidden="true" /> Impersonate a user
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          View the platform exactly as another user. Curriculum edits made while
          impersonating are recorded against you. Security actions are blocked.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-1">
            <Label htmlFor="impersonate-user">User</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id="impersonate-user">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name} ({u.email}) - {roleLabel(u.role)}
                    {u.organizationName ? ` - ${u.organizationName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={impersonate} disabled={working || !selected}>
            {working ? "Starting..." : "Impersonate"}
          </Button>
        </div>
        {candidates.length === 0 && (
          <p className="text-sm text-muted-foreground">No eligible users to impersonate.</p>
        )}
      </CardContent>
    </Card>
  );
}

const FEATURE_LABELS: Array<{ key: keyof PlanFeatures; label: string }> = [
  { key: "whiteLabel", label: "Branding" },
  { key: "multiAccreditorExport", label: "Evidence export" },
  { key: "customDomain", label: "Custom domain" },
];

// Per-org feature availability. State is conveyed by icon AND text (not color
// alone) so the indicator meets WCAG AA.
function FeatureBadges({ features }: { features: PlanFeatures }) {
  return (
    <div className="flex flex-col gap-1">
      {FEATURE_LABELS.map(({ key, label }) => {
        const on = features[key];
        const Icon = on ? Check : Minus;
        return (
          <span
            key={key}
            className={`inline-flex items-center gap-1 text-xs ${
              on ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{label}</span>
            <span className="sr-only">{on ? "included" : "not included"}</span>
          </span>
        );
      })}
    </div>
  );
}

function OrganizationsCard({
  organizations,
  onSaved,
}: {
  organizations: PlatformOverviewOrganization[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<PlatformOverviewOrganization | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" aria-hidden="true" /> Organizations and branding
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Accent</TableHead>
              <TableHead className="text-center">Users</TableHead>
              <TableHead className="text-center">Clients</TableHead>
              <TableHead className="text-center">Projects</TableHead>
              <TableHead className="text-center">Builders</TableHead>
              <TableHead className="text-right">Branding</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.map((org) => (
              <TableRow key={org.id}>
                <TableCell className="font-medium">{org.name}</TableCell>
                <TableCell>
                  <Badge variant={org.type === "internal" ? "default" : "secondary"}>
                    {org.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1.5">
                    <Badge variant="outline" className="w-fit">
                      {org.planLabel}
                    </Badge>
                    <FeatureBadges features={org.features} />
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {org.domain ?? <span className="italic">none</span>}
                </TableCell>
                <TableCell>
                  {org.accentColor ? (
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-4 w-4 rounded-full border"
                        style={{ backgroundColor: org.accentColor }}
                        aria-hidden="true"
                      />
                      <span className="text-xs text-muted-foreground">{org.accentColor}</span>
                    </span>
                  ) : (
                    <span className="text-xs italic text-muted-foreground">none</span>
                  )}
                </TableCell>
                <TableCell className="text-center">{org.users}</TableCell>
                <TableCell className="text-center">{org.clients}</TableCell>
                <TableCell className="text-center">{org.projects}</TableCell>
                <TableCell className="text-center">{org.builders}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => setEditing(org)}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <BrandingDialog
        org={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onSaved();
        }}
      />
    </Card>
  );
}

function BrandingDialog({
  org,
  onClose,
  onSaved,
}: {
  org: PlatformOverviewOrganization | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const mutation = useUpdateOrganizationBranding();
  const [form, setForm] = useState<BrandingForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Reset the form whenever a different organization is opened.
  const current = useMemo(() => (org ? toForm(org) : null), [org]);
  const active = form ?? current;

  function update(patch: Partial<BrandingForm>) {
    setForm({ ...(active ?? ({} as BrandingForm)), ...patch });
  }

  async function save() {
    if (!org || !active) return;
    setFormError(null);
    const body = diffBranding(org, active);
    if (Object.keys(body).length === 0) {
      toast({ title: "No changes to save" });
      return;
    }
    try {
      await mutation.mutateAsync({ id: org.id, data: body });
      toast({ title: "Branding updated", description: org.name });
      setForm(null);
      onSaved();
    } catch (err) {
      setFormError(authErrorMessage(err));
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setForm(null);
      setFormError(null);
      onClose();
    }
  }

  return (
    <Dialog open={Boolean(org)} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Branding{org ? ` - ${org.name}` : ""}</DialogTitle>
          <DialogDescription>
            White-label the branded login for this organization. Accent must be a
            hex color (for example #0a7c5b). Logo must be an https URL or a
            site-relative path. Domain controls which host resolves to this
            organization.
          </DialogDescription>
        </DialogHeader>

        {active && (
          <div className="space-y-4">
            {formError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </div>
            )}
            {org && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium">Plan: {org.planLabel}</span>
                {!org.features.whiteLabel && (
                  <p className="mt-1 text-muted-foreground">
                    This organization's plan does not include white-label branding. As a
                    platform administrator you can still set its name, tagline, accent, and
                    logo, or grant the feature by provisioning a plan that includes it.
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="brand-name">Name</Label>
              <Input
                id="brand-name"
                value={active.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-tagline">Tagline</Label>
              <Input
                id="brand-tagline"
                value={active.tagline}
                onChange={(e) => update({ tagline: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="grid grid-cols-[auto_1fr] items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="brand-accent-picker">Accent</Label>
                <input
                  id="brand-accent-picker"
                  type="color"
                  className="h-10 w-12 cursor-pointer rounded-md border bg-background"
                  value={/^#[0-9a-fA-F]{6}$/.test(active.accentColor) ? active.accentColor : "#000000"}
                  onChange={(e) => update({ accentColor: e.target.value })}
                  aria-label="Accent color picker"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-accent">Accent hex</Label>
                <Input
                  id="brand-accent"
                  value={active.accentColor}
                  onChange={(e) => update({ accentColor: e.target.value })}
                  placeholder="#0a7c5b (empty to clear)"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-logo">Logo URL</Label>
              <Input
                id="brand-logo"
                value={active.logoUrl}
                onChange={(e) => update({ logoUrl: e.target.value })}
                placeholder="https://... or /logos/acme.svg (empty to clear)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-domain">Domain</Label>
              <Input
                id="brand-domain"
                value={active.domain}
                onChange={(e) => update({ domain: e.target.value })}
                placeholder="academy.example.org (empty to clear)"
              />
              {org && !org.features.customDomain && (
                <p className="text-xs text-muted-foreground">
                  This organization's plan does not include custom domains. Assigning a
                  domain will be refused until it is provisioned a plan that includes the
                  feature. Clearing the domain is always allowed.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save branding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
