import * as Console from "effect/Console";
import * as Argument from "effect/cli/Argument";
import * as Command from "effect/cli/Command";
import * as Effect from "effect/Effect";
import { ExitWith } from "./exit-with.ts";
import { openDocRoot, pageDiagnostics, pagesFromArguments } from "./open-doc-root.ts";

export const validate = Command.make(
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
).pipe(Command.withDescription("Report what keeps explain.json and pages from rendering"));
