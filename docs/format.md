# Doc root format

A doc root is a directory that holds the explanation of one or more source repos. It lives outside
those repos and is never tracked by them. The `explain` CLI runs inside a doc root (it walks up from
the working directory to the nearest `explain.json`).

```text
<doc root>/
├── explain.json                 site settings, repos, nav
├── <locale>/                    one directory per entry in explain.json "locales"
│   ├── <page>.md                page source, written by the LLM
│   ├── <page>.sources.json      written only by `explain hash`
│   ├── glossary.md              term definitions for this locale
│   └── glossary.sources.json
└── widgets/
    ├── <name>.js                one ES module per widget, shared by all locales
    └── <name>.css               optional, loaded by the viewer next to the module
```

Each locale is written independently from the code. A zh-CN page is not a translation of the en page,
and its sources may differ. Every locale page carries its own sources file, so freshness works the
same way for every locale.

## explain.json

```json
{
  "title": { "en": "omp-fold-in", "zh-CN": "omp-fold-in 维基" },
  "locales": ["zh-CN"],
  "defaultLocale": "zh-CN",
  "repos": { "fold": "/Users/senhung/Workspaces/omp-fold-in" },
  "nav": [
    { "title": { "zh-CN": "入门" }, "pages": ["index"] },
    { "title": { "zh-CN": "运行时" }, "pages": ["plugin-entry", "fold", "compaction"] }
  ]
}
```

- `locales` is non-empty and unique. `defaultLocale` is one of them. A missing `defaultLocale`
  means `en`, which must then be listed.
- Every localized string (`title`, each nav `title`) has an entry for every locale.
- Repo keys match `^[a-z][a-z0-9-]*$` and are not `term`, `http`, `https`, or `mailto`. Values are
  absolute paths.
- Page ids match `^[a-z0-9][a-z0-9-]*$`, appear once across `nav`, and are not `glossary` or
  `source`. Every listed page must exist as `<locale>/<id>.md` in every locale. `nav` order is the
  reading order used by the pager.
- `glossary` is implicit. Every locale has `glossary.md`; it is not listed in `nav`.

## Page source

A page is GitHub-flavored Markdown plus a fixed set of JSX tags. The parser does not evaluate
anything: no expressions, no imports, no HTML comments, no raw HTML other than `<details>` and
`<summary>`. Attribute values are string literals.

- The page starts with exactly one `# Title`. No other `#` heading, and no `#####` or deeper.
- `##` to `####` headings get an id from their text (github-slugger, CJK kept, `-1` suffix on
  collision), or an explicit `{#id}` suffix matching `^[a-z0-9][a-z0-9-]*$`. Use an explicit id for
  any heading another page links to.
- `glossary.md` follows the same rules, and every `##` in it carries an explicit `{#id}`: that id is
  the term id.
- No frontmatter.

### Links

The link target decides the kind.

| Written | Kind | Rule |
|---|---|---|
| `[foldView](fold:fold.ts:12-30)` | citation | repo key, path from repo root, optional ranges |
| `[foldView](fold:fold.ts:12-30,40-45)` | citation | several ranges |
| `[fold.ts](fold:fold.ts)` | citation | whole file |
| `[run](term:run)` | term | id must be a `{#id}` in this locale's `glossary.md` |
| `[压缩闸门](./compaction.md)`, `[...](./compaction.md#gate)`, `[...](#gate)` | page link | page must exist in this locale |
| `[spec](https://...)` | external link | `http`, `https`, `mailto` only |

Citation grammar: `<repo>:<path>[:<ranges>]`.

- `<repo>` is a key of `explain.json` `repos`.
- `<path>` is relative to the repo root, uses `/`, has no `:`, no leading `/`, no `.` or `..`
  segments, and must name an existing file when the page is hashed. Untracked and ignored files are
  allowed.
- `<ranges>` is `N` or `N-M`, comma-separated, 1-based, `N <= M`, ascending, non-overlapping, within
  the file's line count when the page is hashed.

A cited file that disappears or shrinks after hashing makes the page stale, not invalid. `explain
hash` refuses to record it until the page is fixed.

### Code

````md
```ts file=fold:fold.ts:39-41
```
````

A fence with `file=<citation>` is an excerpt. Its body must be empty; the viewer reads the code from
the repo. A fence without `file=` is literal code. Every code block gets a copy button. A `mermaid`
fence is a diagram, rendered with beautiful-mermaid.

Mermaid authoring rules, from the prototype:

- No ASCII `]` inside node labels; beautiful-mermaid silently drops the rest of the graph.
- `click`, state-diagram `note`, `@{}` shapes, `architecture-beta`, and `gantt` are unsupported.
- Prefer `TD` over wide `LR` graphs.
- A state diagram with self-loops or parallel edges, or a branch-only decision tree, reads better as a
  table.

### Alerts and disclosure

`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]` render as callouts.
`> [!IMPORTANT]` is the convention for invariants. `<details><summary>…</summary>…</details>` folds
secondary content. Task lists (`- [ ]`) render as static checkboxes.

### Components

Tags need a blank line between the tag and Markdown children.

| Tag | Attributes | Children |
|---|---|---|
| `<Tree open="N">` | `open`: depth expanded by default, optional | exactly one Markdown list; nested items are the tree, citations in items link nodes to code |
| `<Tabs>` | none | only `<Tab label="…">` with block children |
| `<BeforeAfter>` | none | exactly one `<Before label="…">` then one `<After label="…">`, block children |
| `<AnnotatedSource file="<citation>">` | `file`: citation with exactly one range | only `<Note lines="N[-M]">` with inline children; note lines lie inside the file range |
| `<Widget name="…" title="…" source="<citation> <citation>…" …>` | `name` matches `widgets/<name>.js`; `title` required; `source` lists the code the widget ports or reads, space-separated, required; any other attribute is passed to the widget as a string prop | block children: a one-paragraph description |

Anything else is a parse error.

## Sources file

`<locale>/<page>.sources.json` is written by `explain hash` and never by hand or by the LLM.

```json
{
  "files": [
    {
      "repo": "fold",
      "path": "fold.ts",
      "hash": "9f3c2e1c0d4f…",
      "commit": "59f0108a2b…"
    }
  ]
}
```

- `files` is the set of files the page cites: every citation, excerpt, `AnnotatedSource file`, and
  `Widget source`, reduced to `(repo, path)`, sorted by repo then path.
- `hash` is the git blob id of the file's bytes on disk: SHA-1 of `blob <byte length>\0<bytes>`, equal
  to `git hash-object --no-filters <file>`. It needs no git.
- `commit` is the repo's `HEAD` when the repo is a git work tree, and absent otherwise. The LLM uses
  it as a starting point to find what changed. No tool diffs it.

## Freshness

A page is `fresh` or `stale`. It is stale when any of these holds:

- the sources file is missing;
- the set of `(repo, path)` the page cites differs from `files`;
- a recorded file no longer exists;
- a recorded file's current hash differs from `hash`.

`explain check` reports every stale page with the reasons above, per file. Exit codes: 0 when every
page is fresh, 1 when any page is stale, 2 when any page or `explain.json` is invalid.

## Widgets

A widget is free-form code inside a fixed frame. The viewer renders the frame: title, the
description from the tag body, and the `source` citations. The module fills the body.

```ts
export function mount(root: HTMLElement, ctx: WidgetContext): void | (() => void)

type WidgetContext = {
  props: Readonly<Record<string, string>>   // tag attributes other than name, title, source
  locale: string
  cite(ref: string, label?: string): HTMLElement   // a citation element wired to the source pane
  readSource(ref: string): Promise<string>         // file text for a citation
}
```

- Show only what the cited code or its tests contain. A widget does not invent data and does not let
  the reader edit inputs; the reader chooses among fixed cases.
- Style only with the viewer's tokens and base classes. `widgets/<name>.css` must not contain color
  literals (`#…`, `rgb(`, `hsl(`, `oklch(`, named colors); `explain check` rejects them.
- UI strings live in the module, keyed by locale, with an `en` fallback.

Tokens exposed to widgets (CSS custom properties on `:root`):

| Group | Names |
|---|---|
| Surface | `--surface-page`, `--surface-raised`, `--surface-inset`, `--border`, `--border-strong` |
| Text | `--text-strong`, `--text-body`, `--text-muted`, `--text-faint` |
| Meaning | `--mark` (ties prose to source), `--removed`, `--added`, `--fresh`, `--stale`, `--note`, `--important`, `--warning`, `--focus` |
| Type | `--font-body`, `--font-display`, `--font-mono`, `--step--1`, `--step-0`, `--step-1`, `--step-2` |
| Space and shape | `--space-1` … `--space-8`, `--radius-s`, `--radius-m` |

Base classes: `ui-button`, `ui-select`, `ui-segmented`, `ui-table`, `ui-code`, `ui-tag`.

A color means one thing across the site. Strike-through in `--removed` means "removed or folded
away"; a widget that shows a different outcome uses a different token.

## Generated pages

The viewer builds these; the LLM writes none of them.

- Navigation, search, page table of contents, freshness badge, sources panel, previous/next.
- Glossary page, from `glossary.md` (`## Label {#id}` followed by the definition).
- Source viewer at `source/<repo>/<path>`, with the pages that cite the file.
