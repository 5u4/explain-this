import * as Console from "effect/Console";
import * as Command from "effect/cli/Command";
import * as Flag from "effect/cli/Flag";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { configFileName, decodeConfig } from "../doc-root/config.ts";
import { ExitWith } from "./exit-with.ts";
import { reportInvalidConfig } from "./open-doc-root.ts";

export const init = Command.make(
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
