#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { formatRef } from "@explain/contract/citation";
import * as Console from "effect/Console";
import * as Argument from "effect/cli/Argument";
import * as Command from "effect/cli/Command";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Runtime from "effect/Runtime";
import {
  type Diagnostic,
  type DocRoot,
  findDocRoot,
  loadDocRoot,
  type StaleReason,
  writeSources,
} from "./doc-root.ts";

class ExitWith extends Data.TaggedError("ExitWith")<{ readonly code: 1 | 2 }> {
  override get [Runtime.errorExitCode](): number {
    return this.code;
  }
  override readonly [Runtime.errorReported] = false;
}

const describeReason = (reason: StaleReason, pageFile: string): string => {
  if (reason.kind === "sources-missing") return `no sources file; run explain hash ${pageFile}`;
  const source = formatRef({ repo: reason.repo, path: reason.path, ranges: [] });
  switch (reason.kind) {
    case "not-recorded":
      return `${source} is cited but not hashed`;
    case "not-cited":
      return `${source} is hashed but no longer cited`;
    case "missing":
      return `${source} no longer exists`;
    case "changed":
      return `${source} changed`;
  }
};

const openDocRoot = Effect.gen(function* () {
  const path = yield* Path.Path;
  const cwd = path.resolve();
  const root = yield* findDocRoot(cwd);
  const docRoot = yield* loadDocRoot(root);
  const display = (file: string) => path.relative(cwd, path.join(root, file)) || ".";
  const printDiagnostics = (diagnostics: ReadonlyArray<Diagnostic>) =>
    Effect.forEach(
      diagnostics,
      (diagnostic) =>
        Console.error(
          `${display(diagnostic.file)}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`,
        ),
      { discard: true },
    );
  return { cwd, docRoot, display, printDiagnostics };
}).pipe(
  Effect.catchTags({
    DocRootNotFound: (error) =>
      Console.error(`no explain.json in ${error.from} or any parent directory`).pipe(
        Effect.andThen(Effect.fail(new ExitWith({ code: 2 }))),
      ),
    InvalidConfig: (error) =>
      Effect.forEach(
        error.diagnostics,
        (diagnostic) =>
          Console.error(
            `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`,
          ),
        { discard: true },
      ).pipe(Effect.andThen(Effect.fail(new ExitWith({ code: 2 })))),
  }),
);

const pageByFile = (docRoot: DocRoot, file: string) =>
  docRoot.pages.find((page) => page.file === file);

const hash = Command.make(
  "hash",
  { pages: Argument.String("page.md").pipe(Argument.atLeast(1)) },
  Effect.fnUntraced(function* ({ pages }) {
    const path = yield* Path.Path;
    const { cwd, docRoot, display, printDiagnostics } = yield* openDocRoot;
    let refused = false;
    for (const argument of pages) {
      const file = path
        .relative(docRoot.root, path.resolve(cwd, argument))
        .split(path.sep)
        .join("/");
      const page = pageByFile(docRoot, file);
      if (page === undefined) {
        yield* Console.error(`${argument} is not a page of the doc root at ${docRoot.root}`);
        refused = true;
        continue;
      }
      const blocking = [...page.errors, ...page.refProblems];
      if (page.page === undefined || blocking.length > 0) {
        yield* printDiagnostics(blocking);
        yield* Console.error(`refused to hash ${display(page.file)}: fix the errors above`);
        refused = true;
        continue;
      }
      yield* writeSources(docRoot.root, page);
      yield* Console.log(`hashed ${display(page.file)} (${page.sources.length} files)`);
    }
    if (refused) return yield* new ExitWith({ code: 2 });
  }),
).pipe(Command.withDescription("Record the hashes of the files each page cites"));

const check = Command.make(
  "check",
  {},
  Effect.fnUntraced(function* () {
    const { docRoot, display, printDiagnostics } = yield* openDocRoot;
    yield* printDiagnostics(docRoot.errors);
    let stale = 0;
    let invalid = docRoot.errors.length > 0 ? 1 : 0;
    for (const page of docRoot.pages) {
      yield* printDiagnostics(page.errors);
      if (page.errors.length > 0) invalid++;
      if (page.freshness?.status !== "stale") continue;
      stale++;
      yield* Console.log(`stale ${display(page.file)}`);
      for (const reason of page.freshness.reasons) {
        yield* Console.log(`  ${describeReason(reason, display(page.file))}`);
      }
    }
    const fresh = docRoot.pages.filter((page) => page.freshness?.status === "fresh").length;
    yield* Console.log(
      `${docRoot.pages.length} pages: ${fresh} fresh, ${stale} stale, ${invalid === 0 ? "no" : "with"} validation errors`,
    );
    if (invalid > 0) return yield* new ExitWith({ code: 2 });
    if (stale > 0) return yield* new ExitWith({ code: 1 });
  }),
).pipe(Command.withDescription("Validate every page and report stale pages"));

Command.make("explain").pipe(
  Command.withSubcommands([hash, check]),
  Command.run({ version: "0.1.0" }),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
