import * as Console from "effect/Console";
import * as Argument from "effect/cli/Argument";
import * as Command from "effect/cli/Command";
import * as Flag from "effect/cli/Flag";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { docDirDiagnostics, loadDocDir, pageIdError } from "../doc-dir/load.ts";
import { serveDocDir } from "../site/serve.ts";
import { diagnosticPrinter, exitWithError } from "./doc-dir.ts";
import { ExitWith } from "./exit-with.ts";

export const open = Command.make(
  "open",
  { target: Argument.String("dir|page.md"), port: Flag.Int("port").pipe(Flag.optional) },
  Effect.fnUntraced(function* ({ target, port }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolved = path.resolve(target);
    const info = yield* fs.stat(resolved).pipe(Effect.option);
    if (info._tag === "None") {
      return yield* exitWithError(
        target.endsWith(".md") ? `${target} does not exist` : `${target}: not a directory`,
      );
    }

    let root = resolved;
    let page: string | undefined;
    if (info.value.type !== "Directory") {
      const file = path.basename(resolved);
      if (!file.endsWith(".md")) return yield* exitWithError(`${target} is not a page`);
      root = path.dirname(resolved);
      const error = pageIdError(file);
      if (error !== undefined) {
        yield* (yield* diagnosticPrinter(root))([error]);
        return yield* new ExitWith({ code: 2 });
      }
      page = file.slice(0, -".md".length);
    }

    const docDir = yield* loadDocDir(root);
    const printDiagnostics = yield* diagnosticPrinter(root);
    yield* printDiagnostics(docDirDiagnostics(docDir));
    const entry = page ?? docDir.pages[0]?.id;
    if (entry === undefined) return yield* new ExitWith({ code: 2 });

    const listen =
      port._tag === "Some"
        ? { port: port.value, strictPort: true, open: `/${entry}` }
        : { port: 4321, strictPort: false, open: `/${entry}` };
    const url = yield* serveDocDir(docDir, listen, printDiagnostics).pipe(
      Effect.catchTag("DevServerFailed", (error) =>
        exitWithError(`explain open: ${error.message}`),
      ),
    );
    yield* Console.log(`explain open: ${url}${entry}`);
    return yield* Effect.never;
  }, Effect.scoped),
).pipe(
  Command.withDescription("Serve a doc dir in the browser, open a page, and reload on change"),
);
