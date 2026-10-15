import type { Blockquote, List, PhrasingContent, RootContent, Table } from "mdast";
import type { AlertKind, Block, ListItem } from "../page.ts";
import { code } from "./code.ts";
import { type ParseContext, report } from "./context.ts";
import { heading } from "./heading.ts";
import { inlines } from "./inline.ts";
import { jsxBlock } from "./jsx-block.ts";
import { describeNode, positionOf } from "./markdown.ts";

const alertMarkerPattern = /^\[!([A-Za-z]+)\]/;
const alertKinds: Readonly<Record<string, AlertKind>> = {
  NOTE: "note",
  TIP: "tip",
  IMPORTANT: "important",
  WARNING: "warning",
  CAUTION: "caution",
};

const list = (ctx: ParseContext, node: List): Block => ({
  type: "list",
  ordered: node.ordered === true,
  start: node.ordered === true ? (node.start ?? 1) : null,
  items: node.children.map(
    (item): ListItem => ({ checked: item.checked ?? null, children: blocks(ctx, item.children) }),
  ),
});

const table = (ctx: ParseContext, node: Table): Block => {
  const rows = node.children.map((row) => row.children.map((cell) => inlines(ctx, cell.children)));
  return {
    type: "table",
    align: (node.align ?? []).map((align) => align ?? null),
    head: rows[0] ?? [],
    rows: rows.slice(1),
  };
};

const blockquote = (ctx: ParseContext, node: Blockquote): Block | undefined => {
  const [first, ...rest] = node.children;
  const marker = first?.type === "paragraph" ? first.children[0] : undefined;
  const match = marker?.type === "text" ? alertMarkerPattern.exec(marker.value) : null;
  if (first?.type !== "paragraph" || marker?.type !== "text" || match === null) {
    return { type: "quote", children: blocks(ctx, node.children) };
  }
  const at = positionOf(first);
  const kind = alertKinds[match[1] ?? ""];
  if (kind === undefined) {
    return report(
      ctx,
      at,
      `unknown alert "${match[0]}"; use NOTE, TIP, IMPORTANT, WARNING, or CAUTION`,
    );
  }
  const remainder = marker.value.slice(match[0].length);
  if (remainder !== "" && !remainder.startsWith("\n")) {
    return report(ctx, at, `alert marker ${match[0]} must stand alone on its line`);
  }
  const tail = remainder.slice(1);
  const paragraphChildren: Array<PhrasingContent> = [
    ...(tail === "" ? [] : [{ ...marker, value: tail }]),
    ...first.children.slice(1),
  ];
  const lead: Array<RootContent> =
    paragraphChildren.length === 0 ? [] : [{ ...first, children: paragraphChildren }];
  return { type: "alert", kind, children: blocks(ctx, [...lead, ...rest]) };
};

const block = (ctx: ParseContext, node: RootContent): Block | undefined => {
  switch (node.type) {
    case "heading":
      return heading(ctx, node);
    case "paragraph":
      return { type: "paragraph", children: inlines(ctx, node.children) };
    case "list":
      return list(ctx, node);
    case "table":
      return table(ctx, node);
    case "blockquote":
      return blockquote(ctx, node);
    case "code":
      return code(ctx, node);
    case "thematicBreak":
      return { type: "thematicBreak" };
    case "mdxJsxFlowElement":
      return jsxBlock(ctx, node);
    default:
      return report(ctx, positionOf(node), `${describeNode(node)} is not supported`);
  }
};

export const blocks = (ctx: ParseContext, nodes: ReadonlyArray<RootContent>): Array<Block> =>
  nodes.flatMap((node) => block(ctx, node) ?? []);
