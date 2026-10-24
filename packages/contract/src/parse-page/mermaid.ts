import { PeleError, render } from "pele";
import type { Position } from "../page.ts";
import { type ParseContext, report } from "./context.ts";

const summary = (message: string): string => {
  const last = message.slice(message.lastIndexOf("\n") + 1);
  return last.startsWith("Expecting") ? last : message;
};

export const mermaidProblems = (ctx: ParseContext, source: string, at: Position): void => {
  try {
    render(source);
  } catch (error) {
    if (!(error instanceof PeleError)) throw error;
    const position =
      error.line > 0 ? { line: at.line + error.line, column: at.column + error.column - 1 } : at;
    report(ctx, position, summary(error.message));
  }
};
