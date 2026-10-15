import type { Nodes, Paragraph } from "mdast";
import type { MdxJsxFlowElement, MdxJsxTextElement } from "mdast-util-mdx-jsx";
import type { Inline, LabeledBlocks } from "../page.ts";
import { attributes } from "./attributes.ts";
import { blocks } from "./block.ts";
import { type ParseContext, report } from "./context.ts";
import { inlines } from "./inline.ts";
import { describeNode, type JsxElement, positionOf } from "./markdown.ts";

const blankLinePattern = /\n[ \t>]*\n/;

export const requireBlankLines = (
  ctx: ParseContext,
  element: MdxJsxFlowElement,
  children: ReadonlyArray<Nodes>,
  after: Nodes = element,
): void => {
  const start = after === element ? after.position?.start.offset : after.position?.end.offset;
  const end = element.position?.end.offset;
  const firstStart = children[0]?.position?.start.offset;
  const lastEnd = children.at(-1)?.position?.end.offset;
  if (start === undefined || end === undefined) return;
  if (firstStart === undefined || lastEnd === undefined) return;
  if (
    !blankLinePattern.test(ctx.source.slice(start, firstStart)) ||
    !blankLinePattern.test(ctx.source.slice(lastEnd, end))
  ) {
    report(
      ctx,
      positionOf(element),
      `<${element.name}> needs a blank line between the tag and its Markdown children`,
    );
  }
};

export const onlyTextElements = (
  paragraph: Paragraph,
  name: string,
): Array<MdxJsxTextElement> | undefined => {
  const elements: Array<MdxJsxTextElement> = [];
  for (const child of paragraph.children) {
    if (child.type === "mdxJsxTextElement" && child.name === name) elements.push(child);
    else if (!(child.type === "text" && child.value.trim() === "")) return undefined;
  }
  return elements;
};

export const inlineChildren = (
  ctx: ParseContext,
  element: JsxElement,
): Array<Inline> | undefined => {
  if (element.type === "mdxJsxTextElement") return inlines(ctx, element.children);
  const [only, ...rest] = element.children;
  if (only?.type !== "paragraph" || rest.length > 0) {
    return report(ctx, positionOf(element), `<${element.name}> holds one paragraph of text`);
  }
  requireBlankLines(ctx, element, [only]);
  return inlines(ctx, only.children);
};

export const tagChildren = (
  ctx: ParseContext,
  parent: MdxJsxFlowElement,
  name: string,
): Array<JsxElement> => {
  const found: Array<JsxElement> = [];
  for (const child of parent.children) {
    if (child.type === "mdxJsxFlowElement" && child.name === name) {
      found.push(child);
      continue;
    }
    const elements = child.type === "paragraph" ? onlyTextElements(child, name) : undefined;
    if (elements === undefined || elements.length === 0) {
      report(
        ctx,
        positionOf(child),
        `<${parent.name}> may only contain <${name}>, not ${describeNode(child)}`,
      );
      continue;
    }
    found.push(...elements);
  }
  return found;
};

export const labeledBlocks = (
  ctx: ParseContext,
  element: JsxElement,
): LabeledBlocks | undefined => {
  const values = attributes(ctx, element, { label: "required" }, false);
  if (values === undefined || element.type !== "mdxJsxFlowElement") {
    if (element.type === "mdxJsxTextElement") {
      report(ctx, positionOf(element), `<${element.name}> must stand on its own lines`);
    }
    return undefined;
  }
  requireBlankLines(ctx, element, element.children);
  return { label: values.label ?? "", children: blocks(ctx, element.children) };
};
