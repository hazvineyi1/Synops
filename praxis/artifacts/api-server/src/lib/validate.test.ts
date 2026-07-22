import { describe, it, expect } from "vitest";
import { validateBody, type BodySpec } from "./validate";

// Request-body validation for write endpoints. Pure, no DB. A tiny req/res stub captures whether a
// 400 was written and with what message, so we can assert both the accept and reject paths.

function run(body: unknown, spec: BodySpec) {
  const req = { body } as any;
  let status = 200;
  let payload: any = null;
  const res = {
    status(c: number) { status = c; return this; },
    json(p: any) { payload = p; return this; },
  } as any;
  const result = validateBody(req, res, spec);
  return { result, status, payload };
}

describe("validateBody", () => {
  it("passes a valid body through and returns it", () => {
    const { result, status } = run({ name: "Acme", industry: "Tech" }, { name: { required: true }, industry: {} });
    expect(status).toBe(200);
    expect(result).toEqual({ name: "Acme", industry: "Tech" });
  });

  it("rejects a missing required field with a 400 and null result", () => {
    const { result, status, payload } = run({ industry: "Tech" }, { name: { required: true } });
    expect(status).toBe(400);
    expect(result).toBeNull();
    expect(payload.error).toContain("name");
  });

  it("treats empty string and null as absent for required checks", () => {
    expect(run({ name: "" }, { name: { required: true } }).status).toBe(400);
    expect(run({ name: null }, { name: { required: true } }).status).toBe(400);
  });

  it("does not require optional fields when absent", () => {
    expect(run({ name: "Acme" }, { name: { required: true }, industry: {} }).status).toBe(200);
  });

  it("validates email format", () => {
    expect(run({ email: "not-an-email" }, { email: { type: "email", required: true } }).status).toBe(400);
    expect(run({ email: "a@b.co" }, { email: { type: "email", required: true } }).status).toBe(200);
  });

  it("enforces enum membership", () => {
    const spec: BodySpec = { role: { required: true, enum: ["coach", "learner"] as const } };
    expect(run({ role: "admin" }, spec).status).toBe(400);
    expect(run({ role: "coach" }, spec).status).toBe(200);
  });

  it("enforces number bounds and rejects non-numbers", () => {
    const spec: BodySpec = { n: { type: "number", min: 0, max: 100 } };
    expect(run({ n: 50 }, spec).status).toBe(200);
    expect(run({ n: 150 }, spec).status).toBe(400);
    expect(run({ n: "abc" }, spec).status).toBe(400);
  });

  it("enforces string maxLength and type", () => {
    expect(run({ name: "x".repeat(10) }, { name: { maxLength: 5 } }).status).toBe(400);
    expect(run({ name: 123 }, { name: {} }).status).toBe(400); // wrong type
  });

  it("is lenient: unknown fields pass through untouched", () => {
    const { result, status } = run({ name: "Acme", extra: "kept" }, { name: { required: true } });
    expect(status).toBe(200);
    expect((result as any).extra).toBe("kept");
  });
});
