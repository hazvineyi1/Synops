// @workspace/identity — shared Clerk wiring for all Synops products.
// Generic plumbing only; product-specific user provisioning is supplied by the
// product via createRequireAuth's callback.

export { getAuth, clerkClient } from "@clerk/express";
export { createRequireAuth } from "./require-auth";
export type { AuthProvision, ClerkAuth } from "./require-auth";
export { isAdminUser, requireAdmin } from "./admin";
export { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./clerk-proxy";
