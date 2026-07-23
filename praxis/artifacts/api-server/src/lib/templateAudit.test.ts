import { describe, it, expect } from "vitest";
import { auditDocumentContent, isClientSafe } from "./templateAudit";
import templatesData from "../data/documentTemplates.json";

interface Template { key: string; title: string; contentHtml: string }
const TEMPLATES = templatesData as Template[];

describe("auditDocumentContent", () => {
  it("flags internal codenames", () => {
    const findings = auditDocumentContent("The platform, marketed as Compass / Praxis, is great.");
    expect(findings.map((f) => f.match.toLowerCase())).toEqual(expect.arrayContaining(["compass", "praxis"]));
  });

  it("flags infrastructure leaks", () => {
    expect(auditDocumentContent("Connect to DATABASE_URL on localhost").length).toBeGreaterThanOrEqual(2);
    expect(auditDocumentContent("Hosted on railway.app with supabase storage").length).toBeGreaterThanOrEqual(2);
  });

  it("does not flag the legitimate provider entity name", () => {
    expect(isClientSafe("This agreement is with Synops Consulting Group (Pty) Ltd.")).toBe(true);
  });

  it("passes clean client copy", () => {
    expect(isClientSafe("The Platform is provided by the Provider under this Agreement.")).toBe(true);
  });
});

describe("shipped document templates are client-safe", () => {
  it("every template passes the audit (no internal leaks reach a client)", () => {
    const offenders = TEMPLATES.filter((t) => !isClientSafe(t.contentHtml)).map((t) => ({
      key: t.key,
      title: t.title,
      findings: auditDocumentContent(t.contentHtml).map((f) => f.label),
    }));
    expect(offenders).toEqual([]);
  });
});
