import * as Console from "effect/Console";
import * as Command from "effect/cli/Command";
import * as Flag from "effect/cli/Flag";
import * as Effect from "effect/Effect";
import { serveDocRoot } from "../site/dev.ts";
import { ExitWith } from "./exit-with.ts";
import { openDocRoot } from "./open-doc-root.ts";

export const dev = Command.make(
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
