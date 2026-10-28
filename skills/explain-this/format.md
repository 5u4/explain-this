# Doc dir format

```text
~/.explain/<YYYYMMDD>-<slug>/
├── 01-overview.md               page source; the first by filename is the entry page
├── 02-<topic>.md                page source
└── code/
    └── <key>/                   one directory per copied version of a repo
        └── <repo-relative path> whole file, copied by shell command
```

## Pages

- Pages are the top-level `*.md` files of the doc dir. Files under `code/` are never pages.
- A page's id is its filename without `.md` and must match `^[a-z0-9][a-z0-9-]*$`. A dir with no
  page is an error.
- Navigation lists every page sorted by filename, labeled with its `# Title` (the id when it has
  none). The first page is the entry page, and its title is the document title. The pager follows
  the navigation.

## Code directory

A citation `<key>:<path>` resolves to `<dir>/code/<key>/<path>`. `explain validate` reports an error
when `code/<key>/` is missing, when the file is missing or is not a file, when a line range runs past
the file's end, and when the path reaches through a symlink to a file outside `code/<key>/`.

Files under `node_modules/`, `.git/`, or `test-results/` inside `code/<key>/` do not trigger reload in `explain open`.

## Page source

A page is GitHub-flavored Markdown plus the tags under [Components](#components), with string
literal attribute values, and `<details>` and `<summary>` as its only raw HTML.

- The page opens with one `# Title`; its sections use `##` to `####`.
- Each heading's id comes from its text, or from an explicit `{#id}` suffix. Give an explicit id to
  any heading another page links to.

The viewer generates navigation, the table of contents, and previous/next links. A page holds only
its own content.

### Links

The link target decides the kind.

| Written | Kind |
|---|---|
| `[parseRef](explain:packages/contract/src/citation.ts:62-72)` | citation |
| `[parseRef](explain:packages/contract/src/citation.ts:62-72,77-80)` | citation of several ranges |
| `[citation.ts](explain:packages/contract/src/citation.ts)` | citation of a whole file |
| `[解析页面](./parse-page.md)`, `[...](./parse-page.md#links)`, `[...](#links)` | page link within this doc |
| `[spec](https://...)` | external link |

A citation is `<key>:<path>[:<ranges>]`: a directory name under `code/` matching
`^[a-z][a-z0-9-]*$` (not `http`, `https`, or `mailto`), a path from the repo root with `/`
separators, and 1-based line ranges `N` or `N-M`, comma-separated, in ascending order.

### Code

````md
```ts file=explain:packages/contract/src/citation.ts:74-75
```
````

A fence with `file=<citation>` is an excerpt: its body stays empty and the viewer reads the code from
`code/`. A fence without `file=` is literal code. A `mermaid` fence is a diagram, rendered with
pele:

- Every diagram type pele supports works: flowchart, sequence, state, class, ER, gantt, pie,
  gitGraph, mindmap, timeline, journey, xychart, quadrantChart, sankey, C4, block, architecture, and
  more.
- A diagram wider than its column shrinks to fit, and readers can zoom and pan it. In a column
  narrower than 640px, a wide `LR` graph switches to `TB` if that is narrower.
- A `click` link opens with `rel="noopener"`. A link that starts with `//`, or whose scheme is not
  `http`, `https`, `mailto`, or `tel`, is dropped.
- `explain validate` reports pele's first syntax error at its absolute line and column in the page.
  It reports a semantic error, such as an invalid gantt date, at the fence line.
- Prefer `TD` over wide `LR` graphs.

### Alerts and disclosure

`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]` render as callouts;
`> [!IMPORTANT]` holds invariants. `<details><summary>…</summary>…</details>` folds secondary
content. Task lists (`- [ ]`) render as static checkboxes.

### Components

| Tag | Attributes | Children |
|---|---|---|
| `<Tree open="N">` | `open`: depth expanded by default, optional | one Markdown list; nested items are the tree, citations in items link nodes to code |
| `<Tabs>` | none | `<Tab label="…">` elements with block children |
| `<BeforeAfter>` | none | one `<Before label="…">` then one `<After label="…">`, block children |
| `<AnnotatedSource file="<citation>">` | `file`: a citation of one range | `<Note lines="N[-M]">` elements with inline children, each inside that range |
| `<Diff before="<citation>" after="<citation>" />` | `before` and `after`: citations of at most one range; omit `before` for an added file, `after` for a deleted one | none |

Use `<Diff>` rather than `<BeforeAfter>` whenever both sides are code. Its sides may cite different
keys, paths (a rename), and ranges.
