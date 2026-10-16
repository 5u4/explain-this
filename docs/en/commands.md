# Commands

`explain` is a single [Effect CLI](https://effect.website) program. Each subcommand is a small handler that opens the doc root, picks the pages it cares about, prints diagnostics, and turns failure into an exit code. Almost all real work happens in `loadDocRoot` (see [Loading a doc root](./load-doc-root.md)); the commands decide only *what to report* and *what to refuse*.

## Wiring

The entry point builds one root command and hangs the five subcommands off it:

```ts file=explain:packages/cli/src/main.ts:11-16
```

`Command.run({ version })` parses the command line against that tree and runs the chosen handler; `BunServices.layer` provides the platform services the handlers ask for, which for the doc-root code are [`FileSystem`, `Path` and `Crypto`](explain:packages/cli/src/doc-root/types.ts:57); `BunRuntime.runMain` runs the program as the process and decides its exit code. `freshness` is a command with no handler of its own, only the two subcommands [`check` and `sync`](explain:packages/cli/src/commands/freshness.ts:5-8).

<Tree open="2">

- packages/cli/src/
  - [main.ts](explain:packages/cli/src/main.ts) root command and runtime
  - commands/
    - [init.ts](explain:packages/cli/src/commands/init.ts) `explain init --locales=a,b`
    - [validate.ts](explain:packages/cli/src/commands/validate.ts) `explain validate [page.md...]`
    - [freshness.ts](explain:packages/cli/src/commands/freshness.ts) groups `check` and `sync`
    - freshness/
      - [check.ts](explain:packages/cli/src/commands/freshness/check.ts) `explain freshness check`
      - [sync.ts](explain:packages/cli/src/commands/freshness/sync.ts) `explain freshness sync page.md...`
    - [dev.ts](explain:packages/cli/src/commands/dev.ts) `explain dev [--port]`
    - [build.ts](explain:packages/cli/src/commands/build.ts) `explain build [--out]`
    - [open-doc-root.ts](explain:packages/cli/src/commands/open-doc-root.ts) shared setup for every command except `init`
    - [exit-with.ts](explain:packages/cli/src/commands/exit-with.ts) the exit-code error

</Tree>

Each command is declared the same way: `Command.make(name, config, handler)`, where `config` lists flags (`Flag.String`, `Flag.Int`) and positional arguments (`Argument.String`), and the handler is an `Effect.fnUntraced` generator that receives the parsed values. `validate` takes any number of pages with [`Argument.variadic()`](explain:packages/cli/src/commands/validate.ts:10), while `sync` demands at least one with [`Argument.atLeast(1)`](explain:packages/cli/src/commands/freshness/sync.ts:11); `build`'s `--out` is [optional](explain:packages/cli/src/commands/build.ts:12) and `dev`'s `--port` [defaults to 4321](explain:packages/cli/src/commands/dev.ts:11).

## What each command does

| Command | Reads | Refuses when | Writes |
|---|---|---|---|
| `init --locales=zh,en` | nothing | `explain.json` already exists, or the locales fail the config schema | `explain.json` in the current directory |
| `validate [page.md...]` | the doc root | any doc-root error or any diagnostic on the selected pages (all pages when none are named) | nothing |
| `freshness check` | the doc root | exits 2 when no doc root is found or `explain.json` is invalid; exits 1 when a page is stale or could not be checked | nothing |
| `freshness sync page.md...` | the doc root | a named page has any diagnostic; other named pages still sync | `<locale>/<id>.sources.json` per page |
| `dev [--port=4321]` | the doc root | the server cannot start | nothing; serves and reloads |
| `build [--out=dir]` | the doc root | any doc-root error or any page diagnostic | a static site, `dist/` under the doc root by default |

`init` is the only command that does not need an existing doc root. It writes `{ locales, repos: {}, nav: [] }`, but first runs the text through the same `decodeConfig` that loading uses, so a malformed locale is rejected before anything touches the disk:

```ts file=explain:packages/cli/src/commands/init.ts:17-25
```

`dev` and `build` differ on purpose. `dev` only needs `openDocRoot` to succeed, so it serves a doc root whose pages still have errors (the viewer shows them); `build` [refuses to build](explain:packages/cli/src/commands/build.ts:16-21) unless every page is clean. See [the site](./site.md) for what they serve.

## Opening the doc root

Every command but `init` starts with `openDocRoot`:

```ts file=explain:packages/cli/src/commands/open-doc-root.ts:19-43
```

`findDocRoot` walks up from the current directory until it finds an `explain.json` ([config.ts](explain:packages/cli/src/doc-root/config.ts:25-35)), so the commands work from any subdirectory of the doc root. The two failures that leave no doc root to work with, no `explain.json` anywhere above and an `explain.json` that fails the schema, are caught here, printed, and turned into exit code 2. Everything else is data on the returned `DocRoot`, and `display` prints every diagnostic path relative to where you ran the command.

### Page arguments

`validate` and `sync` take page paths, resolved by `pagesFromArguments`:

```ts file=explain:packages/cli/src/commands/open-doc-root.ts:45-62
```

An argument is resolved against the current directory, made relative to the doc root, and compared with each page's `file`, which is always `<locale>/<id>.md`. So `explain validate zh/commands.md` from the doc root and `explain validate commands.md` from inside `zh/` name the same page. Only pages listed in `nav` exist in the `DocRoot`; a Markdown file that is not in `nav` is reported as "not a page of the doc root". An unknown argument does not stop the others from being processed, but it makes the command exit 2 at the end.

### Which diagnostics count

A parsed page carries two lists, `errors` and `refProblems` ([why two](./load-doc-root.md)). The commands combine them differently:

```ts file=explain:packages/cli/src/commands/open-doc-root.ts:64-65
```

`validate`, `sync` and `build` use `pageDiagnostics`, so a citation to a deleted file or past the end of a file blocks them. `freshness check` looks only at `page.errors` ([check.ts](explain:packages/cli/src/commands/freshness/check.ts:33-38)), so the same deleted file shows up there as a stale page rather than as "not checked". That is how a refresh workflow can list exactly which pages a code change broke.

<Tabs>
<Tab label="validate">

```ts file=explain:packages/cli/src/commands/validate.ts:11-21
```

</Tab>
<Tab label="freshness sync">

```ts file=explain:packages/cli/src/commands/freshness/sync.ts:12-28
```

</Tab>
<Tab label="freshness check">

```ts file=explain:packages/cli/src/commands/freshness/check.ts:28-53
```

</Tab>
</Tabs>

## Exit codes

Handlers never call `process.exit`. They fail with one tagged error:

<AnnotatedSource file="explain:packages/cli/src/commands/exit-with.ts:1-9">
<Note lines="4">The type allows only 1 or 2; 0 is simply a handler that succeeds.</Note>
<Note lines="5-7">`runMain` reads this property to pick the process exit code instead of its default of 1.</Note>
<Note lines="8">The handler has already printed what went wrong, so this tells the runtime not to log the error again.</Note>
</AnnotatedSource>

| Code | Meaning | Raised by |
|---|---|---|
| 0 | success | every command |
| 1 | the doc root is valid but not fresh: a page is stale or not checked | `freshness check` |
| 2 | refused: no doc root, invalid `explain.json`, page diagnostics, an unknown page argument, an existing `explain.json` for `init`, or a server/build failure | every other refusal |

> [!NOTE]
> Usage errors that Effect CLI itself rejects, such as `explain freshness sync` with no page or an unknown subcommand, print the help text and exit 1 (observed by running the CLI; that behavior lives in Effect, not in this repo). So exit 1 alone does not tell a script "stale" apart from "bad invocation".
