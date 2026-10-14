import * as Result from "effect/Result";
import { describe, expect, it } from "vitest";
import { formatRef, parseRef } from "./citation.ts";

describe("parseRef", () => {
  it("parses a whole-file citation", () => {
    expect(parseRef("fold:src/fold.ts")).toEqual(
      Result.succeed({ repo: "fold", path: "src/fold.ts", ranges: [] }),
    );
  });

  it("parses single lines and spans", () => {
    expect(parseRef("fold:fold.ts:3,12-30,40-45")).toEqual(
      Result.succeed({
        repo: "fold",
        path: "fold.ts",
        ranges: [
          { from: 3, to: 3 },
          { from: 12, to: 30 },
          { from: 40, to: 45 },
        ],
      }),
    );
  });

  it.each([
    ["fold.ts", "no repo"],
    ["Fold:fold.ts", "uppercase repo"],
    ["term:fold.ts", "reserved repo"],
    ["fold:", "empty path"],
    ["fold:/fold.ts", "absolute path"],
    ["fold:src//fold.ts", "empty segment"],
    ["fold:./fold.ts", "dot segment"],
    ["fold:src/../fold.ts", "dot-dot segment"],
    ["fold:src\\fold.ts", "backslash"],
    ["fold:fold.ts:", "empty ranges"],
    ["fold:fold.ts:0", "line zero"],
    ["fold:fold.ts:01", "leading zero"],
    ["fold:fold.ts:5-3", "descending span"],
    ["fold:fold.ts:10,4", "descending ranges"],
    ["fold:fold.ts:1-5,5-9", "overlapping ranges"],
    ["fold:fold.ts:1-", "open span"],
    ["fold:fold.ts:1-2-3", "triple bound"],
    ["fold:fold.ts:1, 2", "space"],
    ["fold:a:b:1", "colon in path"],
  ])("rejects %s (%s)", (text) => {
    expect(Result.isFailure(parseRef(text))).toBe(true);
  });
});

describe("formatRef", () => {
  it("writes the canonical form", () => {
    expect(
      formatRef({
        repo: "fold",
        path: "fold.ts",
        ranges: [
          { from: 7, to: 7 },
          { from: 12, to: 30 },
        ],
      }),
    ).toBe("fold:fold.ts:7,12-30");
    expect(formatRef({ repo: "fold", path: "a/b.ts", ranges: [] })).toBe("fold:a/b.ts");
  });
});
