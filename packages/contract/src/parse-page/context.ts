import * as Result from "effect/Result";
import { parseRef, type Ref } from "../citation.ts";
import type { Diagnostic, Position, TocEntry } from "../page.ts";

export interface ParseContext {
  readonly source: string;
  readonly pageId: string;
  readonly errors: Array<Diagnostic>;
  readonly toc: Array<TocEntry>;
  readonly usedIds: Set<string>;
  readonly refs: Array<{ ref: Ref; at: Position }>;
  readonly pageLinks: Array<{ page: string; anchor: string | null; at: Position }>;
  readonly widgets: Array<{ name: string; at: Position }>;
}

export const report = (ctx: ParseContext, at: Position, message: string): undefined => {
  ctx.errors.push({ line: at.line, column: at.column, message });
  return undefined;
};

export const citation = (ctx: ParseContext, text: string, at: Position): Ref | undefined => {
  const parsed = parseRef(text);
  if (Result.isFailure(parsed)) return report(ctx, at, parsed.failure);
  ctx.refs.push({ ref: parsed.success, at });
  return parsed.success;
};
