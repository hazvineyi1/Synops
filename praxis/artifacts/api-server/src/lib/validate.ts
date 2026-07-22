import type { Request, Response } from "express";

/**
 * Small dependency-free request-body validator for write endpoints.
 *
 * LENIENT BY DESIGN: it only checks the fields named in the spec — unknown fields pass through
 * untouched — so it can be added to a live endpoint without rejecting payloads that already work.
 * It centralises the ad-hoc "x is required" checks the handlers were doing by hand, and adds type /
 * shape / bound guards so a malformed write is rejected with a clean 400 instead of reaching the DB.
 */

export type FieldType = "string" | "email" | "boolean" | "number" | "array";

export interface FieldRule {
  type?: FieldType; // default "string"
  required?: boolean;
  enum?: readonly string[];
  maxLength?: number;
  min?: number;
  max?: number;
}
export type BodySpec = Record<string, FieldRule>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate `req.body` against `spec`. On the first failure it writes a 400 (`{ error, errors }`)
 * and returns null — callers do `const body = validateBody(req, res, spec); if (!body) return;`.
 * Returns the body (typed) when valid.
 */
export function validateBody<T = Record<string, unknown>>(
  req: Request,
  res: Response,
  spec: BodySpec,
): T | null {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  for (const [key, rule] of Object.entries(spec)) {
    const v = body[key];
    const present = v !== undefined && v !== null && v !== "";
    if (!present) {
      if (rule.required) errors.push(`${key} is required`);
      continue;
    }
    const type = rule.type ?? "string";
    if (type === "email") {
      if (typeof v !== "string" || !EMAIL.test(v.trim())) errors.push(`${key} must be a valid email address`);
    } else if (type === "string") {
      if (typeof v !== "string") errors.push(`${key} must be text`);
      else if (rule.maxLength && v.length > rule.maxLength) errors.push(`${key} is too long`);
    } else if (type === "boolean") {
      if (typeof v !== "boolean") errors.push(`${key} must be true or false`);
    } else if (type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) errors.push(`${key} must be a number`);
      else {
        if (rule.min != null && n < rule.min) errors.push(`${key} is too small`);
        if (rule.max != null && n > rule.max) errors.push(`${key} is too large`);
      }
    } else if (type === "array") {
      if (!Array.isArray(v)) errors.push(`${key} must be a list`);
    }
    if (rule.enum && typeof v === "string" && !rule.enum.includes(v)) {
      errors.push(`${key} must be one of: ${rule.enum.join(", ")}`);
    }
  }

  if (errors.length) {
    res.status(400).json({ error: errors[0], errors });
    return null;
  }
  return body as T;
}
