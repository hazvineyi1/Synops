// Admin checks now live in the shared @workspace/identity package.
// Re-exported here so existing importers keep their paths.
export { isAdminUser, requireAdmin } from "@workspace/identity";
