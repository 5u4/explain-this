import type { Code } from "mdast";
import type { Block } from "../page.ts";
import { citation, type ParseContext, report } from "./context.ts";
import { positionOf } from "./markdown.ts";
import { mermaidProblems } from "./mermaid.ts";

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
      mermaidProblems(ctx, node.value, at);
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
