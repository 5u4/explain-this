import * as Console from "effect/Console";
import * as Argument from "effect/cli/Argument";
import * as Command from "effect/cli/Command";
import * as Effect from "effect/Effect";
import { writeSources } from "../../doc-root/freshness.ts";
import { diagnosticsThat } from "../../doc-root/page-diagnostic.ts";
import { ExitWith } from "../exit-with.ts";
import { openDocRoot, pagesFromArguments } from "../open-doc-root.ts";

export const sync = Command.make(
  "sync",
  { pages: Argument.String("page.md").pipe(Argument.atLeast(1)) },
  Effect.fnUntraced(function* ({ pages }) {
    const { cwd, docRoot, display, printDiagnostics } = yield* openDocRoot;
    const { found, unknown } = yield* pagesFromArguments(cwd, docRoot, pages);
    let refused = unknown;
    for (const page of found) {
      const blocking = diagnosticsThat("refusesSync", page.diagnostics);
      if (page.status !== "parsed" || blocking.length > 0) {
        yield* printDiagnostics(blocking);
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
