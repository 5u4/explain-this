import type { Position } from "@explain/contract/page";
import type { ParseResult } from "@explain/contract/parse-page";
import { compareSourceKeys, type SourceFile, SourcesFileFromJson } from "@explain/contract/sources";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { compareSources, type makeBlobId } from "./freshness.ts";
import { refProblem, sourceKey } from "./resolve-source.ts";
import type { Diagnostic, DocPage, DocRoot } from "./types.ts";

export interface PageContext {
  readonly root: string;
  readonly pageIds: ReadonlySet<string>;
  readonly existing: ReadonlySet<string>;
  readonly widgetFiles: ReadonlySet<string>;
  readonly resolve: DocRoot["resolveSource"];
  readonly blobId: Effect.Success<typeof makeBlobId>;
}

export const checkPage = Effect.fnUntraced(function* (
  { root, pageIds, existing, widgetFiles, resolve, blobId }: PageContext,
  locale: string,
  id: string,
  parsed: ParseResult | undefined,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = `${locale}/${id}.md`;
  const sourcesFile = `${locale}/${id}.sources.json`;
  const errors: Array<Diagnostic> = [];
  const at = (position: Position, message: string) =>
    errors.push({ file, line: position.line, column: position.column, message });
  if (parsed === undefined) {
    at({ line: 1, column: 1 }, `${file} is missing; nav lists page "${id}"`);
    return { locale, id, file, sourcesFile, status: "missing", errors } satisfies DocPage;
  }

  for (const error of parsed.errors) at(error, error.message);
  const page = parsed.page;
  if (page === undefined) {
    return { locale, id, file, sourcesFile, status: "invalid", errors } satisfies DocPage;
  }

  const cited = new Map<string, { repo: string; path: string }>();
  const refProblems: Array<Diagnostic> = [];
  for (const { ref, at: position } of page.refs) {
    cited.set(sourceKey(ref.repo, ref.path), { repo: ref.repo, path: ref.path });
    const resolved = yield* resolve(ref.repo, ref.path);
    const problem = refProblem(ref, resolved);
    if (problem === undefined) continue;
    if (resolved.status === "unknown-repo" || resolved.status === "escapes") at(position, problem);
    else refProblems.push({ file, line: position.line, column: position.column, message: problem });
  }
  for (const link of page.pageLinks) {
    if (!pageIds.has(link.page) || !existing.has(`${locale}/${link.page}`)) {
      at(link.at, `page link to "${link.page}" has no ${locale}/${link.page}.md`);
    }
  }
  for (const widget of page.widgets) {
    if (!widgetFiles.has(`${widget.name}.js`)) {
      at(widget.at, `widget "${widget.name}" has no widgets/${widget.name}.js`);
    }
  }

  const sources: Array<SourceFile> = [];
  for (const source of [...cited.values()].sort(compareSourceKeys)) {
    const resolved = yield* resolve(source.repo, source.path);
    if (resolved.status !== "file") continue;
    const hash = yield* blobId(sourceKey(source.repo, source.path), resolved.bytes);
    sources.push({ ...source, hash });
  }

  const recordedText = yield* fs.readFileString(path.join(root, sourcesFile)).pipe(Effect.option);
  let recorded: ReadonlyArray<SourceFile> | undefined;
  if (recordedText._tag === "Some") {
    const decoded = yield* Schema.decodeUnknownEffect(SourcesFileFromJson)(recordedText.value).pipe(
      Effect.option,
    );
    if (decoded._tag === "Some") recorded = decoded.value.files;
    else {
      errors.push({
        file: sourcesFile,
        line: 1,
        column: 1,
        message: `${sourcesFile} is malformed; rerun explain freshness sync ${file}`,
      });
    }
  }

  const freshness = yield* compareSources(cited, recorded, sources, resolve);
  errors.sort(
    (a, b) =>
      (a.file === b.file ? 0 : a.file < b.file ? -1 : 1) || a.line - b.line || a.column - b.column,
  );
  return {
    locale,
    id,
    file,
    sourcesFile,
    status: "parsed",
    page,
    errors,
    refProblems,
    sources,
    recorded,
    freshness,
  } satisfies DocPage;
});
