import { describe, expect, it } from "vitest";
import { parsePage } from "./parse-page.ts";

const errorsAt = (source: string, pageId = "fold") =>
  parsePage(source, pageId).errors.map(({ line, column }) => ({ line, column }));

describe("parsePage", () => {
  it("builds the domain tree, toc, and refs in document order", () => {
    const { page, errors } = parsePage(
      [
        "# Fold",
        "",
        "See [foldView](fold:fold.ts:12-30) and [run](https://run.dev) in [gate](./compaction.md#gate).",
        "",
        "## Rules {#rules}",
        "",
        "- [x] done",
        "",
        "> [!WARNING]",
        "> careful",
        "",
        "```ts file=fold:fold.ts:39-41",
        "```",
        "",
        "## Rules",
        "",
        '<AnnotatedSource file="fold:index.ts:1-20">',
        "",
        '<Note lines="2-4">first</Note>',
        "",
        "</AnnotatedSource>",
      ].join("\n"),
      "fold",
    );
    expect(errors).toEqual([]);
    expect(page?.title).toEqual([{ type: "text", value: "Fold" }]);
    expect(page?.toc).toEqual([
      { depth: 2, id: "rules", text: "Rules" },
      { depth: 2, id: "rules-1", text: "Rules" },
    ]);
    expect(page?.blocks).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", value: "See " },
          {
            type: "citation",
            ref: { repo: "fold", path: "fold.ts", ranges: [{ from: 12, to: 30 }] },
            children: [{ type: "text", value: "foldView" }],
          },
          { type: "text", value: " and " },
          { type: "link", href: "https://run.dev", children: [{ type: "text", value: "run" }] },
          { type: "text", value: " in " },
          {
            type: "pageLink",
            page: "compaction",
            anchor: "gate",
            children: [{ type: "text", value: "gate" }],
          },
          { type: "text", value: "." },
        ],
      },
      { type: "heading", depth: 2, id: "rules", children: [{ type: "text", value: "Rules" }] },
      {
        type: "list",
        ordered: false,
        start: null,
        items: [
          {
            checked: true,
            children: [{ type: "paragraph", children: [{ type: "text", value: "done" }] }],
          },
        ],
      },
      {
        type: "alert",
        kind: "warning",
        children: [{ type: "paragraph", children: [{ type: "text", value: "careful" }] }],
      },
      {
        type: "excerpt",
        lang: "ts",
        ref: { repo: "fold", path: "fold.ts", ranges: [{ from: 39, to: 41 }] },
      },
      { type: "heading", depth: 2, id: "rules-1", children: [{ type: "text", value: "Rules" }] },
      {
        type: "annotatedSource",
        ref: { repo: "fold", path: "index.ts", ranges: [{ from: 1, to: 20 }] },
        notes: [{ from: 2, to: 4, children: [{ type: "text", value: "first" }] }],
      },
    ]);
    expect(page?.refs.map(({ ref, at }) => [ref.path, at.line])).toEqual([
      ["fold.ts", 3],
      ["fold.ts", 12],
      ["index.ts", 17],
    ]);
  });

  it("gives Chinese headings a slug from their text", () => {
    expect(parsePage("# 标题\n\n## 压缩 闸门\n", "fold").page?.toc).toEqual([
      { depth: 2, id: "压缩-闸门", text: "压缩 闸门" },
    ]);
  });

  it("rejects attribute expressions", () => {
    expect(errorsAt("# T\n\n<Tree open={2}>\n\n- a\n\n</Tree>\n")).toEqual([
      { line: 3, column: 7 },
    ]);
  });

  it("rejects HTML comments", () => {
    expect(errorsAt("# T\n\ntext <!-- hidden --> more\n")).toEqual([{ line: 3, column: 7 }]);
  });

  it("rejects raw HTML other than details and summary", () => {
    expect(errorsAt("# T\n\n<div>\n\nx\n\n</div>\n")).toEqual([{ line: 3, column: 1 }]);
  });

  it("rejects unknown tags", () => {
    expect(errorsAt("# T\n\n<Callout>\n\nx\n\n</Callout>\n")).toEqual([{ line: 3, column: 1 }]);
  });

  it("rejects an excerpt fence with a body", () => {
    expect(errorsAt("# T\n\n```ts file=fold:fold.ts:1-2\nconst x = 1\n```\n")).toEqual([
      { line: 3, column: 1 },
    ]);
  });

  it("rejects a second # heading", () => {
    expect(errorsAt("# T\n\ntext\n\n# Again\n")).toEqual([{ line: 5, column: 1 }]);
  });

  it("rejects a page that does not start with # title", () => {
    expect(errorsAt("## Sub\n\ntext\n")).toEqual([{ line: 1, column: 1 }]);
  });

  it("rejects frontmatter", () => {
    expect(errorsAt("---\ntitle: x\n---\n\n# T\n")).toEqual([{ line: 1, column: 1 }]);
  });

  it("rejects a malformed explicit id and a duplicate explicit id", () => {
    expect(errorsAt("# T\n\n## A {#Bad Id}\n\n## B {#b}\n\n## C {#b}\n")).toEqual([
      { line: 3, column: 1 },
      { line: 7, column: 1 },
    ]);
  });

  it("reads a term: link as a citation to a repo named term", () => {
    const { page, errors } = parsePage("# T\n\n[run](term:run)\n", "fold");
    expect(errors).toEqual([]);
    expect(page?.refs.map(({ ref }) => ref)).toEqual([{ repo: "term", path: "run", ranges: [] }]);
  });

  it("rejects links with unsupported targets", () => {
    expect(errorsAt("# T\n\n[a](../x.md) [b](ftp://x) [c](fold:a.ts:9-1)\n")).toEqual([
      { line: 3, column: 1 },
      { line: 3, column: 14 },
      { line: 3, column: 27 },
    ]);
  });

  it("rejects a note outside its AnnotatedSource range", () => {
    const source =
      '# T\n\n<AnnotatedSource file="fold:a.ts:5-10">\n\n<Note lines="9-12">x</Note>\n\n</AnnotatedSource>\n';
    expect(errorsAt(source)).toEqual([{ line: 5, column: 1 }]);
  });

  it("requires blank lines between a tag and its Markdown children", () => {
    expect(errorsAt('# T\n\n<Tabs>\n<Tab label="a">\ntext\n</Tab>\n</Tabs>\n')).toEqual([
      { line: 4, column: 1 },
    ]);
  });

  it("keeps the widget frame and passes other attributes as props", () => {
    const { page, errors } = parsePage(
      '# T\n\n<Widget name="fold-play" title="Play" source="fold:fold.ts fold:t.ts:1-5" preset="a">\n\nWhat it shows.\n\n</Widget>\n',
      "fold",
    );
    expect(errors).toEqual([]);
    expect(page?.blocks).toEqual([
      {
        type: "widget",
        name: "fold-play",
        title: "Play",
        sources: [
          { repo: "fold", path: "fold.ts", ranges: [] },
          { repo: "fold", path: "t.ts", ranges: [{ from: 1, to: 5 }] },
        ],
        props: { preset: "a" },
        children: [{ type: "text", value: "What it shows." }],
      },
    ]);
  });

  it("reads Diff sides as a modified, added, or deleted file and records both citations", () => {
    const { page, errors } = parsePage(
      [
        "# T",
        "",
        '<Diff before="base:src/a.ts:1-5" after="head:src/a.ts:2-7" />',
        "",
        '<Diff after="head:src/b.ts" />',
        "",
        '<Diff before="base:src/c.ts:3" />',
      ].join("\n"),
      "fold",
    );
    expect(errors).toEqual([]);
    expect(page?.blocks).toEqual([
      {
        type: "diff",
        change: {
          kind: "modified",
          before: { repo: "base", path: "src/a.ts", ranges: [{ from: 1, to: 5 }] },
          after: { repo: "head", path: "src/a.ts", ranges: [{ from: 2, to: 7 }] },
        },
      },
      {
        type: "diff",
        change: { kind: "added", after: { repo: "head", path: "src/b.ts", ranges: [] } },
      },
      {
        type: "diff",
        change: {
          kind: "deleted",
          before: { repo: "base", path: "src/c.ts", ranges: [{ from: 3, to: 3 }] },
        },
      },
    ]);
    expect(page?.refs.map(({ ref, at }) => [`${ref.repo}:${ref.path}`, at.line])).toEqual([
      ["base:src/a.ts", 3],
      ["head:src/a.ts", 3],
      ["head:src/b.ts", 5],
      ["base:src/c.ts", 7],
    ]);
  });

  it("rejects a Diff with children, an unknown attribute, no sides, a bad citation, or two ranges", () => {
    const { errors } = parsePage(
      [
        "# T",
        "",
        '<Diff before="base:a.ts">',
        "",
        "text",
        "",
        "</Diff>",
        "",
        '<Diff before="base:a.ts" file="head:a.ts" />',
        "",
        "<Diff />",
        "",
        '<Diff after="./a.md" />',
        "",
        '<Diff before="base:a.ts:1-2,5-6" after="head:a.ts" />',
      ].join("\n"),
      "fold",
    );
    expect(errors).toEqual([
      {
        line: 3,
        column: 1,
        message: '<Diff> takes no children; write <Diff before="…" after="…" />',
      },
      { line: 9, column: 26, message: '<Diff> has no attribute "file"' },
      { line: 11, column: 1, message: "<Diff> needs before, after, or both" },
      { line: 13, column: 1, message: 'citation "./a.md" must be <repo>:<path>[:<ranges>]' },
      {
        line: 15,
        column: 1,
        message: '<Diff before="base:a.ts:1-2,5-6"> takes at most one line range',
      },
    ]);
  });

  it("rejects images and reference definitions instead of dropping them", () => {
    expect(errorsAt("# T\n\n![alt](x.png)\n\n[a]: https://x\n")).toEqual([
      { line: 3, column: 1 },
      { line: 5, column: 1 },
    ]);
  });
});
