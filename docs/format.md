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
├── widgets/
│   └── <name>.js                one ES module per widget, shared by all locales
└── dist/                        written only by `explain build`
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
- Repo keys match `^[a-z][a-z0-9-]*$` and are not `term`, `http`, `https`, or `mailto`.
- A repo value is either an absolute path or an object `{ "path": "<absolute path>", "commit":
  "<40-hex commit id>" }`.
  - A path is a work tree. Citations read the files on disk, including uncommitted, untracked, and
    ignored files.
  - An object pins the key to a commit. `path` is a git repository and `commit` must name a commit in
    it, or `explain.json` is invalid. Citations read the file as stored in that commit; the work tree
    is ignored. A symlink or submodule entry is not a file.
  - Several keys may share one `path`. A pull request doc pins one key to the base commit and one to
    the head commit, and one more key per intermediate commit it cites:

```json
"repos": {
  "tael-base": { "path": "/Users/senhung/Workspaces/tael", "commit": "fda46002919a2bf9e30be4cf2cabc31e3aacfe0d" },
  "tael": { "path": "/Users/senhung/Workspaces/tael", "commit": "f427dce30c8934c399772084d51fbfa9ec96598a" }
}
```

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
  segments, and must name an existing file when the page is hashed. In a work tree, untracked and
  ignored files are allowed.
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
| `<Diff before="<citation>" after="<citation>" />` | `before` and `after`: citations with at most one range; at least one is required; omitting `before` means the file was added, omitting `after` means it was deleted | none |
| `<Widget name="…" title="…" source="<citation> <citation>…" …>` | `name` matches `widgets/<name>.js`; `title` required; `source` lists the code the widget ports or reads, space-separated, required; any other attribute is passed to the widget as a string prop | block children: a one-paragraph description |

Anything else is a parse error.

`<Diff>` renders a line diff of the two excerpts: removed lines in `--removed`, added lines in
`--added`, unchanged lines as context, with the line numbers of both sides. Runs of more than six
unchanged lines fold to three lines on each side behind a toggle. The two sides may cite different
repo keys, paths (a rename), and ranges; each side is an ordinary citation for hashing and
freshness. Prefer `<Diff>` over `<BeforeAfter>` whenever both sides are code.

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

- `files` is the set of files the page cites: every citation, excerpt, `AnnotatedSource file`,
  `Diff before` and `after`, and `Widget source`, reduced to `(repo, path)`, sorted by repo then path.
- `hash` is the git blob id of the file's bytes: SHA-1 of `blob <byte length>\0<bytes>`, equal to
  `git hash-object --no-filters <file>`. For a work tree the bytes are on disk and hashing needs no
  git; for a pinned repo the bytes are the blob stored in the commit, and the hash is its blob id.
- `commit` is the repo's `HEAD` when a work-tree repo is a git work tree, the pinned commit for a
  pinned repo, and absent otherwise. The LLM uses it as a starting point to find what changed. No tool
  diffs it.

## Freshness

A page is `fresh` or `stale`. It is stale when any of these holds:

- the sources file is missing;
- the set of `(repo, path)` the page cites differs from `files`;
- a recorded file no longer exists;
- a recorded file's current hash differs from `hash`.

`explain check` reports every stale page with the reasons above, per file. Exit codes: 0 when every
page is fresh, 1 when any page is stale, 2 when any page or `explain.json` is invalid.

A pinned repo never changes, so its pages go stale only when `explain.json` pins the key to another
commit, for example after new pushes to a pull request.

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
- Style only with Tailwind classes from the widget theme below, plus the viewer's base classes. A
  widget has no stylesheet: `explain check` rejects any `.css` file in `widgets/`.
- UI strings live in the module, keyed by locale, with an `en` fallback.

### Classes

Write every Tailwind class inside a `tw` tagged template, with `const tw = String.raw;` at the top of
the module. Text inside `tw` templates is the only text the build and the lint read as classes, so
ordinary strings and identifiers are never checked, and a class written anywhere else gets no CSS.

```js
const tw = String.raw;
const ROW = tw`flex items-center gap-2 rounded-small bg-raised`;
el("li", { class: dropped ? tw`opacity-60 line-through decoration-removed` : ROW });
el("select", { class: `ui-select ${tw`min-w-0 max-sm:w-full`}` });
```

- A `tw` template takes no `${}` substitutions. Pick between whole `tw` strings in JS, or toggle a
  boolean `data-*` attribute and style it with a `data-name:` variant.
- Base classes (`ui-select`, …) are plain strings outside `tw`.
- `explain check` reports, as `widgets/<name>.js:line:col`, every class in a `tw` template that is an
  arbitrary value, property, or variant (anything with `[`, `]`, `(`, or `)`, such as `p-[3px]`,
  `bg-[#f00]`, `[color:red]`, `data-[x=y]:hidden`) and every class the widget theme does not generate
  (`bg-red-500`, `text-lg`, `rounded-xl`).

`explain dev` compiles the classes of every `widgets/*.js` into one stylesheet at
`/@explain/widgets.css` and rebuilds it when a module changes. Utilities are `!important`: the viewer's
own CSS is unlayered and would otherwise win inside a widget. Properties a widget does not set still
inherit from the page, such as the prose margins on `p`, `ol`, and `li`.

The widget theme (`packages/viewer/src/styles/widgets.css`) replaces Tailwind's colors, fonts, font
sizes, and radii with the tokens below. Everything else keeps Tailwind's defaults: font weights,
letter spacing, line heights, breakpoints (`sm` is 40rem), transitions, and variants.

| Utility family | Classes | Token |
|---|---|---|
| Color (`bg-`, `text-`, `border-`, `inset-ring-`, `decoration-`, `fill-`, `stroke-`, …) | `page`, `raised`, `inset` | `--surface-page`, `--surface-raised`, `--surface-inset` |
| | `border`, `border-strong` | `--border`, `--border-strong` |
| | `strong`, `body`, `muted`, `faint` | `--text-strong`, `--text-body`, `--text-muted`, `--text-faint` |
| | `mark`, `removed`, `added`, `fresh`, `stale`, `note`, `important`, `warning`, `focus`, `pass`, `pass-wash`, `fail`, `fail-wash` | the token of the same name |
| Font family | `font-body`, `font-display`, `font-mono` | `--font-body`, `--font-display`, `--font-mono` |
| Font size | `text-step--1`, `text-step-0`, `text-step-1`, `text-step-2` | `--step--1` … `--step-2` |
| Radius | `rounded-small`, `rounded-medium` | `--radius-s`, `--radius-m` |
| Spacing (`p-`, `m-`, `gap-`, `w-`, `min-w-`, `leading-`, …) | `N` in steps of 0.25 | `N × --space-1` (4px) |

Spacing keeps Tailwind's multiplier scale with `--space-1` as the unit instead of mapping names to
`--space-*`. Every `--space-N` is a step on it (`--space-5` is `6`, `--space-6` is `8`, `--space-7` is
`12`), and fixed sizes such as `min-w-24.5` or `leading-4.75` stay expressible without arbitrary
values. A named scale would leave those sizes reachable only through `[…]`.

Tokens exposed to widgets (CSS custom properties on `:root`):

| Group | Names |
|---|---|
| Surface | `--surface-page`, `--surface-raised`, `--surface-inset`, `--border`, `--border-strong` |
| Text | `--text-strong`, `--text-body`, `--text-muted`, `--text-faint` |
| Meaning | `--mark` (ties prose to source), `--removed`, `--added`, `--fresh`, `--stale`, `--note`, `--important`, `--warning`, `--focus`, `--pass`, `--pass-wash`, `--fail`, `--fail-wash` |
| Type | `--font-body`, `--font-display`, `--font-mono`, `--step--1`, `--step-0`, `--step-1`, `--step-2` |
| Space and shape | `--space-1` … `--space-8`, `--radius-s`, `--radius-m` |

Base classes: `ui-button`, `ui-select`, `ui-segmented`, `ui-table`, `ui-code`, `ui-tag`.

A color means one thing across the site. Strike-through in `--removed` means "removed or folded
away"; `--fresh` and `--stale` mean page freshness; `--pass` and `--fail` mean a widget's port
agrees or disagrees with the test it reproduces. Pass is a cyan and fail a rose, placed on hues no
other meaning token uses, so neither reads as fresh, added, removed, or stale; pair them with ✓ and ✗
so the hue is never the only signal. A categorical value that is neither good nor bad, such as which
branch a function returned, gets no meaning color at all.

## Generated pages

The viewer builds these; the LLM writes none of them.

- Navigation, search, page table of contents, freshness badge, sources panel, previous/next.
- Glossary page, from `glossary.md` (`## Label {#id}` followed by the definition).
- Source viewer at `source/<repo>/<path>`, with the pages that cite the file. The source pane and the
  source viewer name the repo key, and the short commit for a pinned repo.

## Static build

`explain build [--out <dir>]` writes the viewer as a static site that any static host serves with no
server code and no rewrite rules. `--out` defaults to `dist/` in the doc root. The build refuses a doc
root that `explain check` would exit 2 on, and refuses to replace a non-empty `--out` that is not a
previous build.

```text
<out>/
├── index.html, 404.html, assets/      the viewer bundle
├── <locale>/index.html                one copy of index.html per route
├── <locale>/<page>/index.html
├── <locale>/source/<repo>/<path>/index.html
└── @explain/                          every response `explain dev` would give, frozen
    ├── api/site
    ├── api/page/<locale>/<page>
    ├── api/search/<locale>
    ├── api/source/<repo>/<path>
    ├── widgets/<name>.js
    └── widgets.css
```

- The site is served from the host root, not a subdirectory.
- Every file a page cites or records in its sources file is copied into `@explain/api/source/`. Do
  not publish a build of a private repo.
- Freshness is frozen at build time: a page stale when built shows stale, and later changes to the
  repos do not reach the site until the next build.
