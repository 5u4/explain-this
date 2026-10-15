import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { Plugin } from "vite";

const viewerRuntimeForbidden =
  /^(?:effect(?:\/.*)?|@effect\/.*|bun(?::.*)?|node:.*|@explain\/contract\/.*)$/;

export const viewerRoot = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* fs.realPath(
    path.dirname(
      yield* path.fromFileUrl(new URL(import.meta.resolve("@explain/viewer/package.json"))),
    ),
  );
});

export const viewerImportGuard = (root: string, sep: string): Plugin => ({
  name: "explain-viewer-imports",
  enforce: "pre",
  resolveId(source, importer) {
    if (
      importer?.startsWith(`${root}${sep}`) &&
      !importer.includes(`${sep}node_modules${sep}`) &&
      viewerRuntimeForbidden.test(source)
    ) {
      this.error(
        `${importer} imports ${source} at runtime; the viewer may import it only with \`import type\``,
      );
    }
    return null;
  },
});
