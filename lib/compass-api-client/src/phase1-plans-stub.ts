// PHASE-1 STUB (Curriculum Builder migration). The Compass frontend's public
// Pricing page imports `useListPlans` and `PlanCatalogEntry` from this client,
// but the committed generated client predates the "plans" endpoints (the origin
// repo had no CI/typecheck, so this drift was never caught). These placeholders
// keep the production build resolving and the Pricing page inert until Phase 2,
// when the Compass api-spec is ported and the client is REGENERATED with the
// real listPlans operation. Delete this file then.
import type { PlanFeatures } from "./generated/api.schemas";

export interface PlanCatalogEntry {
  id?: string;
  name?: string;
  priceLabel?: string;
  features?: PlanFeatures;
  highlight?: boolean;
}

/** No-op stand-in for the not-yet-generated listPlans query hook. */
export function useListPlans(): { data: PlanCatalogEntry[]; isLoading: boolean } {
  return { data: [], isLoading: false };
}
