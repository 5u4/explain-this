import type { Code } from "mdast";
import type { Block } from "../page.ts";
import { citation, type ParseContext, report } from "./context.ts";
import { positionOf } from "./markdown.ts";

const mermaidProblems = (ctx: ParseContext, node: Code): void => {
  const lines = node.value.split("\n");
  const header = lines.find((line) => line.trim() !== "" && !line.trim().startsWith("%%"));
  const diagram = header?.trim().split(/\s+/)[0] ?? "";
  const at = positionOf(node);
  if (diagram === "gantt" || diagram === "architecture-beta") {
    report(ctx, at, `mermaid ${diagram} diagrams are not supported`);
  }
  lines.forEach((line, index) => {
    const lineAt = { line: at.line + index + 1, column: 1 };
    if (/^\s*click\s/.test(line)) report(ctx, lineAt, "mermaid click is not supported");
    if (line.includes("@{")) report(ctx, lineAt, "mermaid @{} shapes are not supported");
    if (diagram.startsWith("stateDiagram") && /^\s*note\s/.test(line)) {
      report(ctx, lineAt, "mermaid state diagram notes are not supported");
    }
  });
};

export const code = (ctx: ParseContext, node: Code): Block | undefined => {
  const at = positionOf(node);
  const info = [node.lang, node.meta].filter((part) => part != null && part !== "").join(" ");
  const words = info === "" ? [] : info.split(/\s+/);
  const fileWord = words.find((word) => word.startsWith("file="));
  const lang = words[0] === undefined || words[0] === fileWord ? null : words[0];
  const extra = words.filter((word) => word !== fileWord && word !== lang);
  if (extra.length > 0) return report(ctx, at, `unsupported code fence info "${extra.join(" ")}"`);
  if (fileWord === undefined) {
    if (lang === "mermaid") {
      mermaidProblems(ctx, node);
      return { type: "mermaid", value: node.value };
    }
    return { type: "code", lang, value: node.value };
  }
  if (lang === "mermaid") return report(ctx, at, "a mermaid fence cannot be an excerpt");
  if (node.value !== "") {
    return report(ctx, at, "an excerpt fence (file=...) must have an empty body");
  }
  const ref = citation(ctx, fileWord.slice("file=".length), at);
  return ref === undefined ? undefined : { type: "excerpt", lang, ref };
};
