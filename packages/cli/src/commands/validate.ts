import * as Console from "effect/Console";
import * as Argument from "effect/cli/Argument";
import * as Command from "effect/cli/Command";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { docDirDiagnostics, loadDocDir } from "../doc-dir/load.ts";
import { diagnosticPrinter, exitWithError } from "./doc-dir.ts";
import { ExitWith } from "./exit-with.ts";

export const validate = Command.make(
  "validate",
  { dir: Argument.String("dir") },
  Effect.fnUntraced(function* ({ dir }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.resolve(dir);
    const info = yield* fs.stat(root).pipe(Effect.option);
    if (info._tag === "None" || info.value.type !== "Directory") {
      return yield* exitWithError(`${dir}: not a directory`);
    }
    const docDir = yield* loadDocDir(root);
    const diagnostics = docDirDiagnostics(docDir);
    yield* (yield* diagnosticPrinter(root))(diagnostics);
    if (diagnostics.length > 0) return yield* new ExitWith({ code: 2 });
    yield* Console.log(`${docDir.pages.length} pages valid`);
  }),
).pipe(Command.withDescription("Report what keeps the doc dir's pages from rendering"));
