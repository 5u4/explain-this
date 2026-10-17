import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { ExplainConfig } from "./config.ts";

const decode = (input: unknown) =>
  Schema.decodeUnknownExit(ExplainConfig)(input, { errors: "all" });

const valid = {
  title: "维基",
  locales: ["zh-CN"],
  defaultLocale: "zh-CN",
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

  it("defaults defaultLocale to the first locale and leaves title optional", () => {
    expect(decode({ locales: ["zh-CN", "en"], repos: { fold: "/repos/fold" }, nav: [] })).toEqual(
      Exit.succeed({
        locales: ["zh-CN", "en"],
        defaultLocale: "zh-CN",
        repos: { fold: "/repos/fold" },
        nav: [],
      }),
    );
  });

  it.each([
    ["an empty locale list", { locales: [] }],
    ["a repeated locale", { locales: ["zh-CN", "zh-CN"] }],
    ["a default locale that is not listed", { defaultLocale: "en" }],
    ["a nav title given per locale", { nav: [{ title: { "zh-CN": "a" }, pages: ["fold"] }] }],
    ["a reserved repo key", { repos: { http: "/x" } }],
    ["a malformed repo key", { repos: { Fold: "/x" } }],
    ["an empty repo path", { repos: { fold: "" } }],
    ["a repo given as an object", { repos: { fold: { path: "/repos/fold" } } }],
    ["a reserved page id", { nav: [{ title: "a", pages: ["source"] }] }],
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
