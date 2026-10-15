import { slug } from "github-slugger";
import type { Heading } from "mdast";
import { type Block, plainText } from "../page.ts";
import { type ParseContext, report } from "./context.ts";
import { inlines } from "./inline.ts";
import { positionOf } from "./markdown.ts";

const idPattern = /^[a-z0-9][a-z0-9-]*$/;
const explicitIdPattern = /[ \t]*\{#([^}]*)\}[ \t]*$/;

export const heading = (ctx: ParseContext, node: Heading): Block | undefined => {
  const at = positionOf(node);
  if (node.depth === 1) return report(ctx, at, "a page has exactly one # heading, its first line");
  const depth = node.depth;
  if (depth !== 2 && depth !== 3 && depth !== 4) {
    return report(ctx, at, "headings deeper than #### are not supported");
  }
  const children = [...node.children];
  const last = children.at(-1);
  let explicitId: string | undefined;
  if (last?.type === "text") {
    const match = explicitIdPattern.exec(last.value);
    if (match !== null) {
      explicitId = match[1] ?? "";
      const value = last.value.slice(0, match.index);
      if (value === "") children.pop();
      else children[children.length - 1] = { ...last, value };
    }
  }
  const content = inlines(ctx, children);
  const text = plainText(content).trim();
  if (text === "") return report(ctx, at, "heading has no text");
  let id: string;
  if (explicitId !== undefined) {
    if (!idPattern.test(explicitId)) {
      return report(ctx, at, `heading id "${explicitId}" must match ${idPattern.source}`);
    }
    if (ctx.usedIds.has(explicitId)) {
      return report(ctx, at, `heading id "${explicitId}" is used twice`);
    }
    id = explicitId;
  } else {
    const base = slug(text);
    if (base === "") return report(ctx, at, "heading text yields an empty id; add {#id}");
    id = base;
    for (let suffix = 1; ctx.usedIds.has(id); suffix++) id = `${base}-${suffix}`;
  }
  ctx.usedIds.add(id);
  ctx.toc.push({ depth, id, text });
  return { type: "heading", depth, id, children: content };
};
