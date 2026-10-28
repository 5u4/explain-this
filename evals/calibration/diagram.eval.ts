import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CalibrationCase, defineCalibration } from "../harness/eval.ts";
import type { JudgedStatus } from "../harness/judge.ts";
import { DIAGRAM_RUBRIC, pageMaterial } from "../harness/rubric.ts";
import { exportTargetRepo, REPO_ROOT } from "../harness/target-repo.ts";

type DiagramCheck = keyof typeof DIAGRAM_RUBRIC;

const DEV = "explain:packages/cli/src/site/dev.ts";
const PARSE = "explain:packages/contract/src/parse-page";

const INTRO = `# Dev server live reload

\`explain dev\` serves the pages and reloads the open browser tab when a page or a cited file
changes. Every change goes through one debounced queue, so a burst of saves causes one reload.

Six pieces take part. The Vite file watcher's \`all\` handler sees each change
([dev.ts](${DEV}:69-76)). The \`changes\` queue holds changed paths ([dev.ts](${DEV}:29)). A stream
debounces that queue for 100 ms ([dev.ts](${DEV}:135-137)). \`reload\` rebuilds the dev state
([dev.ts](${DEV}:34)). \`loadDocRoot\` reads the doc root from disk ([dev.ts](${DEV}:36)). The dev
server sends the reload over its websocket ([dev.ts](${DEV}:62)). The browser is outside this repo:
Vite's client script in the browser receives that message and reloads the tab.
`;

const QUESTION = "What happens between saving a page and the browser reloading, and in what order?";

const SEQUENCE = `\`\`\`mermaid
sequenceDiagram
  participant W as watcher
  participant Q as changes queue
  participant D as debounce stream
  participant R as reload
  participant L as loadDocRoot
  participant B as browser
  W->>Q: offer changed path
  Q->>D: path
  D->>R: one call per 100 ms quiet window
  R->>L: load doc root under the lock
  L-->>R: new doc root
  R->>B: full-reload over the websocket
\`\`\``;

const AFTER = `
A second save inside the 100 ms window resets the debounce, so \`reload\` runs once for both. When
\`loadDocRoot\` fails, \`reload\` still sends \`full-reload\` so the browser shows the error page.
`;

const page = (sequence: string, question = QUESTION, intro = INTRO) =>
  `${intro}\n${question}\n\n${sequence}\n${AFTER}`;

const GOOD = page(SEQUENCE);

const UNLABELED = page(SEQUENCE.replaceAll(/^(\s+\w+-{1,2}>>\w+): .*$/gm, "$1"));

const NO_QUESTION = page(SEQUENCE, "The diagram below shows it.");

const UNCITED = page(
  SEQUENCE.replace(
    "  participant B as browser",
    "  participant B as browser\n  participant F as formatDiagnostics",
  ).replace(
    "  R->>B: full-reload",
    "  R->>F: format diagnostics when the doc root is invalid\n  R->>B: full-reload",
  ),
);

const LIST = `In order:

1. The watcher offers the changed path to the \`changes\` queue.
2. The queue passes the path to the debounce stream.
3. The debounce stream calls \`reload\` once per 100 ms quiet window.
4. \`reload\` asks \`loadDocRoot\` to load the doc root under the lock.
5. \`loadDocRoot\` returns the new doc root to \`reload\`.
6. \`reload\` sends \`full-reload\` to the browser over the websocket.

${QUESTION}`;

const LIST_PAIRED = page(SEQUENCE, LIST);

const DECORATIVE = page(
  SEQUENCE,
  `Each hop, as a table:

| From | To | What passes |
| --- | --- | --- |
| watcher | changes queue | changed path |
| changes queue | debounce stream | path |
| debounce stream | reload | one call per 100 ms quiet window |
| reload | loadDocRoot | load doc root under the lock |
| loadDocRoot | reload | new doc root |
| reload | browser | full-reload over the websocket |

${QUESTION}`,
);

const NO_DIAGRAM = `${INTRO}
${AFTER}`;

const OVER_CAP = `# Page parsing

\`parsePage\` turns page text into a \`Page\` tree ([parse-page.ts](${PARSE}/parse-page.ts:12-45)).
It hands the text to \`parseMarkdown\` ([markdown.ts](${PARSE}/markdown.ts)), then walks the result
with \`blocks\` ([block.ts](${PARSE}/block.ts)). \`blocks\` delegates to \`heading\`
([heading.ts](${PARSE}/heading.ts)), \`code\` ([code.ts](${PARSE}/code.ts)), \`inlines\`
([inline.ts](${PARSE}/inline.ts)), and \`jsxBlock\` ([jsx-block.ts](${PARSE}/jsx-block.ts)).
\`code\` checks mermaid fences with \`mermaidProblems\` ([mermaid.ts](${PARSE}/mermaid.ts)), and
\`citation\` ([context.ts](${PARSE}/context.ts)) records every reference.

Which function handles each kind of node, and where does the walk recurse?

\`\`\`mermaid
flowchart TD
  P[parsePage] -->|source text| M[parseMarkdown]
  P -->|mdast children| B[blocks]
  B -->|heading node| H[heading]
  B -->|code node| C[code]
  B -->|paragraph| I[inlines]
  B -->|JSX element| J[jsxBlock]
  J -->|child blocks| B
  C -->|mermaid fence| MM[mermaidProblems]
  C -->|file= attribute| R[citation]
  I -->|link href| R
\`\`\`

The recursion through \`jsxBlock\` is why a \`<Tabs>\` inside \`<details>\` parses like top-level
content.
`;

const LINEAR = `# Page parsing entry

\`parsePage\` ([parse-page.ts](${PARSE}/parse-page.ts:12-45)) turns one page's text into a \`Page\`.

In which order does \`parsePage\` run its steps?

\`\`\`mermaid
flowchart TD
  F[reject frontmatter] -->|no frontmatter| M[parseMarkdown]
  M -->|mdast tree| T[check the # title]
  T -->|title inlines| B[convert blocks]
  B -->|context arrays| R[return Page]
\`\`\`

Frontmatter is rejected first because the parser has no frontmatter extension
([parse-page.ts](${PARSE}/parse-page.ts:13-18)). \`parseMarkdown\` is the only fatal path
([parse-page.ts](${PARSE}/parse-page.ts:20-21)). A missing title is reported but parsing continues
([parse-page.ts](${PARSE}/parse-page.ts:32-39)). \`toc\`, \`refs\`, and \`pageLinks\` come from the
context after the walk ([parse-page.ts](${PARSE}/parse-page.ts:40-44)).
`;

const PROSE_PAIRED = page(
  SEQUENCE,
  `A save starts at the watcher, which offers the changed path to the \`changes\` queue. The debounce
stream drains that queue and calls \`reload\` once the files have been quiet for 100 ms. \`reload\`
takes the lock and asks \`loadDocRoot\` for a fresh doc root, then tells the browser to reload over
the websocket.

${QUESTION}`,
);

const TABS_INTRO = `# Page parsing

\`parsePage\` ([parse-page.ts](${PARSE}/parse-page.ts:12-45)) turns page text into a \`Page\`. It
hands the text to \`parseMarkdown\` ([markdown.ts](${PARSE}/markdown.ts)), which returns an mdast
tree, then \`blocks\` ([block.ts](${PARSE}/block.ts)) converts each mdast node into a \`Page\` block,
with \`heading\` ([heading.ts](${PARSE}/heading.ts)) turning each heading into a TOC entry.

Assume \`parsePage(source, "demo")\` with the input below.
`;

const TABS_GOOD = `${TABS_INTRO}
What does the same page look like after each step of \`parsePage\`?

<Tabs>
<Tab label="Markdown input">

\`\`\`md
# Demo

## Read {#read}
\`\`\`

</Tab>
<Tab label="mdast from parseMarkdown">

\`\`\`text
root.children
  heading(depth=1) → text("Demo")
  heading(depth=2) → text("Read {#read}")
\`\`\`

</Tab>
<Tab label="Page from blocks and heading">

\`\`\`text
Page
  title: "Demo"
  blocks: [heading(level=2, id="read", text="Read")]
  toc: [{ id: "read", depth: 2, text: "Read" }]
\`\`\`

</Tab>
</Tabs>

The \`{#read}\` suffix is text in mdast and becomes the heading id only in the \`Page\`.
`;

const TABS_NO_TRIGGER = `${TABS_INTRO}
In which order does \`parsePage\` run its steps?

<Tabs>
<Tab label="1. Parse markdown">
\`parsePage\` calls \`parseMarkdown\` on the source text.
</Tab>
<Tab label="2. Convert blocks">
\`parsePage\` passes the tree's children to \`blocks\`.
</Tab>
<Tab label="3. Build headings">
\`blocks\` calls \`heading\` for each heading node.
</Tab>
</Tabs>

Each step runs once per page.
`;

const OLD_AUDIT = await Bun.$`git -C ${REPO_ROOT} show 44fc227^:docs/zh/parse-page.md`.text();

const root = mkdtempSync(join(tmpdir(), "ws-"));
await exportTargetRepo(join(root, "code", "explain"));
const codeRoot = join(root, "code");

const CHECKS = Object.keys(DIAGRAM_RUBRIC) as DiagramCheck[];

const MERMAID_ONLY: DiagramCheck[] = ["edges-labeled", "node-cap"];

function diagramCase(
  markdown: string,
  fails: DiagramCheck[],
  checks: DiagramCheck[] = CHECKS,
  otherwise: JudgedStatus = "pass",
  notApplicable: DiagramCheck[] = [],
): CalibrationCase {
  const status = (check: DiagramCheck): JudgedStatus =>
    fails.includes(check) ? "fail" : notApplicable.includes(check) ? "n/a" : otherwise;
  return {
    material: pageMaterial(markdown, undefined, codeRoot),
    criteria: Object.fromEntries(checks.map((check) => [check, DIAGRAM_RUBRIC[check]])),
    expected: Object.fromEntries(checks.map((check) => [check, status(check)])),
  };
}

const cases: Record<string, CalibrationCase> = {
  good: diagramCase(GOOD, []),
  "no-diagram": diagramCase(NO_DIAGRAM, [], CHECKS, "n/a"),
  unlabeled: diagramCase(UNLABELED, ["edges-labeled"]),
  "no-question": diagramCase(NO_QUESTION, ["question-named"]),
  "over-cap": diagramCase(OVER_CAP, ["node-cap"]),
  uncited: diagramCase(UNCITED, ["nodes-cited"]),
  linear: diagramCase(LINEAR, ["draw-on-a-trigger"]),
  decorative: diagramCase(DECORATIVE, ["earns-its-place"]),
  "prose-paired": diagramCase(PROSE_PAIRED, []),
  "list-paired": diagramCase(LIST_PAIRED, []),
  "tabs-good": diagramCase(TABS_GOOD, [], CHECKS, "pass", MERMAID_ONLY),
  "tabs-no-trigger": diagramCase(
    TABS_NO_TRIGGER,
    ["draw-on-a-trigger"],
    CHECKS,
    "pass",
    MERMAID_ONLY,
  ),
  "old-audit": diagramCase(
    OLD_AUDIT,
    ["edges-labeled", "question-named", "node-cap"],
    ["edges-labeled", "question-named", "node-cap"],
  ),
};

rmSync(root, { recursive: true, force: true });

defineCalibration("diagram-calibration", cases);
