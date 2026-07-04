import type { RequestHandler } from "express";
import { loadOrgBilling, isReadOnly } from "./billing";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Shown to the client when a write is refused because the tenant is read-only.
// ASCII only, no em dashes (project copy rules).
export const READ_ONLY_MESSAGE =
  "Your free trial has ended. You can still view everything, but adding or editing is paused. Upgrade your plan to make changes again.";

/**
 * Refuse create/edit/delete when the actor's tenant is currently read-only
 * (e.g. an expired trial). Reads (GET/HEAD/OPTIONS) always pass. Global actors
 * (admin/super_admin) and the internal org bypass via billing.canWrite. Must run
 * AFTER loadActorContext so `req.actor` is populated.
 *
 * Billing routes are intentionally mounted BEFORE this guard so a read-only
 * tenant can still reach checkout/portal to upgrade out of the read-only state.
 * This is server-side enforcement; the client `readOnly` flag is only a UX hint.
 */
export const blockWritesWhenReadOnly: RequestHandler = (req, res, next) => {
  if (READ_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }
  const actor = req.actor;
  if (!actor || actor.isGlobal || actor.organizationId == null) {
    next();
    return;
  }
  const organizationId = actor.organizationId;

  void (async () => {
    try {
      const org = await loadOrgBilling(organizationId);
      if (org && isReadOnly(org)) {
        res.status(402).json({ error: "read_only", upgrade: true, message: READ_ONLY_MESSAGE });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  })();
};
