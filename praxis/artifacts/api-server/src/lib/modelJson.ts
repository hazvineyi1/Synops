/**
 * Tolerant parser for model JSON output. Models occasionally wrap JSON in ```code fences```, add a
 * sentence before/after, leave a trailing comma, or (when max_tokens is too small) truncate the tail.
 * A bare JSON.parse throws on all of these and the caller loses a perfectly recoverable result — which
 * is exactly what left rubric generation 502-ing and the alignment report all-empty. This strips fences,
 * isolates the outermost object, and retries with a couple of cheap repairs (trailing commas, closing an
 * unterminated object/array from truncation) before giving up.
 */
export function parseModelJson(raw: string): any | null {
  if (!raw) return null;
  let t = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = t.indexOf("{");
  if (start === -1) return null;
  t = t.slice(start);
  const tryParse = (x: string): any | undefined => { try { return JSON.parse(x); } catch { return undefined; } };
  // 1. As-is (from first { to last }).
  const lastBrace = t.lastIndexOf("}");
  if (lastBrace !== -1) {
    const body = t.slice(0, lastBrace + 1);
    let p = tryParse(body); if (p !== undefined) return p;
    p = tryParse(body.replace(/,\s*([}\]])/g, "$1")); if (p !== undefined) return p; // drop trailing commas
  }
  // 2. Truncated output: close any still-open brackets in order.
  let inStr = false, esc = false; const stack: string[] = [];
  for (const ch of t) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let repaired = t.replace(/,\s*$/, "");
  if (inStr) repaired += '"';
  for (let i = stack.length - 1; i >= 0; i--) repaired += stack[i] === "{" ? "}" : "]";
  return tryParse(repaired) ?? tryParse(repaired.replace(/,\s*([}\]])/g, "$1")) ?? null;
}
