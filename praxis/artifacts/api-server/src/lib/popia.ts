/**
 * POPIA compliance constants shared across the Praxis API.
 *
 * PRIVACY_POLICY_VERSION is the single source of truth for "which version of the
 * privacy policy is current". Bumping it (e.g. after a material policy change)
 * automatically re-prompts every user for consent on their next authenticated
 * load, because the consent gate compares this to the user's stored
 * consent_version. Keep it in sync with the published policy and the Coach app's
 * matching constant.
 */
export const PRIVACY_POLICY_VERSION = "2026-07";

/** True when the user has not accepted the current privacy-policy version. */
export function consentRequired(consentVersion: string | null | undefined): boolean {
  return consentVersion !== PRIVACY_POLICY_VERSION;
}
