/**
 * POPIA compliance constants for the Coach (Paideia) API.
 *
 * PRIVACY_POLICY_VERSION is the single source of truth for "which privacy-policy
 * version is current". Bumping it re-prompts every learner for consent on their
 * next authenticated load (the consent gate compares it to the learner's stored
 * consent_version). Keep it in sync with the published policy and the Praxis
 * app's matching constant.
 */
export const PRIVACY_POLICY_VERSION = "2026-07";

/** True when the learner has not accepted the current privacy-policy version. */
export function consentRequired(consentVersion: string | null | undefined): boolean {
  return consentVersion !== PRIVACY_POLICY_VERSION;
}
