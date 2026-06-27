---
name: Typecheck requires libs built first
description: Why per-artifact tsc fails with phantom "no exported member" errors until libs are built.
---

Running `pnpm --filter <artifact> run typecheck` in a fresh environment can fail with `Module '"@workspace/db"' has no exported member 'usersTable'` (and similar) for code that is actually correct and deployed.

**Why:** workspace libs like `@workspace/db` are TS project references that `emitDeclarationOnly` via composite build (`tsc --build`). They have no `build` script. The dev/build pipeline uses esbuild (no typecheck), so the app runs fine, but `tsc` needs the emitted `.d.ts` files.

**How to apply:** run `pnpm run typecheck:libs` (root, = `tsc --build`) once before per-artifact typechecks. Don't mistake these phantom errors for real regressions in your changes.
