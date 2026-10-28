import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import type { Diagnostic } from "../doc-dir/types.ts";
import { ExitWith } from "./exit-with.ts";

export const exitWithError = (message: string) =>
  Console.error(message).pipe(Effect.andThen(Effect.fail(new ExitWith({ code: 2 }))));

export const diagnosticPrinter = Effect.fnUntraced(function* (root: string) {
  const path = yield* Path.Path;
  const cwd = path.resolve();
  const shownPath = (file: string) => {
    const relative = path.relative(cwd, file);
    const outside =
      relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
    return outside ? file : relative || ".";
  };
  return (diagnostics: ReadonlyArray<Diagnostic>) =>
    Effect.forEach(
      diagnostics,
      (diagnostic) =>
        Console.error(
          `${shownPath(path.join(root, diagnostic.file))}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`,
        ),
      { discard: true },
    );
});
