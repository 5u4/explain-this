import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { Diagnostic } from "./types.ts";
import { buildWidgetStyles, type WidgetModule } from "./widget-styles.ts";

export const loadWidgets = Effect.fnUntraced(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const errors: Array<Diagnostic> = [];
  const widgetsDirectory = path.join(root, "widgets");
  const files = (yield* fs.exists(widgetsDirectory))
    ? new Set(yield* fs.readDirectory(widgetsDirectory))
    : new Set<string>();
  const modules: Array<WidgetModule> = [];
  for (const file of [...files].sort()) {
    if (file.endsWith(".css")) {
      errors.push({
        file: `widgets/${file}`,
        line: 1,
        column: 1,
        message: "widget stylesheets are not supported; style the widget with Tailwind classes",
      });
    } else if (file.endsWith(".js")) {
      modules.push({
        name: file.slice(0, -".js".length),
        text: yield* fs.readFileString(path.join(widgetsDirectory, file)),
      });
    }
  }
  const styles = yield* buildWidgetStyles(modules);
  errors.push(...styles.diagnostics);
  return { files, modules, css: styles.css, errors };
});
