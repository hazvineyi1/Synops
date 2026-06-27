// The Clerk proxy now lives in the shared @workspace/identity package.
// Re-exported here so app.ts keeps its import path.
export {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "@workspace/identity";
