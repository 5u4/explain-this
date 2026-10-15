#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { formatRef } from "@explain/contract/citation";
import type { StaleReason } from "@explain/contract/sources";
import * as Console from "effect/Console";
import * as Argument from "effect/cli/Argument";
import * as Command from "effect/cli/Command";
import * as Flag from "effect/cli/Flag";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Runtime from "effect/Runtime";
import { buildSite } from "./build.ts";
import { serveDocRoot } from "./dev.ts";
import {
  type Diagnostic,
  type DocRoot,
  findDocRoot,
  loadDocRoot,
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
      if (page.status !== "parsed" || page.errors.length > 0 || page.refProblems.length > 0) {
        yield* printDiagnostics(
          page.status === "parsed" ? [...page.errors, ...page.refProblems] : page.errors,
        );
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
      if (page.status !== "parsed" || page.freshness.status !== "stale") continue;
      stale++;
      yield* Console.log(`stale ${display(page.file)}`);
      for (const reason of page.freshness.reasons) {
        yield* Console.log(`  ${describeReason(reason, display(page.file))}`);
      }
    }
    const fresh = docRoot.pages.filter(
      (page) => page.status === "parsed" && page.freshness.status === "fresh",
    ).length;
    yield* Console.log(
      `${docRoot.pages.length} pages: ${fresh} fresh, ${stale} stale, ${invalid === 0 ? "no" : "with"} validation errors`,
    );
    if (invalid > 0) return yield* new ExitWith({ code: 2 });
    if (stale > 0) return yield* new ExitWith({ code: 1 });
  }),
).pipe(Command.withDescription("Validate every page and report stale pages"));

const dev = Command.make(
  "dev",
  { port: Flag.Int("port").pipe(Flag.withDefault(4321)) },
  Effect.fnUntraced(function* ({ port }) {
    const { docRoot } = yield* openDocRoot;
    const url = yield* serveDocRoot(docRoot, port).pipe(
      Effect.catchTag("DevServerFailed", (error) =>
        Console.error(`explain dev: ${error.message}`).pipe(
          Effect.andThen(Effect.fail(new ExitWith({ code: 2 }))),
        ),
      ),
    );
    yield* Console.log(`explain dev: ${url}`);
    return yield* Effect.never;
  }, Effect.scoped),
).pipe(Command.withDescription("Serve the doc root in the browser and reload on change"));

const build = Command.make(
  "build",
  { out: Flag.String("out").pipe(Flag.optional) },
  Effect.fnUntraced(function* ({ out }) {
    const path = yield* Path.Path;
    const { cwd, docRoot, printDiagnostics } = yield* openDocRoot;
    const diagnostics = [...docRoot.errors, ...docRoot.pages.flatMap((page) => page.errors)];
    if (diagnostics.length > 0) {
      yield* printDiagnostics(diagnostics);
      yield* Console.error("refused to build: fix the errors above");
      return yield* new ExitWith({ code: 2 });
    }
    const directory =
      out._tag === "Some" ? path.resolve(cwd, out.value) : path.join(docRoot.root, "dist");
    const counts = yield* buildSite(docRoot, directory).pipe(
      Effect.catchTag("BuildFailed", (error) =>
        Console.error(`explain build: ${error.message}`).pipe(
          Effect.andThen(Effect.fail(new ExitWith({ code: 2 }))),
        ),
      ),
    );
    yield* Console.log(
      `explain build: ${directory} (${counts.pages} pages, ${counts.sources} sources, ${counts.widgets} widgets)`,
    );
  }),
).pipe(Command.withDescription("Write the doc root as a static site"));

const format = Command.make(
  "format",
  {},
  Effect.fnUntraced(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = yield* path.fromFileUrl(new URL("../../../docs/format.md", import.meta.url));
    yield* Console.log((yield* fs.readFileString(file)).trimEnd());
  }),
).pipe(Command.withDescription("Print the doc root format contract"));

const get = Command.make("get").pipe(
  Command.withSubcommands([format]),
  Command.withDescription("Print reference material for writing a doc root"),
);

Command.make("explain").pipe(
  Command.withSubcommands([hash, check, dev, build, get]),
  Command.run({ version: "0.1.0" }),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
