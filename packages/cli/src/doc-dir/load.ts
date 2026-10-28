import { pageIdPattern } from "@explain/contract/page";
import { parsePage } from "@explain/contract/parse-page";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import { checkPage } from "./check-page.ts";
import { makeResolveSource } from "./resolve-source.ts";
import type { Diagnostic, DocDir, DocDirServices, DocPage } from "./types.ts";

export const pageIdError = (file: string): Diagnostic | undefined => {
  const id = file.slice(0, -".md".length);
  return pageIdPattern.test(id)
    ? undefined
    : {
        file,
        line: 1,
        column: 1,
        message: `page id "${id}" must match ${pageIdPattern.source}; rename the file`,
      };
};

export const docDirDiagnostics = (docDir: DocDir): ReadonlyArray<Diagnostic> => [
  ...docDir.errors,
  ...docDir.pages.flatMap((page) => page.diagnostics),
];

export const loadDocDir = Effect.fnUntraced(function* (
  root: string,
): Effect.fn.Return<DocDir, PlatformError.PlatformError, DocDirServices> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const resolve = yield* makeResolveSource(root);

  const files: Array<string> = [];
  for (const name of yield* fs.readDirectory(root)) {
    if (!name.endsWith(".md")) continue;
    const info = yield* fs.stat(path.join(root, name)).pipe(Effect.option);
    if (info._tag === "Some" && info.value.type === "File") files.push(name);
  }
  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const errors: Array<Diagnostic> = [];
  const ids: Array<string> = [];
  for (const file of files) {
    const error = pageIdError(file);
    if (error === undefined) ids.push(file.slice(0, -".md".length));
    else errors.push(error);
  }
  if (files.length === 0) {
    errors.push({ file: ".", line: 1, column: 1, message: "no pages: add a top-level <id>.md" });
  }

  const existing = new Set(ids);
  const pages: Array<DocPage> = [];
  for (const id of ids) {
    const parsed = parsePage(yield* fs.readFileString(path.join(root, `${id}.md`)), id);
    pages.push(yield* checkPage({ existing, resolve }, id, parsed));
  }
  return { root, pages, errors, resolveSource: resolve };
});
