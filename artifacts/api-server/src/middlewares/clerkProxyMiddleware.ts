/**
 * DEAD FILE — Clerk has been removed.
 *
 * Identity is first-party now (see ./requireAuth and ../routes/auth). The platform
 * console needs to impersonate any user, issue master password resets, force sign-out
 * everywhere and keep a real login trail; a third-party identity provider only lets
 * you do those indirectly, through its API.
 *
 * Emptied rather than deleted so that any stale import fails loudly at build time
 * instead of silently pulling Clerk back into the bundle. Safe to delete once you have
 * confirmed nothing references it.
 */
export {};
