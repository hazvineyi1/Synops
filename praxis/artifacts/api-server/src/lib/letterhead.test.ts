import { describe, it, expect } from "vitest";
import { drawLetterheadHeader, drawLetterheadFooters, LETTERHEAD } from "./letterhead";

/**
 * The letterhead is the one identity every platform-generated document carries, so it
 * must always show the registered provider name and must NEVER show an internal codename
 * ("Praxis"/"Compass"). We drive the helpers with a recording stub and assert on the text
 * they emit - this is the regression guard that a future edit can't reintroduce a codename.
 */

interface Recorder {
  texts: string[];
  page: { width: number; height: number; margins: { left: number; right: number } };
  y: number;
  [k: string]: unknown;
}

function makeDoc(pages = 2): Recorder {
  const doc: Recorder = {
    texts: [],
    page: { width: 595, height: 842, margins: { left: 48, right: 48 } },
    y: 100,
  };
  const chain = () => doc;
  doc.fillColor = chain;
  doc.fontSize = chain;
  doc.font = chain;
  doc.moveDown = chain;
  doc.moveTo = chain;
  doc.lineTo = chain;
  doc.strokeColor = chain;
  doc.stroke = chain;
  doc.switchToPage = chain;
  doc.bufferedPageRange = () => ({ start: 0, count: pages });
  doc.text = (t: string) => { doc.texts.push(String(t)); return doc; };
  return doc;
}

describe("letterhead", () => {
  it("draws the registered provider name in the header, never a codename", () => {
    const doc = makeDoc();
    drawLetterheadHeader(doc as never);
    const joined = doc.texts.join(" | ");
    expect(joined).toContain(LETTERHEAD.providerName);
    expect(joined).not.toMatch(/praxis|compass/i);
  });

  it("stamps a footer on every page with the provider name and no codename", () => {
    const doc = makeDoc(3);
    drawLetterheadFooters(doc as never, "Accreditation Readiness Report — Acme");
    // one footer per page
    expect(doc.texts).toHaveLength(3);
    for (const line of doc.texts) {
      expect(line).toContain(LETTERHEAD.providerName);
      expect(line).toMatch(/page \d+ of 3/);
      expect(line).not.toMatch(/praxis|compass/i);
    }
  });

  it("uses a client-safe provider identity (no internal (Pty) Ltd codename mix-ups)", () => {
    expect(LETTERHEAD.providerName).toBe("Synops Consulting Group");
    expect(LETTERHEAD.confidentiality).not.toMatch(/praxis|compass/i);
  });
});
