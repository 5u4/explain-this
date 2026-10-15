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
  configFileName,
  type Diagnostic,
  type DocPage,
  type DocRoot,
  decodeConfig,
  findDocRoot,
  type InvalidConfig,
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
  if (reason.kind === "sources-missing")
    return `no sources file; run explain freshness sync ${pageFile}`;
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

const reportInvalidConfig = (error: InvalidConfig) =>
  Effect.forEach(
    error.diagnostics,
    (diagnostic) =>
      Console.error(
        `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`,
      ),
    { discard: true },
  ).pipe(Effect.andThen(Effect.fail(new ExitWith({ code: 2 }))));

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
    InvalidConfig: reportInvalidConfig,
  }),
);

const pagesFromArguments = Effect.fnUntraced(function* (
  cwd: string,
  docRoot: DocRoot,
  pages: ReadonlyArray<string>,
) {
  const path = yield* Path.Path;
  const found: Array<DocPage> = [];
  let unknown = false;
  for (const argument of pages) {
    const file = path.relative(docRoot.root, path.resolve(cwd, argument)).split(path.sep).join("/");
    const page = docRoot.pages.find((candidate) => candidate.file === file);
    if (page === undefined) {
      yield* Console.error(`${argument} is not a page of the doc root at ${docRoot.root}`);
      unknown = true;
    } else found.push(page);
  }
  return { found, unknown };
});

const pageDiagnostics = (page: DocPage) =>
  page.status === "parsed" ? [...page.errors, ...page.refProblems] : page.errors;

const init = Command.make(
  "init",
  { locales: Flag.String("locales") },
  Effect.fnUntraced(function* ({ locales }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.resolve(configFileName);
    if (yield* fs.exists(file)) {
      yield* Console.error(`${file} already exists`);
      return yield* new ExitWith({ code: 2 });
    }
    const text = `${JSON.stringify({ locales: locales.split(","), repos: {}, nav: [] }, null, 2)}\n`;
    yield* decodeConfig(text).pipe(Effect.catchTag("InvalidConfig", reportInvalidConfig));
    yield* fs.writeFileString(file, text);
    yield* Console.log(`explain init: wrote ${file}`);
  }),
).pipe(Command.withDescription("Make the current directory a doc root"));

const validate = Command.make(
  "validate",
  { pages: Argument.String("page.md").pipe(Argument.variadic()) },
  Effect.fnUntraced(function* ({ pages }) {
    const { cwd, docRoot, printDiagnostics } = yield* openDocRoot;
    const { found, unknown } =
      pages.length === 0
        ? { found: docRoot.pages, unknown: false }
        : yield* pagesFromArguments(cwd, docRoot, pages);
    const diagnostics = [...docRoot.errors, ...found.flatMap(pageDiagnostics)];
    yield* printDiagnostics(diagnostics);
    if (diagnostics.length > 0 || unknown) return yield* new ExitWith({ code: 2 });
    yield* Console.log(`${found.length} pages valid`);
  }),
).pipe(Command.withDescription("Report what keeps explain.json, widgets and pages from rendering"));

const freshnessCheck = Command.make(
  "check",
  {},
  Effect.fnUntraced(function* () {
    const { docRoot, display } = yield* openDocRoot;
    let fresh = 0;
    let stale = 0;
    let unchecked = 0;
    for (const page of docRoot.pages) {
      if (page.status !== "parsed" || page.errors.length > 0) {
        unchecked++;
        yield* Console.log(`not checked ${display(page.file)}: run explain validate`);
        continue;
      }
      if (page.freshness.status === "fresh") {
        fresh++;
        continue;
      }
      stale++;
      yield* Console.log(`stale ${display(page.file)}`);
      for (const reason of page.freshness.reasons) {
        yield* Console.log(`  ${describeReason(reason, display(page.file))}`);
      }
    }
    yield* Console.log(
      `${docRoot.pages.length} pages: ${fresh} fresh, ${stale} stale, ${unchecked} not checked`,
    );
    if (stale > 0 || unchecked > 0) return yield* new ExitWith({ code: 1 });
  }),
).pipe(Command.withDescription("List stale pages and the cited files that changed"));

const freshnessSync = Command.make(
  "sync",
  { pages: Argument.String("page.md").pipe(Argument.atLeast(1)) },
  Effect.fnUntraced(function* ({ pages }) {
    const { cwd, docRoot, display, printDiagnostics } = yield* openDocRoot;
    const { found, unknown } = yield* pagesFromArguments(cwd, docRoot, pages);
    let refused = unknown;
    for (const page of found) {
      const diagnostics = pageDiagnostics(page);
      if (page.status !== "parsed" || diagnostics.length > 0) {
        yield* printDiagnostics(diagnostics);
        yield* Console.error(`refused to sync ${display(page.file)}: fix the errors above`);
        refused = true;
        continue;
      }
      yield* writeSources(docRoot.root, page);
      yield* Console.log(`synced ${display(page.file)} (${page.sources.length} files)`);
    }
    if (refused) return yield* new ExitWith({ code: 2 });
  }),
).pipe(Command.withDescription("Record the hashes of the files each page cites"));

const freshness = Command.make("freshness").pipe(
  Command.withDescription("Compare pages with the files they cite"),
  Command.withSubcommands([freshnessCheck, freshnessSync]),
);

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
    const diagnostics = [...docRoot.errors, ...docRoot.pages.flatMap(pageDiagnostics)];
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

Command.make("explain").pipe(
  Command.withSubcommands([init, validate, freshness, dev, build]),
  Command.run({ version: "0.1.0" }),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
