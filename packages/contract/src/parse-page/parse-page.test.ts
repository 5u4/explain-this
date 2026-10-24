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

  it("rejects images, reference definitions, and footnotes instead of dropping them", () => {
    expect(
      parsePage("# T\n\n![alt](x.png)\n\n[a]: https://x\n\nn[^1]\n\n[^1]: x\n", "t").errors,
    ).toEqual([
      { line: 3, column: 1, message: "image is not supported" },
      { line: 5, column: 1, message: "definition is not supported" },
      { line: 7, column: 2, message: "footnoteReference is not supported" },
      { line: 9, column: 1, message: "footnoteDefinition is not supported" },
    ]);
  });
});

describe("parsePage reports the cause of Markdown it cannot render", () => {
  const html =
    "HTML is not supported; only <details>, <summary>, and the component tags are allowed";

  it("rejects indented code", () => {
    expect(parsePage("# T\n\ntext\n\n    const x = 1\n", "t").errors).toEqual([
      { line: 5, column: 1, message: "indented code is not supported; use a fenced block" },
    ]);
  });

  it("keeps indented children of a component as text", () => {
    const { page, errors } = parsePage(
      "# T\n\n<details>\n<summary>S</summary>\n\n    folded text\n\n</details>\n",
      "t",
    );
    expect(errors).toEqual([]);
    expect(page?.blocks).toEqual([
      {
        type: "details",
        summary: [{ type: "text", value: "S" }],
        children: [{ type: "paragraph", children: [{ type: "text", value: "folded text" }] }],
      },
    ]);
  });

  it("rejects autolinks at their position and parses the rest of the page", () => {
    const { page, errors } = parsePage(
      "# T\n\n<https://c.d> first\n\nsee <a@b.co> and [b](./b.md)\n",
      "t",
    );
    expect(errors).toEqual([
      { line: 3, column: 1, message: "autolinks are not supported; write [text](url)" },
      { line: 5, column: 5, message: "autolinks are not supported; write [text](url)" },
    ]);
    expect(page?.pageLinks).toEqual([{ page: "b", anchor: null, at: { line: 5, column: 18 } }]);
  });

  it("rejects HTML comments without suggesting an MDX comment", () => {
    expect(parsePage("<!-- top -->\n# T\n\ntext <!-- hidden --> more\n", "t").errors).toEqual([
      { line: 1, column: 1, message: "HTML comments are not supported" },
      { line: 4, column: 6, message: "HTML comments are not supported" },
    ]);
  });

  it("rejects HTML elements other than details and summary, inline or as blocks", () => {
    expect(
      parsePage("# T\n\n<div>x</div>\n\na <span>y</span> b\n\n<div>\n\nx\n\n</div>\n", "t").errors,
    ).toEqual([
      { line: 3, column: 1, message: html },
      { line: 5, column: 3, message: html },
      { line: 7, column: 1, message: html },
    ]);
  });

  it("returns no page when the parser throws on something it cannot recover from", () => {
    expect(parsePage("# T\n\n<!-- a -->\n\n<Tree open=2>\n", "t")).toEqual({
      page: undefined,
      errors: [
        { line: 3, column: 1, message: "HTML comments are not supported" },
        {
          line: 5,
          column: 12,
          message:
            "Unexpected character `2` (U+0032) before attribute value, expected a character that can start an attribute value, such as `\"`, `'`, or `{`",
        },
      ],
    });
  });
});

describe("parsePage checks mermaid against the viewer's renderer", () => {
  const mermaid = (...lines: ReadonlyArray<string>) =>
    parsePage(`# T\n\n\`\`\`mermaid\n${lines.join("\n")}\n\`\`\`\n`, "t").errors;

  it("accepts diagrams of every type the renderer draws in full", () => {
    expect(
      mermaid(
        "%% comment",
        "graph TD",
        "  A[Start] --> B{ok?};",
        "  B -->|yes| C & D",
        "  B -. maybe .-> E",
        "  classDef hot fill:#f00",
        "  class A hot",
        "  style B fill:#0f0",
        "  linkStyle 0 stroke:#00f",
        "  subgraph S1 [Group]",
        "    direction LR",
        "    F --> G",
        "  end",
      ),
    ).toEqual([]);
    expect(
      mermaid(
        "stateDiagram-v2",
        "  direction TB",
        "  Idle : Waiting",
        "  [*] --> Idle",
        "  Idle --> Busy : go",
        "  state Busy {",
        "    a --> b",
        "  }",
        "  Busy --> [*]",
      ),
    ).toEqual([]);
    expect(
      mermaid(
        "sequenceDiagram",
        "  participant A",
        "  participant B as Bob",
        "  A->>+B: Hello",
        "  Note over A,B: shared",
        "  alt ok",
        "    B-->>-A: fine",
        "  else",
        "    B--)A: later",
        "  end",
      ),
    ).toEqual([]);
    expect(
      mermaid(
        "classDiagram",
        "  class Animal {",
        "    <<interface>>",
        "    +String name",
        "  }",
        "  Animal <|-- Dog : extends",
        "  Dog : +bark()",
      ),
    ).toEqual([]);
    expect(
      mermaid(
        "erDiagram",
        "  CUSTOMER ||--o{ ORDER : places",
        "  CUSTOMER {",
        '    string name PK "the name"',
        "    int age",
        "  }",
      ),
    ).toEqual([]);
    expect(
      mermaid(
        "xychart-beta",
        '  title "Sales"',
        "  x-axis [a, b, c]",
        '  y-axis "Revenue" 0 --> 100',
        "  bar [1, 2, 3]",
        "  line [3, 2, 1]",
      ),
    ).toEqual([]);
  });

  it("accepts syntax the renderer draws", () => {
    expect(
      mermaid(
        "graph TD",
        "  A --> B; B --> C",
        "  A -.label.-> B",
        '  click A href "https://example.com"',
        "  X@{ shape: rect }",
      ),
    ).toEqual([]);
    expect(mermaid("stateDiagram-v2", "  A --> B", "  note right of A : hi")).toEqual([]);
    expect(
      mermaid("gantt", "  dateFormat YYYY-MM-DD", "  section S", "  Task :a1, 2024-01-01, 3d"),
    ).toEqual([]);
  });

  it("reports a rejected header on the first body line", () => {
    expect(mermaid("flowchartt TD", "  A --> B")).toEqual([
      { line: 4, column: 1, message: "Expecting 'GRAPH', 'SPACE', 'NEWLINE', got 'NODE_STRING'" },
    ]);
  });

  it("reports a syntax error at its absolute line and column", () => {
    expect(mermaid("graph TD", "  A -> B")).toEqual([
      { line: 5, column: 5, message: "Expecting 'SEMI', 'NEWLINE', 'EOF', got 'MINUS'" },
    ]);
  });

  it("reports a semantic error at the fence with the full message", () => {
    expect(
      mermaid("gantt", "  dateFormat YYYY-MM-DD", "  section S", "  Task :a1, 2024-13-45, 3d"),
    ).toEqual([{ line: 3, column: 1, message: "Invalid date:2024-13-45" }]);
  });
});
