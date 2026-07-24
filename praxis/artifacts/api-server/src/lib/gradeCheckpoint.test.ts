import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic client so grading is deterministic (no network, no API key needed).
const create = vi.fn();
vi.mock("@workspace/integrations-anthropic-ai", () => ({ anthropic: { messages: { create: (...args: unknown[]) => create(...args) } } }));

import { gradeCheckpoint } from "./socraticEngine";

const ctx = { beatTitle: "Cash flow", moduleTitle: "Finance", narration: "", scenario: "" } as never;
const history = [{ role: "tutor", content: "Why does cash flow matter?" }];
const modelSays = (grade: number, reasoning = "ok") => ({ content: [{ type: "text", text: JSON.stringify({ grade, reasoning }) }] });

describe("gradeCheckpoint fairness (fix B)", () => {
  beforeEach(() => create.mockReset());

  it("lets a correct SELECTED answer earn up to grade 3 (no more cap at 2)", async () => {
    create.mockResolvedValue(modelSays(3, "clearly correct, best-fit choice"));
    const r = await gradeCheckpoint(ctx, "Because it keeps the business solvent", history, true /* isSelection */);
    expect(r.grade).toBe(3); // previously hard-capped at 2 for selections
  });

  it("still grades a weak selected answer low, on the full scale", async () => {
    create.mockResolvedValue(modelSays(1, "partly right"));
    const r = await gradeCheckpoint(ctx, "It is about profit", history, true);
    expect(r.grade).toBe(1);
  });

  it("retries once, then applies a NEUTRAL (grade 2) fallback when grading fails - not a punitive near-zero", async () => {
    // A response with no parseable JSON is a real grader failure mode; gradeOnce returns null so the
    // retry path runs, then the neutral fallback applies.
    create.mockResolvedValue({ content: [{ type: "text", text: "the grader returned prose, not JSON" }] });
    const r = await gradeCheckpoint(ctx, "A substantive answer that is not a refusal", history, true);
    expect(create).toHaveBeenCalledTimes(2); // one retry before falling back
    expect(r.grade).toBe(2); // neutral partial credit (old behaviour capped selections at 1)
  });

  it("never certifies from a fallback: grade 2 targets ~0.78, below the 0.8 bar", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "no json here" }] });
    const r = await gradeCheckpoint(ctx, "A real attempt at reasoning here", history, false);
    // Certification requires grade >= 2 AND mastery >= 0.8; grade 2 alone can only approach 0.78.
    expect(r.grade).toBe(2);
  });

  it("scores an outright refusal as 0 up front, without calling the grader", async () => {
    const r = await gradeCheckpoint(ctx, "idk", history, false);
    expect(r.grade).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });
});
