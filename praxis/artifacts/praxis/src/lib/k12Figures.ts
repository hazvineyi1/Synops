/**
 * K-12 lesson figures: hand-authored, dependency-free inline SVG illustrations used to break up
 * reading with a clear visual. Referenced from a module's reading text with a marker line
 * `[[fig:key]]` or `[[fig:key|Caption]]`, resolved by MarkdownView (ModuleViewer). Language-neutral
 * (labels are numeric/iconic where possible) so the same figure serves an English or Spanish lesson;
 * the caption in the marker carries any words. Style: flat, bold, thick strokes, bright non-pastel
 * palette, generous labels, crisp at any size.
 */

// Shared palette + a tiny helper so every figure looks like one family.
const C = {
  ink: "#1f2937", sub: "#475569", line: "#94a3b8", paper: "#ffffff",
  indigo: "#4F46E5", teal: "#0D9488", orange: "#F97316", amber: "#F59E0B",
  emerald: "#10B981", rose: "#E11D48", sky: "#0EA5E9", violet: "#7C3AED",
};

/** Wrap raw inner markup in a responsive, accessible SVG frame. */
const svg = (vb: string, inner: string) =>
  `<svg viewBox="${vb}" width="100%" role="img" xmlns="http://www.w3.org/2000/svg" style="max-height:230px;height:auto;display:block;font-family:ui-sans-serif,system-ui,sans-serif">${inner}</svg>`;

// A group of `n` filled dots inside a rounded card, used to picture "equal groups".
const dotGroup = (x: number, y: number, n: number, fill: string) => {
  let g = `<rect x="${x}" y="${y}" width="86" height="86" rx="14" fill="${fill}22" stroke="${fill}" stroke-width="3"/>`;
  const cols = 2, r = 11;
  for (let i = 0; i < n; i++) {
    const cx = x + 26 + (i % cols) * 34;
    const cy = y + 26 + Math.floor(i / cols) * 34;
    g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
  }
  return g;
};

export const K12_FIGURES: Record<string, string> = {
  // ── Multiplication: equal groups (3 groups of 4 = 12) ───────────────────────
  "equal-groups": svg("0 0 360 130",
    dotGroup(14, 22, 4, C.teal) + dotGroup(122, 22, 4, C.teal) + dotGroup(230, 22, 4, C.teal) +
    `<text x="108" y="70" font-size="30" font-weight="800" fill="${C.ink}" text-anchor="middle">+</text>` +
    `<text x="216" y="70" font-size="30" font-weight="800" fill="${C.ink}" text-anchor="middle">+</text>` +
    `<text x="180" y="122" font-size="17" font-weight="800" fill="${C.indigo}" text-anchor="middle">3 × 4 = 12</text>`),

  // ── Multiplication as an array (rows × columns), numeric only, language-neutral ─
  "array": svg("0 0 360 150", (() => {
    const rows = 3, cols = 4; let g = ""; const x0 = 90, y0 = 20, s = 30;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      g += `<rect x="${x0 + c * s}" y="${y0 + r * s}" width="24" height="24" rx="5" fill="${C.orange}" opacity="0.9"/>`;
    g += `<text x="180" y="138" font-size="18" font-weight="800" fill="${C.indigo}" text-anchor="middle">3 × 4 = 12</text>`;
    return g;
  })()),

  // ── Reading: main idea holds up the supporting details, word-free (caption carries language) ─
  "main-idea": svg("0 0 360 170",
    `<rect x="120" y="14" width="120" height="46" rx="12" fill="${C.indigo}" />` +
    `<text x="180" y="45" font-size="26" text-anchor="middle">💡</text>` +
    `<line x1="180" y1="60" x2="70" y2="90" stroke="${C.line}" stroke-width="3"/>` +
    `<line x1="180" y1="60" x2="180" y2="90" stroke="${C.line}" stroke-width="3"/>` +
    `<line x1="180" y1="60" x2="290" y2="90" stroke="${C.line}" stroke-width="3"/>` +
    [40, 150, 260].map((x) => `<rect x="${x}" y="90" width="60" height="56" rx="10" fill="${C.teal}22" stroke="${C.teal}" stroke-width="3"/><circle cx="${x + 30}" cy="118" r="9" fill="${C.teal}"/>`).join("")),

  // ── Reading: context clues, abstract "words" as bars, magnifier on the mystery word ─
  "context-clues": svg("0 0 360 130", (() => {
    let g = `<rect x="20" y="30" width="320" height="76" rx="12" fill="#f8fafc" stroke="${C.line}" stroke-width="2"/>`;
    const bars = [[36, 44], [90, 30], [128, 52], [232, 40]];
    bars.forEach(([x, w]) => { g += `<rect x="${x}" y="52" width="${w}" height="14" rx="7" fill="${C.line}"/>`; });
    g += `<rect x="184" y="46" width="40" height="26" rx="7" fill="${C.amber}33" stroke="${C.amber}" stroke-width="2.5"/><text x="204" y="66" font-size="16" font-weight="800" fill="${C.ink}" text-anchor="middle">?</text>`;
    g += `<path d="M150 84 Q195 96 202 74" fill="none" stroke="${C.teal}" stroke-width="2.5" marker-end="url(#cc)"/>`;
    g += `<path d="M256 84 Q214 96 206 74" fill="none" stroke="${C.teal}" stroke-width="2.5" marker-end="url(#cc)"/>`;
    g += `<circle cx="292" cy="44" r="16" fill="none" stroke="${C.indigo}" stroke-width="5"/><line x1="303" y1="55" x2="320" y2="74" stroke="${C.indigo}" stroke-width="6" stroke-linecap="round"/>`;
    return `<defs><marker id="cc" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${C.teal}"/></marker></defs>` + g;
  })()),

  // ── Ten-frame: ten and some more (place value), numeric/neutral ─────────────
  "ten-frame": svg("0 0 360 120", (() => {
    let g = ""; const x0 = 34, y0 = 26, s = 30;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) { g += `<rect x="${x0 + c * s}" y="${y0 + r * s}" width="26" height="26" rx="6" fill="#fff" stroke="${C.indigo}" stroke-width="2"/><circle cx="${x0 + c * s + 13}" cy="${y0 + r * s + 13}" r="9" fill="${C.indigo}"/>`; }
    g += `<text x="204" y="58" font-size="26" font-weight="800" fill="${C.ink}">+</text>`;
    [0, 1].forEach((i) => { g += `<circle cx="${242 + i * 34}" cy="52" r="12" fill="${C.orange}"/>`; });
    g += `<text x="300" y="60" font-size="20" font-weight="800" fill="${C.indigo}">= 12</text>`;
    return g;
  })()),

  // ── Vocabulary: a new word is a key that unlocks meaning (emoji only) ────────
  "word-key": svg("0 0 360 110",
    `<rect x="24" y="38" width="150" height="36" rx="10" fill="${C.teal}22" stroke="${C.teal}" stroke-width="3"/>` +
    `<text x="99" y="64" font-size="22" text-anchor="middle">🔑</text>` +
    `<line x1="182" y1="56" x2="214" y2="56" stroke="${C.sub}" stroke-width="4" marker-end="url(#wk)"/>` +
    `<rect x="222" y="38" width="114" height="36" rx="10" fill="${C.emerald}22" stroke="${C.emerald}" stroke-width="3"/>` +
    `<text x="279" y="65" font-size="20" text-anchor="middle">✅</text>` +
    `<defs><marker id="wk" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="${C.sub}"/></marker></defs>`),

  // ── Number line 0–30 with a marker ─────────────────────────────────────────
  "number-line": svg("0 0 360 80", (() => {
    let g = `<line x1="20" y1="40" x2="340" y2="40" stroke="${C.line}" stroke-width="4" stroke-linecap="round"/>`;
    for (let v = 0; v <= 30; v += 5) { const x = 20 + (v / 30) * 320; g += `<line x1="${x}" y1="32" x2="${x}" y2="48" stroke="${C.line}" stroke-width="2"/><text x="${x}" y="66" font-size="12" fill="${C.sub}" text-anchor="middle">${v}</text>`; }
    const mx = 20 + (12 / 30) * 320; g += `<circle cx="${mx}" cy="40" r="10" fill="${C.indigo}"/><text x="${mx}" y="22" font-size="13" font-weight="800" fill="${C.indigo}" text-anchor="middle">12</text>`;
    return g;
  })()),

  // ── Ratio as a tape diagram (2 : 3) ─────────────────────────────────────────
  "ratio-tape": svg("0 0 360 150",
    `<text x="16" y="44" font-size="14" font-weight="800" fill="${C.teal}">Cats</text>` +
    [0, 1].map((i) => `<rect x="${90 + i * 46}" y="26" width="40" height="28" rx="6" fill="${C.teal}" opacity="0.9"/>`).join("") +
    `<text x="16" y="104" font-size="14" font-weight="800" fill="${C.orange}">Dogs</text>` +
    [0, 1, 2].map((i) => `<rect x="${90 + i * 46}" y="86" width="40" height="28" rx="6" fill="${C.orange}" opacity="0.9"/>`).join("") +
    `<text x="180" y="140" font-size="15" font-weight="800" fill="${C.indigo}" text-anchor="middle">ratio 2 : 3</text>`),

  // ── Unit rate on a double number line ───────────────────────────────────────
  "double-number-line": svg("0 0 360 130", (() => {
    let g = "";
    g += `<line x1="30" y1="45" x2="330" y2="45" stroke="${C.teal}" stroke-width="4"/>`;
    g += `<line x1="30" y1="95" x2="330" y2="95" stroke="${C.orange}" stroke-width="4"/>`;
    const miles = ["0", "60", "120", "180"], hours = ["0", "1", "2", "3"];
    for (let i = 0; i < 4; i++) { const x = 30 + i * 100; g += `<line x1="${x}" y1="38" x2="${x}" y2="52" stroke="${C.teal}" stroke-width="2"/><text x="${x}" y="30" font-size="12" font-weight="700" fill="${C.teal}" text-anchor="middle">${miles[i]}</text>`; g += `<line x1="${x}" y1="88" x2="${x}" y2="102" stroke="${C.orange}" stroke-width="2"/><text x="${x}" y="118" font-size="12" font-weight="700" fill="${C.orange}" text-anchor="middle">${hours[i]}</text>`; }
    g += `<text x="180" y="72" font-size="13" font-weight="800" fill="${C.indigo}" text-anchor="middle">60 miles per 1 hour</text>`;
    return g;
  })()),

  // ── Food web / energy flow: sun → plant → bug → bird ────────────────────────
  "food-web": svg("0 0 360 120", (() => {
    const nodes = [["☀️", "Sun", C.amber], ["🌿", "Plant", C.emerald], ["🐛", "Bug", C.teal], ["🐦", "Bird", C.sky]];
    let g = ""; const y = 50;
    nodes.forEach((n, i) => { const x = 40 + i * 90; g += `<circle cx="${x}" cy="${y}" r="26" fill="${n[2]}22" stroke="${n[2]}" stroke-width="3"/><text x="${x}" y="${y + 7}" font-size="22" text-anchor="middle">${n[0]}</text><text x="${x}" y="${y + 44}" font-size="12" font-weight="700" fill="${n[2] as string}" text-anchor="middle">${n[1]}</text>`; if (i < 3) g += `<line x1="${x + 28}" y1="${y}" x2="${x + 62}" y2="${y}" stroke="${C.sub}" stroke-width="3" marker-end="url(#ar)"/>`; });
    return `<defs><marker id="ar" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="${C.sub}"/></marker></defs>` + g;
  })()),

  // ── Energy of motion: slow vs fast (bigger bar = more energy) ────────────────
  "speed-energy": svg("0 0 360 120",
    `<line x1="26" y1="46" x2="46" y2="46" stroke="${C.line}" stroke-width="3" stroke-linecap="round"/>` +
    `<circle cx="72" cy="46" r="22" fill="${C.teal}"/>` +
    `<rect x="40" y="84" width="60" height="16" rx="5" fill="${C.teal}" opacity="0.55"/>` +
    [0, 1, 2].map((i) => `<line x1="${196 + i * 10}" y1="${34 + i * 12}" x2="${224 + i * 10}" y2="${34 + i * 12}" stroke="${C.line}" stroke-width="3" stroke-linecap="round"/>`).join("") +
    `<circle cx="278" cy="46" r="22" fill="${C.orange}"/>` +
    `<rect x="214" y="84" width="128" height="16" rx="5" fill="${C.orange}"/>`),

  // ── Ways energy transfers: sound, light, heat, collision (emoji, neutral) ────
  "energy-transfer": svg("0 0 360 96", (() => {
    const items: [string, string][] = [["🔊", C.violet], ["☀️", C.amber], ["🔥", C.rose], ["🎱", C.teal]];
    let g = ""; items.forEach(([e, col], i) => { const x = 48 + i * 88; g += `<circle cx="${x}" cy="48" r="28" fill="${col}22" stroke="${col}" stroke-width="3"/><text x="${x}" y="57" font-size="26" text-anchor="middle">${e}</text>`; });
    return g;
  })()),

  // ── How a bill becomes a law: a left-to-right process flow ──────────────────
  "bill-to-law": svg("0 0 360 120", (() => {
    const steps: [string, string][] = [["📝", C.indigo], ["🏛️", C.violet], ["🗳️", C.teal], ["🖊️", C.orange], ["⚖️", C.emerald]];
    let g = "";
    steps.forEach(([e, col], i) => {
      const x = 34 + i * 74;
      g += `<circle cx="${x}" cy="46" r="24" fill="${col}22" stroke="${col}" stroke-width="3"/><text x="${x}" y="55" font-size="22" text-anchor="middle">${e}</text>`;
      if (i < steps.length - 1) g += `<line x1="${x + 26}" y1="46" x2="${x + 48}" y2="46" stroke="${C.sub}" stroke-width="3" marker-end="url(#bl)"/>`;
    });
    return `<defs><marker id="bl" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="${C.sub}"/></marker></defs>` + g;
  })()),

  // ── Balance scale for an equation a·x + b = c ───────────────────────────────
  "balance-scale": svg("0 0 360 160",
    `<line x1="60" y1="40" x2="300" y2="40" stroke="${C.ink}" stroke-width="5" stroke-linecap="round"/>` +
    `<line x1="180" y1="40" x2="180" y2="120" stroke="${C.ink}" stroke-width="5"/>` +
    `<rect x="150" y="120" width="60" height="14" rx="4" fill="${C.ink}"/>` +
    `<rect x="40" y="52" width="90" height="40" rx="10" fill="${C.indigo}22" stroke="${C.indigo}" stroke-width="3"/>` +
    `<text x="85" y="78" font-size="17" font-weight="800" fill="${C.indigo}" text-anchor="middle">2x + 3</text>` +
    `<rect x="230" y="52" width="90" height="40" rx="10" fill="${C.emerald}22" stroke="${C.emerald}" stroke-width="3"/>` +
    `<text x="275" y="78" font-size="17" font-weight="800" fill="${C.emerald}" text-anchor="middle">11</text>` +
    `<text x="180" y="150" font-size="13" font-weight="700" fill="${C.sub}" text-anchor="middle">Keep both sides equal</text>`),

  // ── Three branches of government ────────────────────────────────────────────
  "three-branches": svg("0 0 360 150", (() => {
    const b = [["Legislative", "Makes laws", C.indigo], ["Executive", "Carries out laws", C.orange], ["Judicial", "Interprets laws", C.teal]];
    let g = "";
    b.forEach((n, i) => { const x = 16 + i * 116; g += `<rect x="${x}" y="24" width="104" height="96" rx="12" fill="${n[2]}18" stroke="${n[2]}" stroke-width="3"/><text x="${x + 52}" y="58" font-size="14" font-weight="800" fill="${n[2] as string}" text-anchor="middle">${n[0]}</text><text x="${x + 52}" y="86" font-size="11" fill="${C.sub}" text-anchor="middle">${n[1]}</text>`; });
    g += `<text x="180" y="140" font-size="12" font-weight="700" fill="${C.sub}" text-anchor="middle">Each checks the others</text>`;
    return g;
  })()),

  // ── Essay structure: intro / body / conclusion ──────────────────────────────
  "essay-structure": svg("0 0 360 160", (() => {
    const rows = [["Introduction", "hook + main claim", C.indigo], ["Body", "reasons + evidence", C.teal], ["Body", "reasons + evidence", C.teal], ["Conclusion", "restate + wrap up", C.orange]];
    let g = ""; rows.forEach((r, i) => { const y = 14 + i * 36; g += `<rect x="60" y="${y}" width="240" height="30" rx="8" fill="${r[2]}18" stroke="${r[2]}" stroke-width="2.5"/><text x="74" y="${y + 20}" font-size="13" font-weight="800" fill="${r[2] as string}">${r[0]}</text><text x="290" y="${y + 20}" font-size="11" fill="${C.sub}" text-anchor="end">${r[1]}</text>`; });
    return g;
  })()),

  // ── Early phonics: a letter making its sound ────────────────────────────────
  "letter-sound": svg("0 0 360 120",
    `<rect x="30" y="20" width="80" height="80" rx="16" fill="${C.orange}22" stroke="${C.orange}" stroke-width="4"/>` +
    `<text x="70" y="82" font-size="52" font-weight="800" fill="${C.orange}" text-anchor="middle">A</text>` +
    `<text x="150" y="55" font-size="26" text-anchor="middle">🍎</text>` +
    `<text x="150" y="92" font-size="13" font-weight="700" fill="${C.sub}" text-anchor="middle">apple</text>` +
    `<line x1="118" y1="60" x2="132" y2="60" stroke="${C.sub}" stroke-width="3" marker-end="url(#a2)"/>` +
    `<defs><marker id="a2" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="${C.sub}"/></marker></defs>` +
    `<text x="250" y="65" font-size="16" font-weight="800" fill="${C.ink}" text-anchor="middle">/a/ says "ah"</text>`),

  // ── Why early cities grew by rivers: a river through farmland with a small city ─
  "river-civ": svg("0 0 360 150", (() => {
    let g = `<rect x="0" y="72" width="360" height="78" fill="${C.emerald}18"/>`;
    // crop rows on the near bank
    for (let i = 0; i < 6; i++) { g += `<line x1="${22 + i * 17}" y1="98" x2="${22 + i * 17}" y2="122" stroke="${C.emerald}" stroke-width="3" stroke-linecap="round"/>`; }
    // the river: a wavy band across the scene
    g += `<path d="M0 42 Q90 32 180 46 T360 42 L360 68 Q270 60 180 72 T0 64 Z" fill="${C.sky}" opacity="0.85"/>`;
    // sun
    g += `<circle cx="322" cy="26" r="14" fill="${C.amber}"/>`;
    // a small city on the far bank
    const bx = 248;
    g += `<rect x="${bx}" y="86" width="20" height="40" rx="2" fill="${C.indigo}"/>`;
    g += `<rect x="${bx + 24}" y="74" width="22" height="52" rx="2" fill="${C.violet}"/>`;
    g += `<rect x="${bx + 50}" y="94" width="18" height="32" rx="2" fill="${C.indigo}"/>`;
    // labels
    g += `<text x="96" y="34" font-size="13" font-weight="800" fill="${C.sky}" text-anchor="middle">River</text>`;
    g += `<text x="72" y="142" font-size="12" font-weight="700" fill="${C.emerald}" text-anchor="middle">Farmland</text>`;
    g += `<text x="286" y="142" font-size="12" font-weight="700" fill="${C.indigo}" text-anchor="middle">City</text>`;
    return g;
  })()),

  // ── Bill of Rights: a parchment scroll with the first ten amendments ──────────
  "bill-of-rights": svg("0 0 360 160", (() => {
    const x = 70, w = 220, y = 28, h = 100;
    let g = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${C.amber}22" stroke="${C.amber}" stroke-width="3"/>`;
    // rolled top and bottom
    g += `<rect x="${x - 12}" y="${y - 12}" width="${w + 24}" height="16" rx="8" fill="${C.amber}" opacity="0.9"/>`;
    g += `<rect x="${x - 12}" y="${y + h - 4}" width="${w + 24}" height="16" rx="8" fill="${C.amber}" opacity="0.9"/>`;
    // title
    g += `<text x="180" y="${y + 26}" font-size="15" font-weight="800" fill="${C.ink}" text-anchor="middle">Bill of Rights</text>`;
    // lines of "text"
    for (let i = 0; i < 3; i++) { g += `<line x1="${x + 24}" y1="${y + 44 + i * 15}" x2="${x + w - 24}" y2="${y + 44 + i * 15}" stroke="${C.line}" stroke-width="4" stroke-linecap="round"/>`; }
    g += `<text x="180" y="${y + h - 12}" font-size="11" font-weight="700" fill="${C.sub}" text-anchor="middle">First 10 amendments</text>`;
    return g;
  })()),

  // ── Separation of powers: three branches that each check the others ───────────
  "separation-powers": svg("0 0 360 186", (() => {
    const R = 32;
    const edge = (ax: number, ay: number, bx: number, by: number) => {
      const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
      const x1 = ax + ux * (R + 4), y1 = ay + uy * (R + 4), x2 = bx - ux * (R + 4), y2 = by - uy * (R + 4);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.sub}" stroke-width="3" marker-start="url(#sp)" marker-end="url(#sp)"/>`;
    };
    const nodes: [number, number, string, string][] = [[180, 42, "Legislative", C.indigo], [68, 148, "Executive", C.orange], [292, 148, "Judicial", C.teal]];
    let g = `<defs><marker id="sp" markerWidth="9" markerHeight="9" refX="4.5" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="${C.sub}"/></marker></defs>`;
    g += edge(180, 42, 68, 148) + edge(180, 42, 292, 148) + edge(68, 148, 292, 148);
    nodes.forEach((n) => { g += `<circle cx="${n[0]}" cy="${n[1]}" r="${R}" fill="${n[3]}22" stroke="${n[3]}" stroke-width="3"/><text x="${n[0]}" y="${(n[1] as number) + 4}" font-size="10.5" font-weight="800" fill="${n[3] as string}" text-anchor="middle">${n[2]}</text>`; });
    g += `<text x="180" y="102" font-size="11" font-weight="700" fill="${C.sub}" text-anchor="middle">checks &amp; balances</text>`;
    return g;
  })()),
};

export function figureSvg(key: string): string | null {
  return K12_FIGURES[key] ?? null;
}
