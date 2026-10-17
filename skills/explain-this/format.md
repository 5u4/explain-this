# Doc root format

```text
<doc root>/
├── explain.json                 site settings, repos, nav
└── <locale>/                    one directory per entry in "locales"
    ├── <page>.md                page source
    └── <page>.sources.json      written by `explain freshness sync`
```

Write each locale from the code on its own rather than translating another locale, so its pages may
cite different files.

## explain.json

```json
{
  "title": "explain-this",
  "locales": ["zh", "en"],
  "repos": { "explain": ".." },
  "nav": [
    { "title": "contract", "pages": ["citation", "parse-page"] },
    { "title": "cli", "pages": ["validate", "freshness"] }
  ]
}
```

- `title` and each nav `title` are single strings shared by every locale; the document `title` is
  optional and defaults to `Document`.
- `defaultLocale` is optional and defaults to the first of `locales`.
- `repos` maps a key to the path of a work tree, relative to the directory holding `explain.json`
  or absolute. Citations read the files on disk,
  including uncommitted, untracked, and ignored files.
- `nav` lists page ids in reading order, which the pager follows. Each id is a `<locale>/<id>.md` in
  every locale.

## Page source

A page is GitHub-flavored Markdown plus the tags under [Components](#components), with string
literal attribute values, and `<details>` and `<summary>` as its only raw HTML.

- The page opens with one `# Title`; its sections use `##` to `####`.
- Each heading's id comes from its text, or from an explicit `{#id}` suffix. Give an explicit id to
  any heading another page links to.

The viewer generates navigation, search, the table of contents, the freshness badge, the sources
panel, previous/next links, and a source viewer listing the pages that cite each file. A page holds
only its own content.

### Links

The link target decides the kind.

| Written | Kind |
|---|---|
| `[parseRef](explain:packages/contract/src/citation.ts:62-72)` | citation |
| `[parseRef](explain:packages/contract/src/citation.ts:62-72,77-80)` | citation of several ranges |
| `[citation.ts](explain:packages/contract/src/citation.ts)` | citation of a whole file |
| `[解析页面](./parse-page.md)`, `[...](./parse-page.md#links)`, `[...](#links)` | page link within this locale |
| `[spec](https://...)` | external link |

A citation is `<repo>:<path>[:<ranges>]`: a key of `explain.json` `repos`, a path from the repo root
with `/` separators, and 1-based line ranges `N` or `N-M`, comma-separated, in ascending order.

### Code

````md
```ts file=explain:packages/contract/src/citation.ts:74-75
```
````

A fence with `file=<citation>` is an excerpt: its body stays empty and the viewer reads the code from
the repo. A fence without `file=` is literal code. A `mermaid` fence is a diagram, rendered with
beautiful-mermaid:

- `explain validate` reports a mermaid header beautiful-mermaid rejects and each line it would drop.
- Prefer `TD` over wide `LR` graphs.
- A state diagram with self-loops or parallel edges, or a branch-only decision tree, reads better as a
  table.

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
repo keys, paths (a rename), and ranges.

## Freshness

`explain freshness sync` records every file a page cites, in links, excerpts, `AnnotatedSource file`, and `Diff
before` and `after`. The page goes stale when it cites a different set of files
or any recorded file changes on disk.
