import { PeleError, render } from "pele";
import type { Position } from "../page.ts";
import { type ParseContext, report } from "./context.ts";

const summary = (message: string): string => {
  const last = message.slice(message.lastIndexOf("\n") + 1);
  return last.startsWith("Expecting") ? last : message;
};

const lines = (text: string): ReadonlyArray<string> => text.split(/\r?\n/);

const positionOf = (page: string, source: string, at: Position, error: PeleError): Position => {
  if (error.line === 0) return at;
  const line = at.line + error.line;
  const body = lines(source)[error.line - 1];
  const raw = lines(page)[line - 1];
  const column =
    body !== undefined && raw?.endsWith(body) === true
      ? raw.length - body.length + error.column
      : at.column + error.column - 1;
  return { line, column };
};

export const mermaidProblems = (ctx: ParseContext, source: string, at: Position): void => {
  try {
    render(source);
  } catch (error) {
    if (!(error instanceof PeleError)) throw error;
    report(ctx, positionOf(ctx.source, source, at, error), summary(error.message));
  }
};
