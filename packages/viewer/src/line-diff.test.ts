import { describe, expect, it } from "vitest";
import { foldContext, lineDiff } from "./line-diff.ts";

describe("lineDiff", () => {
  it("returns no rows for two empty sides", () => {
    expect(lineDiff([], [])).toEqual([]);
  });

  it("marks every line added when the before side is empty", () => {
    expect(lineDiff([], ["a", "b"])).toEqual([
      { kind: "added", after: 0 },
      { kind: "added", after: 1 },
    ]);
  });

  it("marks every line removed when the after side is empty", () => {
    expect(lineDiff(["a", "b"], [])).toEqual([
      { kind: "removed", before: 0 },
      { kind: "removed", before: 1 },
    ]);
  });

  it("puts a changed middle line between unchanged neighbors, removal first", () => {
    expect(lineDiff(["a", "b", "c", "d"], ["a", "x", "c", "d"])).toEqual([
      { kind: "context", before: 0, after: 0 },
      { kind: "removed", before: 1 },
      { kind: "added", after: 1 },
      { kind: "context", before: 2, after: 2 },
      { kind: "context", before: 3, after: 3 },
    ]);
  });

  it("shifts the after numbering past an inserted line", () => {
    expect(lineDiff(["a", "c", "d"], ["a", "b", "c", "d"])).toEqual([
      { kind: "context", before: 0, after: 0 },
      { kind: "added", after: 1 },
      { kind: "context", before: 1, after: 2 },
      { kind: "context", before: 2, after: 3 },
    ]);
  });
});

describe("foldContext", () => {
  const context = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, index) => ({
      kind: "context" as const,
      before: from + index,
      after: from + index,
    }));

  it("folds an unchanged run longer than six lines to three lines on each side", () => {
    const removed = { kind: "removed" as const, before: 10 };
    expect(foldContext([...context(0, 10), removed, ...context(11, 15)])).toEqual([
      { kind: "shown", rows: context(0, 3) },
      { kind: "folded", rows: context(3, 7) },
      { kind: "shown", rows: [...context(7, 10), removed, ...context(11, 15)] },
    ]);
  });

  it("keeps a run of exactly six unchanged lines", () => {
    const added = { kind: "added" as const, after: 6 };
    expect(foldContext([...context(0, 6), added])).toEqual([
      { kind: "shown", rows: [...context(0, 6), added] },
    ]);
  });
});
