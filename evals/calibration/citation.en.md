# Citations

A *citation* is the string a page uses to point at code, such as
`explain:packages/contract/src/citation.ts:62-72`. The pages live in a *doc root*, a directory
whose settings file is `explain.json`. A citation has three parts: a *repo key* (a name that
`explain.json` gives to a checked-out repo), a path inside that repo, and optional *line ranges*
(spans of 1-based line numbers, both ends included).
[`parseRef`](explain:packages/contract/src/citation.ts:62-72) turns that string into a *`Ref`*,
the parsed value `{ repo, path, ranges }`, or into one error
message. The idea that makes it work: `parseRef` checks syntax only. It splits the string on `:`,
holds each part to a fixed rule, and never reads a file, so whether the cited code exists is
checked later by the command-line tool that loads the doc root, the `explain` CLI
([check-page.ts](explain:packages/cli/src/doc-root/check-page.ts:58-70)).

## One link target becomes a `Ref` in five steps

Take one case: the *page parser* (the code that turns a page's Markdown into structured blocks)
meets the link `[parseRef](explain:packages/contract/src/citation.ts:62-72)` in a
paragraph, and no check has yet looked at whether the repo or the file exists.

### The page parser sends the target to `parseRef` because its scheme is not `http`, `https`, or `mailto`

A link target can be an anchor (`#name`), a *page link* (`./other.md`, a link to another page of
the same doc root), a web URL, or a citation,
so the page parser sorts it by its prefix. Anchors and page links are handled first
([inline.ts](explain:packages/contract/src/parse-page/inline.ts:17-33)). This excerpt shows what
comes next: the scheme is read, the three web schemes return a plain link, and every other scheme
goes to the citation check.

```ts file=explain:packages/contract/src/parse-page/inline.ts:34,42-44
```

The target `explain:packages/contract/src/citation.ts:62-72` has the scheme `explain`, so the page
parser calls `parseRef` through a small helper in
[context.ts](explain:packages/contract/src/parse-page/context.ts:20-25). This step is skipped when
the target starts with `#` or `./`, or when its scheme is `http`, `https`, or `mailto`.

### Splitting on `:` yields exactly the three parts `parseRef` accepts

`parseRef` splits the target on every `:` to separate the three parts a citation carries, and it
accepts two or three parts ([citation.ts](explain:packages/contract/src/citation.ts:63-67)). Our
target yields `explain`, `packages/contract/src/citation.ts`, and `62-72`. Because the colon is the
only separator, a path can never contain one. Parsing ends here with the message
`citation "…" must be <repo>:<path>[:<ranges>]` when there are fewer than two or more than three
parts.

### The repo key and the path pass syntax checks without touching the disk

`parseRef` checks the repo key first and the path second, and the first problem found becomes the
error ([citation.ts](explain:packages/contract/src/citation.ts:68-69)). The key check,
[`repoKeyProblem`](explain:packages/contract/src/citation.ts:24-28), accepts `explain`: it is a
lowercase letter followed by lowercase letters, digits, or `-`, and it is none of the names kept
for web links, `http`, `https`, and `mailto`, which the code calls
[reserved keys](explain:packages/contract/src/citation.ts:16-20). The path check,
[`pathProblem`](explain:packages/contract/src/citation.ts:30-41), accepts
`packages/contract/src/citation.ts`: it is non-empty, relative, uses `/`, and has no empty, `.`, or
`..` segment. These rules exist so that a key is one a doc root could declare and a path cannot
climb out of its repo. Parsing ends here with the first message either check returns.

### The text `62-72` becomes one line range from 62 to 72

With a third part present, `parseRef` hands `62-72` to
[`parseRanges`](explain:packages/contract/src/citation.ts:43-60) to turn the text into numbers. It
splits on `,`, matches each comma-separated item against
[`rangePattern`](explain:packages/contract/src/citation.ts:22) (`N` or `N-M`, with no zero and no
leading zero), and reads `62-72` as the line range `{ from: 62, to: 72 }`. It rejects a line range
that ends before it starts and a line range that does not start after the previous one ends, so each set of
line ranges has exactly one spelling. This step is skipped when the citation has no third part:
`parseRef` then returns `ranges: []`, which means the whole file
([citation.ts](explain:packages/contract/src/citation.ts:70)). It ends early at the first line
range that breaks a rule.

### The `Ref` reaches the page, or the error is recorded at the link

`parseRef` wraps the line ranges into the `Ref`
`{ repo: "explain", path: "packages/contract/src/citation.ts", ranges: [{ from: 62, to: 72 }] }`
([citation.ts](explain:packages/contract/src/citation.ts:71)). Back in the helper, a success is
added to the page's list of cited `Ref` values
([context.ts](explain:packages/contract/src/parse-page/context.ts:23-24)), and the link becomes a
citation in the page ([inline.ts](explain:packages/contract/src/parse-page/inline.ts:44)). On a
failure, the
helper skips both and records a *diagnostic*, an error message with the link's line and column
([context.ts](explain:packages/contract/src/parse-page/context.ts:22)), which the command that
checks a doc root's pages, `explain validate`, reports.

## Other citations leave the trace at the line range step

Each variant below takes the same path as the traced case until step four.

| Target | Where it diverges | Result |
|---|---|---|
| `explain:packages/contract/src/citation.ts` | no third part, so step four is skipped | `ranges: []`, the whole file |
| `explain:packages/contract/src/citation.ts:3,62-72` | step four reads two line ranges | two line ranges, in order |
| `explain:packages/contract/src/citation.ts:62-72,3` | step four finds `3` starting before `72` | error `line ranges "62-72,3" must be ascending and non-overlapping` |

The last row is an error, not a sorted `Ref`: `parseRanges` enforces the order instead of fixing
it.

## A `mailto:` link looks like a citation but stays a web link

You might expect every `name:rest` link target to be read as a citation, so that
`mailto:team@example.com` would become repo key `mailto` with path `team@example.com`. It splits
into two parts just like a whole-file citation, but it never reaches `parseRef`. The attribute
that matters is whether the scheme is one of `http`, `https`, or `mailto`: the page parser returns
those targets as web links in step one
([inline.ts](explain:packages/contract/src/parse-page/inline.ts:9,42)). For the same reason
`repoKeyProblem` rejects those three names as repo keys
([citation.ts](explain:packages/contract/src/citation.ts:16-20,26)), so no doc root can declare a
key whose citations would be read as web links.

## Writing a `Ref` back gives the one spelling `parseRef` accepts

[`formatRef`](explain:packages/contract/src/citation.ts:77-80) turns a `Ref` back into a citation.
It exists for the times the CLI prints a citation, such as when `explain freshness check` names a
cited file that changed ([check.ts](explain:packages/cli/src/commands/freshness/check.ts:15)).
Parsing never calls it, so it runs only when some code prints a `Ref`. It prints a line range of
one line as `N` and a longer one as `N-M` ([formatRange](explain:packages/contract/src/citation.ts:74-75)),
and it leaves out the third part when `ranges` is empty. For the traced `Ref` it writes
`explain:packages/contract/src/citation.ts:62-72`, the same string the page started with.
