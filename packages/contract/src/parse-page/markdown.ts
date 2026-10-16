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
import type { Diagnostic, Position } from "../page.ts";

export type JsxElement = MdxJsxFlowElement | MdxJsxTextElement;

export interface ParsedMarkdown {
  readonly root: Root | undefined;
  readonly errors: ReadonlyArray<Diagnostic>;
}

export const htmlNotSupported =
  "HTML is not supported; only <details>, <summary>, and the component tags are allowed";

export const isHtmlTag = (name: string): boolean =>
  /^[a-z]/.test(name) && name !== "details" && name !== "summary";

const autolinkNotSupported = "autolinks are not supported; write [text](url)";

const rejectedConstructs: ReadonlyArray<{ readonly pattern: RegExp; readonly message: string }> = [
  { pattern: /<!--[\s\S]*?(?:-->|$)/y, message: "HTML comments are not supported" },
  {
    pattern:
      /<(?:[A-Za-z][A-Za-z\d+.-]{1,31}:[^\s<>]*|[\w.!#$%&'*+/=?^`{|}~-]+@[A-Za-z\d](?:[A-Za-z\d-]{0,61}[A-Za-z\d])?(?:\.[A-Za-z\d](?:[A-Za-z\d-]{0,61}[A-Za-z\d])?)*)>/y,
    message: autolinkNotSupported,
  },
  { pattern: /<[!?][^>]*>?/y, message: htmlNotSupported },
];

const fromSource = (source: string, disabled: ReadonlyArray<string>): Root =>
  fromMarkdown(source, {
    extensions: [gfm(), mdxJsx(), { disable: { null: [...disabled] } }],
    mdastExtensions: [gfmFromMarkdown(), mdxJsxFromMarkdown()],
  });

export const positionOf = (node: Pick<Nodes, "position">): Position => ({
  line: node.position?.start.line ?? 1,
  column: node.position?.start.column ?? 1,
});

const indentedCode = (source: string): Array<Diagnostic> => {
  let root: Root;
  try {
    root = fromSource(source, ["htmlFlow", "htmlText", "autolink"]);
  } catch {
    return [];
  }
  const found: Array<Diagnostic> = [];
  const visit = (node: Nodes): void => {
    if (node.type === "code") {
      const opening = source.slice(node.position?.start.offset ?? 0);
      if (!/^ {0,3}(?:```|~~~)/.test(opening)) {
        found.push({
          ...positionOf(node),
          message: "indented code is not supported; use a fenced block",
        });
      }
    } else if ("children" in node && node.type !== "mdxJsxFlowElement") {
      node.children.forEach(visit);
    }
  };
  visit(root);
  return found;
};

const rejectedAt = (
  text: string,
  offset: number,
): { readonly start: number; readonly end: number; readonly message: string } | undefined => {
  const start = text.lastIndexOf("<", offset);
  if (start < 0) return undefined;
  for (const { pattern, message } of rejectedConstructs) {
    pattern.lastIndex = start;
    const end = start + (pattern.exec(text)?.[0].length ?? 0);
    if (end > offset) return { start, end, message };
  }
  return undefined;
};

export const parseMarkdown = (source: string): ParsedMarkdown => {
  const errors: Array<Diagnostic> = [];
  let text = source;
  for (;;) {
    try {
      const root = fromSource(text, ["htmlFlow", "htmlText", "autolink", "codeIndented"]);
      const found = [...errors, ...indentedCode(text)];
      return { root, errors: found.sort((a, b) => a.line - b.line || a.column - b.column) };
    } catch (error) {
      const failure = error as {
        line?: number | null;
        column?: number | null;
        place?: { offset?: number | null } | null;
        reason?: string;
      };
      const offset = failure.place?.offset;
      const rejected = offset == null ? undefined : rejectedAt(text, offset);
      if (rejected === undefined) {
        errors.push({
          line: failure.line ?? 1,
          column: failure.column ?? 1,
          message: failure.reason ?? String(error),
        });
        return { root: undefined, errors };
      }
      const { start, end, message } = rejected;
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      errors.push({
        line: text.slice(0, start).split("\n").length,
        column: start - lineStart + 1,
        message,
      });
      const filler = /^[ \t]*(?:\n|$)/.test(text.slice(end)) ? " " : "x";
      text =
        text.slice(0, start) + text.slice(start, end).replace(/[^\n]/g, filler) + text.slice(end);
    }
  }
};

export const describeNode = (node: Nodes): string =>
  node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement"
    ? `<${node.name ?? ""}>`
    : node.type;
