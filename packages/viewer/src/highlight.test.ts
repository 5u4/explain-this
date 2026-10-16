import { describe, expect, it } from "vitest";
import { highlightLines, languageOf } from "./highlight.ts";

describe("languageOf", () => {
  it.each([
    ["Dockerfile", "dockerfile"],
    ["deploy/Containerfile", "dockerfile"],
    ["GNUmakefile", "makefile"],
    ["native/CMakeLists.txt", "cmake"],
    ["src/x.rs", "rust"],
    ["Cargo.toml", "ini"],
    ["include/vec.hpp", "cpp"],
    ["include/vec.h", "c"],
    ["notes.txt", undefined],
    ["src/App.TSX", "typescript"],
    ["tsx", "typescript"],
    ["shell", "bash"],
    ["html", "xml"],
    ["python", "python"],
    ["mermaid", undefined],
    [null, undefined],
  ])("%s -> %s", (input, expected) => {
    expect(languageOf(input)).toBe(expected);
  });
});

describe("highlightLines", () => {
  it("loads the language on demand and keeps spans balanced per line", async () => {
    expect(await highlightLines(['s = """a', 'b"""'], "python")).toEqual([
      's = <span class="hljs-string">&quot;&quot;&quot;a</span>',
      '<span class="hljs-string">b&quot;&quot;&quot;</span>',
    ]);
  });

  it("loads embedded languages so markdown highlights inline tags", async () => {
    expect(await highlightLines(["<b>x</b>"], "markdown")).toEqual([
      '<span class="language-xml"><span class="hljs-tag">&lt;<span class="hljs-name">b</span>&gt;</span></span>x<span class="language-xml"><span class="hljs-tag">&lt;/<span class="hljs-name">b</span>&gt;</span></span>',
    ]);
  });
  it("escapes plain text when the language is unknown", async () => {
    expect(await highlightLines(["<a & b>"], undefined)).toEqual(["&lt;a &amp; b&gt;"]);
  });
});
