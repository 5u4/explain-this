# Citations: `repo:path:ranges`

Every claim on an explain page points at code through a citation string such as
`explain:packages/contract/src/citation.ts:62-72`. One small module in the contract package owns
that string: it defines the [`Ref`](explain:packages/contract/src/citation.ts:3-12) value, parses
text into it with `parseRef`, and writes it back with `formatRef`. The page parser calls `parseRef`
for every link target that has a `scheme:` prefix other than `http`, `https`, or `mailto`; a target
with no scheme that is not a page link is reported before that
([inline.ts](explain:packages/contract/src/parse-page/inline.ts:34-43),
[context.ts](explain:packages/contract/src/parse-page/context.ts:20-25)), and the CLI's shared API
handler, which serves both `explain dev` and `explain build`, calls it to vet the `repo/path` of a
source request ([api.ts](explain:packages/cli/src/site/api.ts:64-65)).

## The shape

```ts file=explain:packages/contract/src/citation.ts:3-12
```

A `Ref` is a repo key, a path inside that repo, and zero or more line ranges. An empty `ranges`
array means the whole file. A single line `N` is stored as `{ from: N, to: N }`, so consumers only
ever deal with spans.

| Part | Rule | Code |
|---|---|---|
| `repo` | lowercase letter, then lowercase letters, digits, `-`; not `http`, `https`, `mailto` | [repoKeyProblem](explain:packages/contract/src/citation.ts:14-28) |
| `path` | non-empty, relative, `/` separators, no empty, `.` or `..` segments | [pathProblem](explain:packages/contract/src/citation.ts:30-41) |
| `ranges` | optional; comma-separated `N` or `N-M`, 1-based, no leading zero, ascending, non-overlapping | [parseRanges](explain:packages/contract/src/citation.ts:43-60) |

## How `parseRef` reads a citation

<AnnotatedSource file="explain:packages/contract/src/citation.ts:62-72">
<Note lines="63-67">The text is split on every `:`. Only two or three parts are accepted, so a path can never contain a colon, and anything without a colon is not a citation.</Note>
<Note lines="68-69">The repo key is checked before the path; the first problem found is the one reported.</Note>
<Note lines="70">No third part means a whole-file citation with an empty `ranges` array.</Note>
<Note lines="71">The ranges are parsed only after repo and path are known to be well formed.</Note>
</AnnotatedSource>

`parseRef` returns an Effect `Result` rather than throwing. The failure is a single human-readable
message, which the page parser turns into a diagnostic at the link's position
([context.ts](explain:packages/contract/src/parse-page/context.ts:15-24)). That is why every
problem function returns `string | undefined`: the message itself is the error value.

### Ranges

```ts file=explain:packages/contract/src/citation.ts:43-60
```

Each comma-separated part must match
[`rangePattern`](explain:packages/contract/src/citation.ts:22), which rejects `0`, leading zeros,
open spans like `1-`, and anything with spaces. A span must not end before it starts, and each range
must start after the previous one ends.

> [!IMPORTANT]
> A parsed `Ref` always has ranges in strictly ascending, non-overlapping order, each with
> `from <= to`, all 1-based. Code downstream relies on reading `ranges[0]` as the first cited line,
> for example the viewer's source link jumps to `#L${first.from}`
> ([ref.ts](explain:packages/viewer/src/ref.ts:40-43)).

Because ordering is enforced rather than normalized, `fold:fold.ts:10,4` is an error, not a
silently sorted citation. Each citation therefore has exactly one spelling, which is what
[`formatRef`](explain:packages/contract/src/citation.ts:74-80) writes back.

## Why `http`, `https` and `mailto` are reserved

A Markdown link target is classified by its prefix. The page parser treats `./x.md` as a page link,
`#x` as an anchor, a target whose scheme is `http`, `https` or `mailto` as a web link, and every
other `scheme:` target as a citation:

```ts file=explain:packages/contract/src/parse-page/inline.ts:7-9,34-44
```

A repo named `http` would make `http:foo` ambiguous, so
[`reservedRepoKeys`](explain:packages/contract/src/citation.ts:16-20) forbids exactly the external
schemes. The same `repoKeyProblem` is reused by the `explain.json` schema to vet the keys of
`repos` ([config.ts](explain:packages/contract/src/config.ts:28-35)), so a doc root cannot declare a
key that its pages could never cite. See [config](./config.md).

## What `parseRef` does not check

`parseRef` is pure syntax. It never touches the disk and does not know which repos exist. Those
checks happen in the CLI once the doc root is loaded:

```ts file=explain:packages/cli/src/doc-root/resolve-source.ts:74-92
```

An unknown repo key, a path that does not exist, a path that escapes the repo through a symlink, and a
range past the last line are all reported there; [resolve-source](./resolve-source.md) covers that
step. The split keeps the contract package free of file system access, so it can be shared with
code that has none (inference: the contract package lists no file system dependency in
[package.json](explain:packages/contract/package.json:13-22)).

## The test cases

Two tests pin what parses: a whole-file citation yields empty `ranges`, and a list of single lines
and spans comes back in order.

```ts file=explain:packages/contract/src/citation.test.ts:6-24
```

The rejection table in the test is the clearest specification of the grammar: each row names the
rule it breaks.

```ts file=explain:packages/contract/src/citation.test.ts:26-48
```

## Writing a citation back

`formatRef` is the inverse of `parseRef`: a single-line range prints as `N`, a span as `N-M`, and a
whole-file ref has no third part.

```ts file=explain:packages/contract/src/citation.ts:74-80
```

The CLI uses it to print stale sources
([check.ts](explain:packages/cli/src/commands/freshness/check.ts:15)).

<details>
<summary>The viewer has its own copy</summary>

The viewer keeps a separate `formatRef` and a looser `parseRef` in
[ref.ts](explain:packages/viewer/src/ref.ts:5-30) and imports only the *types* from the contract
package ([ref.ts](explain:packages/viewer/src/ref.ts:1)). The viewer lists `@explain/contract` as a
dev dependency only ([package.json](explain:packages/viewer/package.json:10-20)), so the browser
bundle does not pull in `effect` (inference). Its `parseRef` returns `undefined` instead of a message
and skips the repo, path and ordering rules: it only reads back strings that the viewer itself wrote
into `data-ref` attributes from refs the CLI already validated
([anchors.ts](explain:packages/viewer/src/pane/anchors.ts:19-21)).

</details>
