export * from "./types";
export * from "./ccne";
export * from "./abet";
export * from "./aacsb";
export * from "./sacscoc";
export * from "./assembler";

// All built-in accreditor reference datasets, in seed order.
import { CCNE_FRAMEWORK } from "./ccne";
import { ABET_FRAMEWORK } from "./abet";
import { AACSB_FRAMEWORK } from "./aacsb";
import { SACSCOC_FRAMEWORK } from "./sacscoc";
import type { AccreditorFrameworkSeed } from "./ccne";

export const BUILTIN_FRAMEWORKS: AccreditorFrameworkSeed[] = [
  CCNE_FRAMEWORK,
  ABET_FRAMEWORK,
  AACSB_FRAMEWORK,
  SACSCOC_FRAMEWORK,
];
