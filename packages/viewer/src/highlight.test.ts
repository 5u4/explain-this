import type { LanguageRegistration } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { describe, expect, it } from "vitest";
import { highlightLines, languageOf } from "./highlight.ts";

const strong = "color:var(--text-strong);font-weight:600";
const inlineCodeInBold = "color:var(--syn-string);font-weight:600";
const boldPunct = "color:var(--syn-punct);font-weight:600";
const inlineCode = "color:var(--syn-string)";
const string = "color:var(--syn-string)";

describe("languageOf", () => {
  it.each([
    ["Dockerfile", "docker"],
    ["deploy/Containerfile", "docker"],
    ["app.dockerfile", "docker"],
    ["dockerfile", "docker"],
    ["docker", "docker"],
    ["GNUmakefile", "make"],
    ["Makefile", "make"],
    ["makefile", "make"],
    ["rules.mk", "make"],
    ["rules.mak", "make"],
    ["make", "make"],
    ["mk", "make"],
    ["native/CMakeLists.txt", "cmake"],
    ["x.cmake", "cmake"],
    ["src/x.rs", "rust"],
    ["rs", "rust"],
    ["Cargo.toml", "toml"],
    ["toml", "toml"],
    ["setup.cfg", "ini"],
    ["nginx.conf", "ini"],
    ["x.ini", "ini"],
    [".editorconfig", "ini"],
    [".gitconfig", "ini"],
    [".npmrc", "ini"],
    ["include/vec.hpp", "cpp"],
    ["vec.cc", "cpp"],
    ["vec.cxx", "cpp"],
    ["vec.hh", "cpp"],
    ["vec.hxx", "cpp"],
    ["c++", "cpp"],
    ["include/vec.h", "c"],
    ["vec.c", "c"],
    ["notes.txt", undefined],
    ["src/App.TSX", "tsx"],
    ["tsx", "tsx"],
    ["a.ts", "typescript"],
    ["a.mts", "typescript"],
    ["a.cts", "typescript"],
    ["ts", "typescript"],
    ["a.js", "javascript"],
    ["a.mjs", "javascript"],
    ["a.cjs", "javascript"],
    ["js", "javascript"],
    ["a.jsx", "jsx"],
    ["jsx", "jsx"],
    ["a.json", "json"],
    ["a.jsonc", "jsonc"],
    ["jsonc", "jsonc"],
    ["shell", "shellscript"],
    ["bash", "shellscript"],
    ["sh", "shellscript"],
    ["zsh", "shellscript"],
    ["console", "shellscript"],
    ["run.sh", "shellscript"],
    ["run.bash", "shellscript"],
    ["run.zsh", "shellscript"],
    [".bashrc", "shellscript"],
    [".bash_profile", "shellscript"],
    [".zshrc", "shellscript"],
    [".profile", "shellscript"],
    ["html", "html"],
    ["page.html", "html"],
    ["page.htm", "html"],
    ["page.xhtml", "html"],
    ["svg", "xml"],
    ["icon.svg", "xml"],
    ["Info.plist", "xml"],
    ["pom.xml", "xml"],
    ["xml", "xml"],
    ["md", "markdown"],
    ["README.md", "markdown"],
    ["notes.markdown", "markdown"],
    ["page.mdx", "mdx"],
    ["proto", "proto"],
    ["protobuf", "proto"],
    ["api.proto", "proto"],
    ["c#", "csharp"],
    ["cs", "csharp"],
    ["Program.cs", "csharp"],
    ["golang", "go"],
    ["main.go", "go"],
    ["gql", "graphql"],
    ["schema.graphql", "graphql"],
    ["schema.gql", "graphql"],
    ["Main.java", "java"],
    ["kt", "kotlin"],
    ["Main.kt", "kotlin"],
    ["build.gradle.kts", "kotlin"],
    ["x.less", "less"],
    ["x.lua", "lua"],
    ["patch", "diff"],
    ["fix.patch", "diff"],
    ["fix.diff", "diff"],
    ["index.php", "php"],
    ["python", "python"],
    ["py", "python"],
    ["x.py", "python"],
    ["x.pyi", "python"],
    ["rb", "ruby"],
    ["x.rb", "ruby"],
    ["x.rake", "ruby"],
    ["x.gemspec", "ruby"],
    ["Gemfile", "ruby"],
    ["Rakefile", "ruby"],
    ["x.scss", "scss"],
    ["x.sql", "sql"],
    ["x.swift", "swift"],
    ["x.css", "css"],
    ["yml", "yaml"],
    ["x.yml", "yaml"],
    ["x.yaml", "yaml"],
    ["mermaid", undefined],
    [null, undefined],
  ])("%s -> %s", (input, expected) => {
    expect(languageOf(input)).toBe(expected);
  });
});

describe("highlightLines", () => {
  it("colors inline code nested inside bold markdown", async () => {
    expect(
      await highlightLines(
        [
          "**Defaults for every `Task` call.** `run_in_background: true`, agent mode (readonly strips MCP),",
        ],
        "markdown",
      ),
    ).toEqual([
      `<span style="${boldPunct}">**</span>` +
        `<span style="${strong}">Defaults for every </span>` +
        `<span style="${inlineCodeInBold}">\`Task\`</span>` +
        `<span style="${strong}"> call.</span>` +
        `<span style="${boldPunct}">**</span> ` +
        `<span style="${inlineCode}">\`run_in_background: true\`</span>` +
        ", agent mode (readonly strips MCP),",
    ]);
  });

  it("keeps a multi-line string self-contained on each line", async () => {
    expect(await highlightLines(['s = """a', 'b"""'], "python")).toEqual([
      `s <span style="color:var(--syn-punct)">=</span> <span style="${string}">&quot;&quot;&quot;a</span>`,
      `<span style="${string}">b&quot;&quot;&quot;</span>`,
    ]);
  });

  it("escapes markup inside tokens", async () => {
    expect(await highlightLines(["<b>x</b> & `<i>`"], "markdown")).toEqual([
      `&lt;b&gt;x&lt;/b&gt; &amp; <span style="${inlineCode}">\`&lt;i&gt;\`</span>`,
    ]);
  });

  it("escapes plain text when the language is unknown or missing", async () => {
    expect(await highlightLines(['<a & "b">'], undefined)).toEqual([
      "&lt;a &amp; &quot;b&quot;&gt;",
    ]);
    expect(await highlightLines(["<a & b>"], "mermaid")).toEqual(["&lt;a &amp; b&gt;"]);
  });
});

const samples: Readonly<Record<string, string>> = {
  c: "int x = 1;",
  cmake: 'set(NAME "x")',
  cpp: "int x = 1;",
  csharp: "var x = 1;",
  css: "a { color: red; }",
  diff: "+added line",
  docker: "FROM alpine",
  go: 'var x = "y"',
  graphql: "query { x }",
  html: '<a href="x">y</a>',
  ini: "[section]",
  java: "int x = 1;",
  javascript: "const x = 1;",
  json: '{"a": 1}',
  jsonc: '{"a": 1} // c',
  jsx: "const x = <A />;",
  kotlin: "val x = 1",
  less: "a { color: red; }",
  lua: "local x = 1",
  make: "all: build",
  markdown: "# Title",
  mdx: "# Title",
  php: "<?php echo 1; ?>",
  proto: 'syntax = "proto3";',
  python: "x = 1",
  ruby: "x = 1",
  rust: "let x = 1;",
  scss: "a { color: red; }",
  shellscript: 'echo "hi"',
  sql: "SELECT 1",
  swift: "let x = 1",
  toml: 'a = "b"',
  tsx: "const x = <A />;",
  typescript: "const x: number = 1;",
  xml: '<a b="c"/>',
  yaml: "a: 1",
};

const regexSources = (value: unknown): Array<string> =>
  typeof value !== "object" || value === null
    ? []
    : Object.entries(value).flatMap(([key, child]) =>
        typeof child === "string" && ["match", "begin", "end", "while"].includes(key)
          ? [child]
          : regexSources(child),
      );

describe.each(Object.entries(samples))("%s", (id, sample) => {
  it("resolves to itself and highlights with color", async () => {
    expect(languageOf(id)).toBe(id);
    const [html] = await highlightLines([sample], id);
    expect(html).toMatch(/<span style="color:var\(--[a-z-]+\)/);
  });

  it("compiles every pattern under the JavaScript regex engine", async () => {
    const grammars: { default: Array<LanguageRegistration> } = await import(
      `shiki/langs/${id}.mjs`
    );
    const engine = createJavaScriptRegexEngine();
    const failures = grammars.default.flatMap((grammar) =>
      regexSources(grammar).flatMap((source) => {
        try {
          engine.createScanner([source]).findNextMatchSync("", 0, 0);
          return [];
        } catch (error) {
          return [`${grammar.name}: ${String(error)}`];
        }
      }),
    );
    expect(failures).toEqual([]);
  });
});
