import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic client so analysis generation is deterministic (no network, no API key).
const create = vi.fn();
vi.mock("@workspace/integrations-anthropic-ai", () => ({ anthropic: { messages: { create: (...args: unknown[]) => create(...args) } } }));

import { generateSessionAnalysis } from "./socraticEngine";

const ctx = { beatTitle: "Cash flow", moduleTitle: "Finance", turnCount: 5 } as never;
const history = [
  { role: "tutor", content: "Why does cash flow matter?" },
  { role: "learner", content: "Because a business can be profitable but still run out of cash to pay suppliers." },
];

describe("generateSessionAnalysis (end-of-session report + recommendation)", () => {
  beforeEach(() => create.mockReset());

  it("returns a structured analysis and maps a mastered session to the certified verdict", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        summary: "You reasoned clearly about why cash flow matters.",
        strengths: ["Separated profit from cash", "Applied it to paying suppliers"],
        focusAreas: ["Extending to seasonal businesses"],
        recommendation: "Move on to the next module and review this in a week.",
      }) }],
    });
    const a = await generateSessionAnalysis({ ctx, history, finalMastery: 0.86, interactions: 6, reachedLimit: false, mastered: true });
    expect(a.verdict).toBe("certified");
    expect(a.masteryPercent).toBe(86);
    expect(a.interactions).toBe(6);
    expect(a.summary).toMatch(/cash flow/i);
    expect(a.strengths.length).toBeGreaterThan(0);
    expect(a.focusAreas.length).toBeGreaterThan(0);
    expect(a.recommendation).toMatch(/next module/i);
  });

  it("maps a limit-reached mid-progress session to the keep_going verdict", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ summary: "A solid start.", strengths: ["Stayed engaged"], focusAreas: ["Explaining the why"], recommendation: "Run another session." }) }] });
    const a = await generateSessionAnalysis({ ctx, history, finalMastery: 0.4, interactions: 5, reachedLimit: true, mastered: false });
    expect(a.verdict).toBe("keep_going");
    expect(a.masteryPercent).toBe(40);
  });

  it("falls back to a sensible, non-empty analysis when the model output cannot be parsed", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "the model returned prose, not JSON" }] });
    const a = await generateSessionAnalysis({ ctx, history, finalMastery: 0.72, interactions: 8, reachedLimit: true, mastered: false });
    expect(a.verdict).toBe("nearly"); // 72% -> nearly
    expect(a.summary.length).toBeGreaterThan(0);
    expect(a.strengths.length).toBeGreaterThan(0);
    expect(a.focusAreas.length).toBeGreaterThan(0);
    expect(a.recommendation.length).toBeGreaterThan(0);
  });

  it("sanitises markdown and dashes out of every field", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ summary: "You did **well** here — really.", strengths: ["*Clear* reasoning"], focusAreas: ["Edge – cases"], recommendation: "Keep going — you are close." }) }] });
    const a = await generateSessionAnalysis({ ctx, history, finalMastery: 0.5, interactions: 4, reachedLimit: true, mastered: false });
    const joined = [a.summary, ...a.strengths, ...a.focusAreas, a.recommendation].join(" ");
    expect(joined).not.toMatch(/[*—–]/); // no asterisks, em or en dashes
  });
});
