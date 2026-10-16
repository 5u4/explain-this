import * as Console from "effect/Console";
import * as Command from "effect/cli/Command";
import * as Flag from "effect/cli/Flag";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { buildSite } from "../site/build.ts";
import { ExitWith } from "./exit-with.ts";
import { openDocRoot } from "./open-doc-root.ts";

export const build = Command.make(
  "build",
  { out: Flag.String("out").pipe(Flag.optional) },
  Effect.fnUntraced(function* ({ out }) {
    const path = yield* Path.Path;
    const { cwd, docRoot, printDiagnostics } = yield* openDocRoot;
    const diagnostics = [...docRoot.errors, ...docRoot.pages.flatMap((page) => page.diagnostics)];
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
      `explain build: ${directory} (${counts.pages} pages, ${counts.sources} sources)`,
    );
  }),
).pipe(Command.withDescription("Write the doc root as a static site"));
