import { hubMode } from "./hub";
import { logger } from "./logger";

/**
 * MRB hub only (HUB_MODE=mrb): load the MRB tenant, framework v2.1 and brand at start-up, so a fresh
 * hub database is ready without anyone calling the seed endpoint by hand. Idempotent, so it runs on
 * every boot and only fills in what is missing. It does NOT load the practice credential catalogue:
 * which credentials MRB offers is MRB's decision (see POST /platform/seed-mrb-hub). Set
 * MRB_HUB_AUTOSETUP=0 to switch it off. Never throws, never blocks boot.
 */
export async function autoSetupHub(): Promise<void> {
  if (hubMode() !== "mrb") return;
  if ((process.env.MRB_HUB_AUTOSETUP ?? "").trim() === "0") return;
  try {
    // Loaded lazily so ordinary Praxis boots never touch the MRB provisioning code path.
    const { provisionMrbHubTenant } = await import("../routes/platform");
    const r = await provisionMrbHubTenant({ includeCatalogue: false });
    logger.info({ partnerId: r.partnerId, customDomain: r.customDomain, framework: r.framework }, "hub: MRB tenant, framework and brand ensured");
  } catch (err) {
    logger.error({ err }, "hub: MRB auto-setup failed; run POST /api/platform/seed-mrb-hub by hand");
  }
}
