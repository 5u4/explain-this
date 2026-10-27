import type { PhrasingContent } from "mdast";
import { type Inline, type Position, pageIdPattern } from "../page.ts";
import { citation, type ParseContext, report } from "./context.ts";
import { describeNode, htmlNotSupported, isHtmlTag, positionOf } from "./markdown.ts";

const pageLinkPattern = /^\.\/([^/#]+)\.md(?:#(.*))?$/;
const schemePattern = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const externalSchemes: Readonly<Record<string, true>> = { http: true, https: true, mailto: true };

const link = (
  ctx: ParseContext,
  url: string,
  children: ReadonlyArray<Inline>,
  at: Position,
): Inline | undefined => {
  if (url.startsWith("#")) {
    const anchor = url.slice(1);
    if (anchor === "") return report(ctx, at, "link anchor is empty");
    ctx.pageLinks.push({ page: ctx.pageId, anchor, at });
    return { type: "pageLink", page: ctx.pageId, anchor, children };
  }
  if (url.startsWith("./")) {
    const match = pageLinkPattern.exec(url);
    const page = match?.[1];
    if (match === null || page === undefined || !pageIdPattern.test(page)) {
      return report(ctx, at, `page link "${url}" must be ./<page>.md or ./<page>.md#<anchor>`);
    }
    const anchor = match[2] ?? null;
    if (anchor === "") return report(ctx, at, `page link "${url}" has an empty anchor`);
    ctx.pageLinks.push({ page, anchor, at });
    return { type: "pageLink", page, anchor, children };
  }
  const scheme = schemePattern.exec(url)?.[1];
  if (scheme === undefined) {
    return report(
      ctx,
      at,
      `link target "${url}" must be a citation, ./<page>.md, #<anchor>, or an http, https, or mailto URL`,
    );
  }
  if (Object.hasOwn(externalSchemes, scheme)) return { type: "link", href: url, children };
  const ref = citation(ctx, url, at);
  return ref === undefined ? undefined : { type: "citation", ref, children };
};

export const inlines = (ctx: ParseContext, nodes: ReadonlyArray<PhrasingContent>): Array<Inline> =>
  nodes.flatMap((node) => {
    const converted = inline(ctx, node);
    return converted === undefined ? [] : [converted];
  });

const inline = (ctx: ParseContext, node: PhrasingContent): Inline | undefined => {
  const at = positionOf(node);
  switch (node.type) {
    case "text":
      return { type: "text", value: node.value };
    case "strong":
    case "emphasis":
    case "delete":
      return { type: node.type, children: inlines(ctx, node.children) };
    case "inlineCode":
      return { type: "inlineCode", value: node.value };
    case "break":
      return { type: "break" };
    case "link":
      return link(ctx, node.url, inlines(ctx, node.children), at);
    case "mdxJsxTextElement":
      return report(
        ctx,
        at,
        isHtmlTag(node.name ?? "")
          ? htmlNotSupported
          : `<${node.name ?? ""}> must stand on its own lines, not inside text`,
      );
    default:
      return report(ctx, at, `${describeNode(node)} is not supported`);
  }
};
