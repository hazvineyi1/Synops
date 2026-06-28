/**
 * Pure decision logic for whether a super admin may begin impersonating a target
 * user. Kept side-effect free (no DB, no session) so it can be unit tested in
 * isolation, mirroring the tenancy decision functions. The route in
 * routes/impersonation.ts loads the operator + target from the DB, calls this,
 * and maps the outcome to an HTTP status. Nesting (already-impersonating) is
 * prevented upstream by the blockWhileImpersonating guard, not here.
 */
export interface ImpersonationParty {
  id: number;
  role: string;
  status: string;
}

export type ImpersonationStartOutcome =
  | "allow"
  | "operator_invalid" // operator missing or deactivated -> 401
  | "not_super_admin" // operator is not a super admin -> 403
  | "target_not_found" // target id does not exist -> 404
  | "self" // operator targeted themselves -> 400
  | "target_deactivated"; // target account is deactivated -> 400

export function decideImpersonationStart(
  operator: ImpersonationParty | null,
  target: ImpersonationParty | null,
): ImpersonationStartOutcome {
  if (!operator || operator.status === "deactivated") return "operator_invalid";
  // Only the explicit super_admin role may impersonate (legacy "admin" may not).
  if (operator.role !== "super_admin") return "not_super_admin";
  if (!target) return "target_not_found";
  if (target.id === operator.id) return "self";
  if (target.status === "deactivated") return "target_deactivated";
  return "allow";
}
