import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { ExplainConfig } from "./config.ts";

const decode = (input: unknown) =>
  Schema.decodeUnknownExit(ExplainConfig)(input, { errors: "all" });

const valid = {
  title: "维基",
  repos: { fold: "/repos/fold" },
  nav: [{ title: "入门", pages: ["index", "fold"] }],
};

describe("ExplainConfig", () => {
  it("accepts the documented shape", () => {
    expect(decode(valid)).toEqual(Exit.succeed(valid));
  });

  it("accepts a relative repo path unchanged", () => {
    const relative = { ...valid, repos: { fold: ".." } };
    expect(decode(relative)).toEqual(Exit.succeed(relative));
  });

  it("leaves title optional", () => {
    const untitled = { repos: { fold: "/repos/fold" }, nav: [] };
    expect(decode(untitled)).toEqual(Exit.succeed(untitled));
  });

  it("accepts source as a page id", () => {
    const source = { ...valid, nav: [{ title: "a", pages: ["source"] }] };
    expect(decode(source)).toEqual(Exit.succeed(source));
  });

  it.each([
    ["a nav title given as an object", { nav: [{ title: { en: "a" }, pages: ["fold"] }] }],
    ["a reserved repo key", { repos: { http: "/x" } }],
    ["a malformed repo key", { repos: { Fold: "/x" } }],
    ["an empty repo path", { repos: { fold: "" } }],
    ["a repo given as an object", { repos: { fold: { path: "/repos/fold" } } }],
    ["a malformed page id", { nav: [{ title: "a", pages: ["Fold"] }] }],
    [
      "a page listed twice",
      {
        nav: [
          { title: "a", pages: ["fold"] },
          { title: "b", pages: ["fold"] },
        ],
      },
    ],
  ])("rejects %s", (_, patch) => {
    expect(Exit.isFailure(decode({ ...valid, ...patch }))).toBe(true);
  });
});
