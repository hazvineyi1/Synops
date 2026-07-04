// Hand-written type surface for the Compass mount entry (see src/mount.ts).
//
// The package.json "./mount" export maps the "types" condition here and the
// runtime/bundler condition to src/mount.ts. This lets the type-gated host
// (paideia-api) consume createCompassMount() WITHOUT pulling the entire
// (not-yet-typechecked) Compass backend source into its typecheck program,
// while esbuild still bundles the real implementation. Remove/replace once the
// Compass backend is fully typechecked (re-enable compass-api's typecheck).
import type { IRouter } from "express";

/**
 * Build the Compass Curriculum Builder API as a mountable Express router.
 * The caller must ensure process.env.SESSION_SECRET is set before calling.
 */
export function createCompassMount(): IRouter;
