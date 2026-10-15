import type { Nodes, Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import {
  type MdxJsxFlowElement,
  type MdxJsxTextElement,
  mdxJsxFromMarkdown,
} from "mdast-util-mdx-jsx";
import { gfm } from "micromark-extension-gfm";
import { mdxJsx } from "micromark-extension-mdx-jsx";
import type { Position } from "../page.ts";

export type JsxElement = MdxJsxFlowElement | MdxJsxTextElement;

export const parseMarkdown = (source: string): Root =>
  fromMarkdown(source, {
    extensions: [
      gfm(),
      mdxJsx(),
      { disable: { null: ["htmlFlow", "htmlText", "autolink", "codeIndented"] } },
    ],
    mdastExtensions: [gfmFromMarkdown(), mdxJsxFromMarkdown()],
  });

export const positionOf = (node: Pick<Nodes, "position">): Position => ({
  line: node.position?.start.line ?? 1,
  column: node.position?.start.column ?? 1,
});

export const describeNode = (node: Nodes): string =>
  node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement"
    ? `<${node.name ?? ""}>`
    : node.type;
