import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { findDocRoot } from "../doc-root/config.ts";
import { loadDocRoot } from "../doc-root/load.ts";
import type { Diagnostic, DocPage, DocRoot } from "../doc-root/types.ts";
import { ExitWith } from "./exit-with.ts";

const printDiagnosticsWith =
  (display: (file: string) => string) => (diagnostics: ReadonlyArray<Diagnostic>) =>
    Effect.forEach(
      diagnostics,
      (diagnostic) =>
        Console.error(
          `${display(diagnostic.file)}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`,
        ),
      { discard: true },
    );

export const openDocRoot = Effect.gen(function* () {
  const path = yield* Path.Path;
  const cwd = path.resolve();
  const root = yield* findDocRoot(cwd);
  const display = (file: string) => path.relative(cwd, path.join(root, file)) || ".";
  const docRoot = yield* loadDocRoot(root).pipe(
    Effect.catchTag("InvalidConfig", (error) =>
      printDiagnosticsWith(display)(error.diagnostics).pipe(
        Effect.andThen(Effect.fail(new ExitWith({ code: 2 }))),
      ),
    ),
  );
  return { cwd, docRoot, display, printDiagnostics: printDiagnosticsWith(display) };
}).pipe(
  Effect.catchTag("DocRootNotFound", (error) =>
    Console.error(`no explain.json in ${error.from} or any parent directory`).pipe(
      Effect.andThen(Effect.fail(new ExitWith({ code: 2 }))),
    ),
  ),
);

export const pagesFromArguments = Effect.fnUntraced(function* (
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
