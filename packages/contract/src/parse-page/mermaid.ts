import { parseMermaid, renderMermaidSVG } from "beautiful-mermaid";
import * as Equal from "effect/Equal";
import type { Position } from "../page.ts";
import { type ParseContext, report } from "./context.ts";

interface Renderer {
  readonly observe: (text: string) => unknown;
  readonly probes: ReadonlyArray<(line: string) => string>;
  readonly alwaysUnderstood?: RegExp;
}

const xmlEntities: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const decodeXml = (text: string): string =>
  text.replace(
    /&(?:#(\d+)|#[xX]([\da-fA-F]+)|(amp|lt|gt|quot|apos));/g,
    (_, decimal?: string, hex?: string, name?: string) => {
      if (name !== undefined) return xmlEntities[name] ?? "";
      const code = decimal === undefined ? Number.parseInt(hex ?? "", 16) : Number(decimal);
      return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
        ? String.fromCodePoint(code)
        : "\uFFFD";
    },
  );

const flowchart: Renderer = {
  observe: (text) => parseMermaid(decodeXml(text)),
  probes: [" & _probe", ",x:_probe"].map(
    (probe) => (line: string) =>
      line.endsWith(";") ? `${line.slice(0, -1)}${probe};` : `${line}${probe}`,
  ),
};
const stateDiagram: Renderer = {
  ...flowchart,
  alwaysUnderstood: /^direction\s+(TD|TB|LR|BT|RL)\s*$/i,
};
const rendered: Renderer = {
  observe: (text) => renderMermaidSVG(text),
  probes: [(line) => `${line}_probe`, (line) => `${line} _probe`],
};
const erDiagram: Renderer = {
  ...rendered,
  probes: [...rendered.probes, (line) => line.replace(/^(\s*\S+)/, "$1_probe")],
};
const xyChart: Renderer = { observe: (text) => renderMermaidSVG(text), probes: [() => ""] };

const routes: ReadonlyArray<readonly [RegExp, Renderer]> = [
  [/^xychart(-beta)?\b/, xyChart],
  [/^sequencediagram\s*$/, rendered],
  [/^classdiagram\s*$/, rendered],
  [/^erdiagram\s*$/, erDiagram],
];

const lineRules: ReadonlyArray<{
  readonly applies: (line: string, header: string) => boolean;
  readonly message: string;
}> = [
  { applies: (line) => /^\s*click\s/.test(line), message: "mermaid click is not supported" },
  { applies: (line) => line.includes("@{"), message: "mermaid @{} shapes are not supported" },
  {
    applies: (line, header) => /^stateDiagram/i.test(header) && /^\s*note\s/.test(line),
    message: "mermaid state diagram notes are not supported",
  },
];

const observed = (renderer: Renderer, text: string): { value: unknown } | { error: string } => {
  try {
    return { value: renderer.observe(text) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

export const mermaidProblems = (ctx: ParseContext, source: string, at: Position): void => {
  const lines = source.split("\n");
  const content = lines.map((line) => line.trim() !== "" && !line.trim().startsWith("%%"));
  const headerIndex = content.indexOf(true);
  const header = lines[headerIndex]?.trim() ?? "";
  const routed = source.trim().split(/[\n;]/)[0]?.trim().toLowerCase() ?? "";
  const renderer =
    routes.find(([pattern]) => pattern.test(routed))?.[1] ??
    (/^stateDiagram(-v2)?\s*$/i.test(header) ? stateDiagram : flowchart);
  const base = observed(renderer, source);
  if ("error" in base) {
    report(ctx, at, base.error);
    return;
  }
  lines.forEach((line, index) => {
    if (index === headerIndex || content[index] !== true) return;
    const lineAt = { line: at.line + index + 1, column: 1 };
    const known = lineRules.filter((rule) => rule.applies(line, header));
    for (const rule of known) report(ctx, lineAt, rule.message);
    if (known.length > 0 || renderer.alwaysUnderstood?.test(line.trim())) return;
    const understood = renderer.probes.some((probe) => {
      const probed = lines.with(index, probe(line.trimEnd())).join("\n");
      const result = observed(renderer, probed);
      return "error" in result || !Equal.equals(result.value, base.value);
    });
    if (!understood) {
      report(ctx, lineAt, "mermaid line would be dropped by the renderer");
    }
  });
};
