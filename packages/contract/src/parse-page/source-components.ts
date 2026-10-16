import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";
import type { Ref } from "../citation.ts";
import type { Block, SourceNote } from "../page.ts";
import { attributes } from "./attributes.ts";
import { citation, type ParseContext, report } from "./context.ts";
import { inlineChildren, tagChildren } from "./jsx-children.ts";
import { positionOf } from "./markdown.ts";

const notePattern = /^([1-9][0-9]*)(?:-([1-9][0-9]*))?$/;

export const annotatedSource = (
  ctx: ParseContext,
  element: MdxJsxFlowElement,
): Block | undefined => {
  const at = positionOf(element);
  const values = attributes(ctx, element, { file: "required" });
  const noteElements = tagChildren(ctx, element, "Note");
  if (values?.file === undefined) return undefined;
  const ref = citation(ctx, values.file, at);
  if (ref === undefined) return undefined;
  const [range, ...extraRanges] = ref.ranges;
  if (range === undefined || extraRanges.length > 0) {
    return report(ctx, at, `<AnnotatedSource file="${values.file}"> needs exactly one line range`);
  }
  const notes = noteElements.flatMap((note): Array<SourceNote> => {
    const noteAt = positionOf(note);
    const lines = attributes(ctx, note, { lines: "required" })?.lines;
    const children = inlineChildren(ctx, note);
    if (lines === undefined || children === undefined) return [];
    const match = notePattern.exec(lines);
    if (match === null) {
      report(ctx, noteAt, `<Note lines="${lines}"> must be N or N-M`);
      return [];
    }
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    if (from > to || from < range.from || to > range.to) {
      report(ctx, noteAt, `<Note lines="${lines}"> lies outside ${range.from}-${range.to}`);
      return [];
    }
    return [{ from, to, children }];
  });
  return { type: "annotatedSource", ref, notes };
};

export const diff = (ctx: ParseContext, element: MdxJsxFlowElement): Block | undefined => {
  const at = positionOf(element);
  const values = attributes(ctx, element, { before: "optional", after: "optional" });
  if (element.children.length > 0) {
    return report(ctx, at, '<Diff> takes no children; write <Diff before="…" after="…" />');
  }
  if (values === undefined) return undefined;
  const side = (name: "before" | "after"): Ref | null | undefined => {
    const text = values[name];
    if (text === undefined) return null;
    const ref = citation(ctx, text, at);
    if (ref === undefined || ref.ranges.length <= 1) return ref;
    return report(ctx, at, `<Diff ${name}="${text}"> takes at most one line range`);
  };
  const before = side("before");
  const after = side("after");
  if (before === undefined || after === undefined) return undefined;
  if (before === null) {
    return after === null
      ? report(ctx, at, "<Diff> needs before, after, or both")
      : { type: "diff", change: { kind: "added", after } };
  }
  return {
    type: "diff",
    change: after === null ? { kind: "deleted", before } : { kind: "modified", before, after },
  };
};
