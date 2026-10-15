import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { ExplainConfig } from "./config.ts";

const decode = (input: unknown) =>
  Schema.decodeUnknownExit(ExplainConfig)(input, { errors: "all" });

const valid = {
  title: { "zh-CN": "维基" },
  locales: ["zh-CN"],
  defaultLocale: "zh-CN",
  repos: { fold: "/repos/fold" },
  nav: [{ title: { "zh-CN": "入门" }, pages: ["index", "fold"] }],
};

describe("ExplainConfig", () => {
  it("accepts the documented shape and defaults defaultLocale to en", () => {
    const { defaultLocale: _, ...rest } = valid;
    expect(decode({ ...rest, locales: ["en"], title: { en: "w" }, nav: [] })).toEqual(
      Exit.succeed({
        title: { en: "w" },
        locales: ["en"],
        defaultLocale: "en",
        repos: { fold: { _tag: "WorkTree", path: "/repos/fold" } },
        nav: [],
      }),
    );
    expect(Exit.isSuccess(decode(valid))).toBe(true);
  });

  it("decodes a repo pinned to a commit", () => {
    const commit = "f427dce30c8934c399772084d51fbfa9ec96598a";
    const decoded = decode({ ...valid, repos: { fold: { path: "/repos/fold", commit } } });
    expect(Exit.isSuccess(decoded) && decoded.value.repos).toEqual({
      fold: { _tag: "Commit", path: "/repos/fold", commit },
    });
  });

  it.each([
    ["an empty locale list", { locales: [] }],
    ["a repeated locale", { locales: ["zh-CN", "zh-CN"] }],
    ["a default locale that is not listed", { defaultLocale: "en" }],
    ["a missing default locale without en", { defaultLocale: undefined }],
    ["a title missing a locale", { locales: ["zh-CN", "en"] }],
    ["a reserved repo key", { repos: { http: "/x" } }],
    ["a malformed repo key", { repos: { Fold: "/x" } }],
    ["a relative repo path", { repos: { fold: "repos/fold" } }],
    ["a short pinned commit", { repos: { fold: { path: "/repos/fold", commit: "f427dce" } } }],
    ["a pinned repo without a commit", { repos: { fold: { path: "/repos/fold" } } }],
    [
      "a relative pinned path",
      {
        repos: { fold: { path: "repos/fold", commit: "f427dce30c8934c399772084d51fbfa9ec96598a" } },
      },
    ],
    ["a reserved page id", { nav: [{ title: { "zh-CN": "a" }, pages: ["glossary"] }] }],
    ["a malformed page id", { nav: [{ title: { "zh-CN": "a" }, pages: ["Fold"] }] }],
    [
      "a page listed twice",
      {
        nav: [
          { title: { "zh-CN": "a" }, pages: ["fold"] },
          { title: { "zh-CN": "b" }, pages: ["fold"] },
        ],
      },
    ],
  ])("rejects %s", (_, patch) => {
    const input: Record<string, unknown> = { ...valid, ...patch };
    if ("defaultLocale" in patch && patch.defaultLocale === undefined) delete input.defaultLocale;
    expect(Exit.isFailure(decode(input))).toBe(true);
  });
});
