# Resolving a source

A citation names a file as a repo key plus a path, `explain:packages/cli/src/main.ts`. `resolveSource` is the one function that turns that pair into bytes. Page checking, freshness hashing and the source endpoint of the dev server all go through it, and `explain build` writes its source files by calling that same endpoint for every cited or recorded file ([build.ts](explain:packages/cli/src/site/build.ts:61-69)), so every consumer agrees on what a citation points at.

## Two steps: repos, then files

When a doc root loads, `resolveRepos` turns each `explain.json` repo path into its real path:

```ts file=explain:packages/cli/src/doc-root/resolve-source.ts:18-37
```

A repo whose path does not exist or is not a directory becomes one doc-root error on `explain.json` and is left out of the map; the key stays in the config. Keeping the *real* path matters for the containment check below: on macOS `/tmp` is a symlink to `/private/tmp`, and comparing a resolved file against an unresolved root would wrongly reject every file.

`makeResolveSource` then returns the resolver. It caches by repo and path for the lifetime of one loaded doc root, so a file cited by many pages is read once:

```ts file=explain:packages/cli/src/doc-root/resolve-source.ts:46-53
```

The cache key is `sourceKey(repo, path)`, the two strings joined with a NUL ([resolve-source.ts](explain:packages/cli/src/doc-root/resolve-source.ts:10)), a character that cannot appear in a repo key; since the key comes first, the joined key is unambiguous. `explain dev` queues every change under the doc root or a repo and answers it by loading a fresh doc root ([dev.ts](explain:packages/cli/src/site/dev.ts:29-31,70-78)), which is what keeps the cache from going stale.

<AnnotatedSource file="explain:packages/cli/src/doc-root/resolve-source.ts:54-70">
<Note lines="58">The key is not in `explain.json` `repos` at all.</Note>
<Note lines="59-60">The key exists but `resolveRepos` dropped it because its path is not a directory; every file in it counts as missing.</Note>
<Note lines="61-62">`realPath` fails when the path, or a symlink on the way to it, does not exist.</Note>
<Note lines="63-65">The real path must sit inside the real repo root. The trailing separator stops a sibling such as `/work/repo-old` from passing as `/work/repo`.</Note>
<Note lines="66-67">A directory, socket or device is not something a page can cite.</Note>
<Note lines="68-69">Only now are the bytes read, and the line count is taken from them.</Note>
</AnnotatedSource>

The result type is a union on `status`:

```ts file=explain:packages/cli/src/doc-root/types.ts:39-44
```

`lines` counts newline bytes, plus one when the file does not end with a newline ([countLines](explain:packages/cli/src/doc-root/resolve-source.ts:12-16)), so `a\nb\n` and `a\nb` both have two lines and an empty file has none. Citation ranges are checked against that number.

## Why `escapes` exists

A citation path cannot climb out of the repo by spelling: `parseRef` already rejects absolute paths and `.` or `..` segments before a path ever reaches the resolver:

```ts file=explain:packages/contract/src/citation.ts:30-41
```

But a path made only of plain segments can still leave the repo through a symlink. `src/outside.ts` may be a link to `../../secret.ts`, and `realPath` follows it. The prefix check on the real path catches exactly that case; the CLI test builds such a link and expects `resolves outside the repo` ([explain.test.ts](explain:packages/cli/test/explain.test.ts:166-177)).

The reason this matters is the dev server. The viewer fetches cited files from `/@explain/api/source/<repo>/<path>`, and that endpoint resolves whatever path the request names, not only paths a page cites:

```ts file=explain:packages/cli/src/site/api.ts:56-93
```

Without `escapes`, a repo that contains a symlink to, say, a home directory would let anything that can reach the dev server read files outside every configured repo (inference: the code states no threat model). With it, the endpoint answers 403. Symlinks that stay inside the repo resolve normally; only the final real path is compared.

## From status to diagnostic

`refProblem` turns a status into the message a page shows:

```ts file=explain:packages/cli/src/doc-root/resolve-source.ts:74-92
```

A `file` is a problem only when one of the citation's ranges ends past the last line. Which of these messages block which command is decided by the page checker: `unknown-repo` and `escapes` are page errors, the others are `refProblems` that freshness treats as a change in the code. See [Loading a doc root](./load-doc-root.md) for that split, and [Freshness](./freshness.md) for how the bytes are hashed.
