import type { List } from "mdast";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";
import type { Block, TreeItem } from "../page.ts";
import { attributes } from "./attributes.ts";
import { blocks } from "./block.ts";
import { type ParseContext, report } from "./context.ts";
import { inlines } from "./inline.ts";
import {
  inlineChildren,
  labeledBlocks,
  onlyTextElements,
  requireBlankLines,
  tagChildren,
} from "./jsx-children.ts";
import { positionOf } from "./markdown.ts";

const treeItems = (ctx: ParseContext, node: List): Array<TreeItem> =>
  node.children.flatMap((item) => {
    const [label, nested, ...rest] = item.children;
    if (
      item.checked != null ||
      label?.type !== "paragraph" ||
      (nested !== undefined && nested.type !== "list") ||
      rest.length > 0
    ) {
      report(
        ctx,
        positionOf(item),
        "a tree item holds one line of text and an optional nested list",
      );
      return [];
    }
    return [
      {
        label: inlines(ctx, label.children),
        children: nested?.type === "list" ? treeItems(ctx, nested) : [],
      },
    ];
  });

export const tree = (ctx: ParseContext, element: MdxJsxFlowElement): Block | undefined => {
  const at = positionOf(element);
  const values = attributes(ctx, element, { open: "optional" });
  requireBlankLines(ctx, element, element.children);
  const [only, ...rest] = element.children;
  if (only?.type !== "list" || rest.length > 0)
    return report(ctx, at, "<Tree> holds exactly one list");
  if (values === undefined) return undefined;
  const open = values.open;
  if (open !== undefined && !/^[0-9]+$/.test(open)) {
    return report(ctx, at, `<Tree open="${open}"> must be a whole number`);
  }
  return {
    type: "tree",
    open: open === undefined ? null : Number(open),
    items: treeItems(ctx, only),
  };
};

export const tabs = (ctx: ParseContext, element: MdxJsxFlowElement): Block | undefined => {
  attributes(ctx, element, {});
  const found = tagChildren(ctx, element, "Tab").flatMap((tab) => labeledBlocks(ctx, tab) ?? []);
  if (found.length === 0) {
    return report(ctx, positionOf(element), "<Tabs> needs at least one <Tab>");
  }
  return { type: "tabs", tabs: found };
};

export const beforeAfter = (ctx: ParseContext, element: MdxJsxFlowElement): Block | undefined => {
  attributes(ctx, element, {});
  const [before, after, ...rest] = element.children;
  if (
    before?.type !== "mdxJsxFlowElement" ||
    before.name !== "Before" ||
    after?.type !== "mdxJsxFlowElement" ||
    after.name !== "After" ||
    rest.length > 0
  ) {
    return report(ctx, positionOf(element), "<BeforeAfter> holds one <Before> then one <After>");
  }
  const beforeBlocks = labeledBlocks(ctx, before);
  const afterBlocks = labeledBlocks(ctx, after);
  if (beforeBlocks === undefined || afterBlocks === undefined) return undefined;
  return { type: "beforeAfter", before: beforeBlocks, after: afterBlocks };
};

export const details = (ctx: ParseContext, element: MdxJsxFlowElement): Block | undefined => {
  attributes(ctx, element, {});
  const [first, ...rest] = element.children;
  const summaries =
    first?.type === "mdxJsxFlowElement" && first.name === "summary"
      ? [first]
      : first?.type === "paragraph"
        ? onlyTextElements(first, "summary")
        : undefined;
  const [summary, ...extraSummaries] = summaries ?? [];
  if (summary === undefined || extraSummaries.length > 0) {
    return report(ctx, positionOf(element), "<details> starts with one <summary>");
  }
  attributes(ctx, summary, {});
  const summaryInlines = inlineChildren(ctx, summary);
  if (summaryInlines === undefined) return undefined;
  if (first !== undefined) requireBlankLines(ctx, element, rest, first);
  return { type: "details", summary: summaryInlines, children: blocks(ctx, rest) };
};
