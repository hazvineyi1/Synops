import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic client so grading is deterministic (no network, no API key needed).
const create = vi.fn();
vi.mock("@workspace/integrations-anthropic-ai", () => ({ anthropic: { messages: { create: (...args: unknown[]) => create(...args) } } }));

import { gradeCheckpoint, generateAnswerOptions } from "./socraticEngine";

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

describe("generateAnswerOptions robustness (fix A)", () => {
  beforeEach(() => create.mockReset());
  const opts = (mode: string, options: string[]) => ({ content: [{ type: "text", text: JSON.stringify({ mode, options }) }] });

  it("retries once when the first response has no parseable JSON, instead of dropping the buttons", async () => {
    create
      .mockResolvedValueOnce({ content: [{ type: "text", text: "sorry, prose not json" }] })
      .mockResolvedValueOnce(opts("single", ["It improves cash flow", "It raises costs", "It has no effect"]));
    const r = await generateAnswerOptions("Why keep an eye on cash flow?", ctx);
    expect(create).toHaveBeenCalledTimes(2);
    expect(r.mode).toBe("single");
    expect(r.options.length).toBeGreaterThanOrEqual(2);
  });

  it("returns free-form only when the model genuinely says free (no wasteful retry)", async () => {
    create.mockResolvedValue(opts("free", []));
    const r = await generateAnswerOptions("Tell me about a time you managed a tight budget", ctx);
    expect(r.mode).toBe("free");
    expect(create).toHaveBeenCalledTimes(1); // a genuine free verdict is not retried
  });

  it("falls back to free-form only after both attempts fail", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "still not json" }] });
    const r = await generateAnswerOptions("A question", ctx);
    expect(create).toHaveBeenCalledTimes(2);
    expect(r.mode).toBe("free");
  });
});
