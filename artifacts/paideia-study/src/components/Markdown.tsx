import { Fragment, type ReactNode } from "react";

// Lightweight Markdown renderer for tutor messages: headings, bold/italic/inline
// code, bullet + numbered lists, GitHub-style tables, and paragraphs. Not a full
// spec, but covers what the tutor produces without pulling in a dependency.

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
    if (m[2] !== undefined) nodes.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3] !== undefined) nodes.push(<em key={key++}>{m[3]}</em>);
    else if (m[4] !== undefined) nodes.push(<code key={key++} className="px-1 py-0.5 rounded bg-black/10 text-[0.85em]">{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return nodes;
}

function splitRow(line: string): string[] {
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
}

export function Markdown({ content }: { content: string }) {
  const lines = (content ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) { i++; continue; }

    // Heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1] ? h[1].length : 1;
      const cls = level <= 1 ? "text-base font-bold mt-3 mb-1" : level === 2 ? "text-sm font-bold mt-3 mb-1" : "text-sm font-semibold mt-2 mb-0.5";
      blocks.push(<div key={key++} className={cls}>{renderInline(h[2] ?? "")}</div>);
      i++; continue;
    }

    // Table: a header row with pipes followed by a |---|---| separator
    const next = lines[i + 1] ?? "";
    if (line.includes("|") && /^\s*\|?[\s:-]+\|[\s:|-]*$/.test(next)) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").includes("|")) { rows.push(splitRow(lines[i] ?? "")); i++; }
      blocks.push(
        <div key={key++} className="my-2 overflow-x-auto">
          <table className="text-xs border-collapse w-full">
            <thead><tr>{header.map((c, j) => <th key={j} className="border border-black/10 px-2 py-1 text-left bg-black/5 font-semibold">{renderInline(c)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className="border border-black/10 px-2 py-1 align-top">{renderInline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? "")) { items.push((lines[i] ?? "").replace(/^\s*[-*]\s+/, "")); i++; }
      blocks.push(<ul key={key++} className="list-disc pl-5 my-1 space-y-0.5">{items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ul>);
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) { items.push((lines[i] ?? "").replace(/^\s*\d+\.\s+/, "")); i++; }
      blocks.push(<ol key={key++} className="list-decimal pl-5 my-1 space-y-0.5">{items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ol>);
      continue;
    }

    // Paragraph
    const para: string[] = [];
    while (
      i < lines.length && (lines[i] ?? "").trim() &&
      !/^#{1,4}\s/.test(lines[i] ?? "") && !/^\s*[-*]\s+/.test(lines[i] ?? "") &&
      !/^\s*\d+\.\s+/.test(lines[i] ?? "") && !(lines[i] ?? "").includes("|")
    ) { para.push(lines[i] ?? ""); i++; }
    if (para.length) blocks.push(<p key={key++} className="my-1 leading-relaxed">{renderInline(para.join(" "))}</p>);
    else i++;
  }

  return <div className="space-y-0.5">{blocks}</div>;
}
