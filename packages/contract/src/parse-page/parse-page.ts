import type { Root } from "mdast";
import type { Diagnostic, Page } from "../page.ts";
import { blocks } from "./block.ts";
import { type ParseContext, report } from "./context.ts";
import { inlines } from "./inline.ts";
import { parseMarkdown, positionOf } from "./markdown.ts";

export interface ParseResult {
  readonly page: Page | undefined;
  readonly errors: ReadonlyArray<Diagnostic>;
}

export const parsePage = (source: string, pageId: string): ParseResult => {
  if (/^---\r?\n/.test(source)) {
    return {
      page: undefined,
      errors: [{ line: 1, column: 1, message: "frontmatter is not allowed" }],
    };
  }

  let root: Root;
  try {
    root = parseMarkdown(source);
  } catch (error) {
    const place = error as { line?: number | null; column?: number | null; reason?: string };
    return {
      page: undefined,
      errors: [
        {
          line: place.line ?? 1,
          column: place.column ?? 1,
          message: place.reason ?? String(error),
        },
      ],
    };
  }

  const ctx: ParseContext = {
    source,
    pageId,
    errors: [],
    toc: [],
    usedIds: new Set(),
    refs: [],
    pageLinks: [],
    widgets: [],
  };
  const [first, ...rest] = root.children;
  if (first?.type !== "heading" || first.depth !== 1) {
    report(
      ctx,
      first === undefined ? { line: 1, column: 1 } : positionOf(first),
      "a page starts with one # title",
    );
  }
  const title = first?.type === "heading" && first.depth === 1 ? inlines(ctx, first.children) : [];
  const body = first?.type === "heading" && first.depth === 1 ? rest : root.children;
  const { toc, refs, pageLinks, widgets } = ctx;
  const page: Page = { title, blocks: blocks(ctx, body), toc, refs, pageLinks, widgets };
  return { page, errors: ctx.errors };
};
