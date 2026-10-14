import { formatRange, type Ref } from "@explain/contract/citation";
import { ExplainConfig, glossaryPageId, navPageIds } from "@explain/contract/config";
import type { Page, Position } from "@explain/contract/page";
import { glossaryTermIds } from "@explain/contract/page";
import { type ParseResult, parsePage } from "@explain/contract/parse-page";
import {
  compareSourceKeys,
  type Freshness,
  formatSourcesFile,
  type SourceFile,
  SourcesFileFromJson,
  type StaleReason,
} from "@explain/contract/sources";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as Stream from "effect/Stream";
import { buildWidgetStyles, type WidgetModule } from "./widget-styles.ts";

export interface Diagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

interface PageAddress {
  readonly locale: string;
  readonly id: string;
  readonly file: string;
  readonly sourcesFile: string;
}

export type ParsedDocPage = PageAddress & {
  readonly status: "parsed";
  readonly page: Page;
  readonly errors: ReadonlyArray<Diagnostic>;
  readonly refProblems: ReadonlyArray<Diagnostic>;
  readonly sources: ReadonlyArray<SourceFile>;
  readonly recorded: ReadonlyArray<SourceFile> | undefined;
  readonly freshness: Freshness;
};

export type DocPage =
  | (PageAddress & { readonly status: "missing"; readonly errors: ReadonlyArray<Diagnostic> })
  | (PageAddress & { readonly status: "invalid"; readonly errors: ReadonlyArray<Diagnostic> })
  | ParsedDocPage;

export type Resolved =
  | { readonly status: "file"; readonly bytes: Uint8Array; readonly lines: number }
  | { readonly status: "unknown-repo" }
  | { readonly status: "missing" }
  | { readonly status: "escapes" }
  | { readonly status: "not-a-file" };

export interface DocRoot {
  readonly root: string;
  readonly config: ExplainConfig;
  readonly pages: ReadonlyArray<DocPage>;
  readonly errors: ReadonlyArray<Diagnostic>;
  readonly widgets: ReadonlyArray<string>;
  readonly widgetCss: string;
  readonly resolveSource: (
    repo: string,
    path: string,
  ) => Effect.Effect<Resolved, PlatformError.PlatformError>;
}

export type DocRootServices =
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
  | ChildProcessSpawner.ChildProcessSpawner;

export class DocRootNotFound extends Schema.TaggedError<DocRootNotFound>()("DocRootNotFound", {
  from: Schema.String,
}) {}

export class InvalidConfig extends Schema.TaggedError<InvalidConfig>()("InvalidConfig", {
  diagnostics: Schema.Array(
    Schema.Struct({
      file: Schema.String,
      line: Schema.Number,
      column: Schema.Number,
      message: Schema.String,
    }),
  ),
}) {}

const configFileName = "explain.json";

const blobHeaderEncoder = new TextEncoder();

const countLines = (bytes: Uint8Array): number => {
  let lines = 0;
  for (const byte of bytes) if (byte === 0x0a) lines++;
  return bytes.length > 0 && bytes[bytes.length - 1] !== 0x0a ? lines + 1 : lines;
};

const sourceKey = (repo: string, path: string): string => `${repo}\u0000${path}`;

export const findDocRoot = Effect.fnUntraced(function* (from: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let directory = path.resolve(from);
  while (true) {
    if (yield* fs.exists(path.join(directory, configFileName))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) return yield* new DocRootNotFound({ from });
    directory = parent;
  }
});

const loadConfig = Effect.fnUntraced(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* fs.readFileString(path.join(root, configFileName));
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ExplainConfig))(text, {
    errors: "all",
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError(
      (error) =>
        new InvalidConfig({
          diagnostics: SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues.map(
            (issue) => ({
              file: configFileName,
              line: 1,
              column: 1,
              message:
                issue.path === undefined || issue.path.length === 0
                  ? issue.message
                  : `${issue.path.map((segment) => (typeof segment === "object" ? segment.key : String(segment))).join(".")}: ${issue.message}`,
            }),
          ),
        }),
    ),
  );
});

export const loadDocRoot = Effect.fnUntraced(function* (
  root: string,
): Effect.fn.Return<DocRoot, InvalidConfig | PlatformError.PlatformError, DocRootServices> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const config = yield* loadConfig(root);
  const rootErrors: Array<Diagnostic> = [];

  const repoRoots = new Map<string, string>();
  for (const [repo, repoPath] of Object.entries(config.repos)) {
    const real = yield* fs.realPath(repoPath).pipe(Effect.orElseSucceed(() => undefined));
    const info = real === undefined ? undefined : yield* fs.stat(real).pipe(Effect.option);
    if (real !== undefined && info?._tag === "Some" && info.value.type === "Directory") {
      repoRoots.set(repo, real);
      continue;
    }
    rootErrors.push({
      file: configFileName,
      line: 1,
      column: 1,
      message: `repos.${repo}: ${repoPath} is not a directory`,
    });
  }

  const resolvedCache = new Map<string, Resolved>();
  const resolve = Effect.fnUntraced(function* (repo: string, sourcePath: string) {
    const key = sourceKey(repo, sourcePath);
    const cached = resolvedCache.get(key);
    if (cached !== undefined) return cached;
    const resolved = yield* resolveUncached(repo, sourcePath);
    resolvedCache.set(key, resolved);
    return resolved;
  });
  const resolveUncached = Effect.fnUntraced(function* (
    repo: string,
    sourcePath: string,
  ): Effect.fn.Return<Resolved, PlatformError.PlatformError> {
    if (!Object.hasOwn(config.repos, repo)) return { status: "unknown-repo" } satisfies Resolved;
    const repoRoot = repoRoots.get(repo);
    if (repoRoot === undefined) return { status: "missing" } satisfies Resolved;
    const real = yield* fs.realPath(path.join(repoRoot, sourcePath)).pipe(Effect.option);
    if (real._tag === "None") return { status: "missing" } satisfies Resolved;
    if (!real.value.startsWith(`${repoRoot}${path.sep}`)) {
      return { status: "escapes" } satisfies Resolved;
    }
    const info = yield* fs.stat(real.value);
    if (info.type !== "File") return { status: "not-a-file" } satisfies Resolved;
    const bytes = yield* fs.readFile(real.value);
    return { status: "file", bytes, lines: countLines(bytes) } satisfies Resolved;
  });

  const hashCache = new Map<string, string>();
  const blobId = Effect.fnUntraced(function* (key: string, bytes: Uint8Array) {
    const cached = hashCache.get(key);
    if (cached !== undefined) return cached;
    const header = blobHeaderEncoder.encode(`blob ${bytes.length}\u0000`);
    const blob = new Uint8Array(header.length + bytes.length);
    blob.set(header);
    blob.set(bytes, header.length);
    const digest = yield* crypto.digest("SHA-1", blob);
    const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    hashCache.set(key, hex);
    return hex;
  });

  const commitCache = new Map<string, string | undefined>();
  const headCommit = Effect.fnUntraced(function* (repo: string) {
    if (commitCache.has(repo)) return commitCache.get(repo);
    const repoRoot = repoRoots.get(repo);
    const commit =
      repoRoot === undefined
        ? undefined
        : yield* Effect.scoped(
            Effect.gen(function* () {
              const handle = yield* spawner.spawn(
                ChildProcess.make("git", ["rev-parse", "--verify", "HEAD"], {
                  cwd: repoRoot,
                  stderr: "ignore",
                }),
              );
              const [output, exitCode] = yield* Effect.all(
                [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
                { concurrency: 2 },
              );
              const head = output.trim();
              return exitCode === 0 && /^[0-9a-f]{40}$/.test(head) ? head : undefined;
            }),
          ).pipe(Effect.orElseSucceed(() => undefined));
    commitCache.set(repo, commit);
    return commit;
  });

  const pageIds = new Set([...navPageIds(config), glossaryPageId]);
  const existing = new Set<string>();
  for (const locale of config.locales) {
    for (const id of pageIds) {
      if (yield* fs.exists(path.join(root, locale, `${id}.md`))) existing.add(`${locale}/${id}`);
    }
  }

  const widgetsDirectory = path.join(root, "widgets");
  const widgetFiles = (yield* fs.exists(widgetsDirectory))
    ? new Set(yield* fs.readDirectory(widgetsDirectory))
    : new Set<string>();
  const widgetModules: Array<WidgetModule> = [];
  for (const file of [...widgetFiles].sort()) {
    if (file.endsWith(".css")) {
      rootErrors.push({
        file: `widgets/${file}`,
        line: 1,
        column: 1,
        message: "widget stylesheets are not supported; style the widget with Tailwind classes",
      });
    } else if (file.endsWith(".js")) {
      widgetModules.push({
        name: file.slice(0, -".js".length),
        text: yield* fs.readFileString(path.join(widgetsDirectory, file)),
      });
    }
  }
  const widgetStyles = yield* buildWidgetStyles(widgetModules);
  rootErrors.push(...widgetStyles.diagnostics);

  const readPage = Effect.fnUntraced(function* (locale: string, id: string) {
    if (!existing.has(`${locale}/${id}`)) return undefined;
    return parsePage(yield* fs.readFileString(path.join(root, locale, `${id}.md`)), id);
  });

  const checkPage = Effect.fnUntraced(function* (
    locale: string,
    id: string,
    parsed: ParseResult | undefined,
    glossaryTerms: ReadonlySet<string>,
  ) {
    const file = `${locale}/${id}.md`;
    const sourcesFile = `${locale}/${id}.sources.json`;
    const errors: Array<Diagnostic> = [];
    const at = (position: Position, message: string) =>
      errors.push({ file, line: position.line, column: position.column, message });
    if (parsed === undefined) {
      at(
        { line: 1, column: 1 },
        id === glossaryPageId
          ? `${file} is missing; every locale has a glossary`
          : `${file} is missing; nav lists page "${id}"`,
      );
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
      if (resolved.status === "unknown-repo" || resolved.status === "escapes")
        at(position, problem);
      else
        refProblems.push({ file, line: position.line, column: position.column, message: problem });
    }
    for (const term of page.terms) {
      if (!glossaryTerms.has(term.id)) {
        at(
          term.at,
          `unknown term "${term.id}"; define it as ## Label {#${term.id}} in ${locale}/glossary.md`,
        );
      }
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
      const commit = yield* headCommit(source.repo);
      sources.push(commit === undefined ? { ...source, hash } : { ...source, hash, commit });
    }

    const recordedText = yield* fs.readFileString(path.join(root, sourcesFile)).pipe(Effect.option);
    let recorded: ReadonlyArray<SourceFile> | undefined;
    if (recordedText._tag === "Some") {
      const decoded = yield* Schema.decodeUnknownEffect(SourcesFileFromJson)(
        recordedText.value,
      ).pipe(Effect.option);
      if (decoded._tag === "Some") recorded = decoded.value.files;
      else {
        errors.push({
          file: sourcesFile,
          line: 1,
          column: 1,
          message: `${sourcesFile} is malformed; rerun explain hash ${file}`,
        });
      }
    }

    const freshness = yield* compareSources(cited, recorded, sources, resolve);
    errors.sort(
      (a, b) =>
        (a.file === b.file ? 0 : a.file < b.file ? -1 : 1) ||
        a.line - b.line ||
        a.column - b.column,
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

  const pages: Array<DocPage> = [];
  for (const locale of config.locales) {
    const parsed = new Map<string, ParseResult | undefined>();
    for (const id of pageIds) parsed.set(id, yield* readPage(locale, id));
    const glossary = parsed.get(glossaryPageId)?.page;
    const terms = new Set(glossary === undefined ? [] : glossaryTermIds(glossary));
    for (const id of pageIds) pages.push(yield* checkPage(locale, id, parsed.get(id), terms));
  }
  return {
    root,
    config,
    pages,
    errors: rootErrors,
    widgets: widgetModules.map((module) => module.name),
    widgetCss: widgetStyles.css,
    resolveSource: resolve,
  } satisfies DocRoot;
});

const refProblem = (ref: Ref, resolved: Resolved): string | undefined => {
  const name = `${ref.repo}:${ref.path}`;
  switch (resolved.status) {
    case "unknown-repo":
      return `unknown repo "${ref.repo}"; explain.json repos has no such key`;
    case "missing":
      return `${name} does not exist`;
    case "escapes":
      return `${name} resolves outside the repo`;
    case "not-a-file":
      return `${name} is not a file`;
    case "file": {
      const beyond = ref.ranges.find((range) => range.to > resolved.lines);
      return beyond === undefined
        ? undefined
        : `${name}:${formatRange(beyond)} is beyond the file's ${resolved.lines} lines`;
    }
  }
};

const compareSources = Effect.fnUntraced(function* <E, R>(
  cited: ReadonlyMap<string, { repo: string; path: string }>,
  recorded: ReadonlyArray<SourceFile> | undefined,
  current: ReadonlyArray<SourceFile>,
  resolve: (repo: string, path: string) => Effect.Effect<Resolved, E, R>,
) {
  if (recorded === undefined) {
    return { status: "stale", reasons: [{ kind: "sources-missing" }] } satisfies Freshness;
  }
  const currentHashes = new Map(
    current.map((file) => [sourceKey(file.repo, file.path), file.hash]),
  );
  const recordedKeys = new Set(recorded.map((file) => sourceKey(file.repo, file.path)));
  const reasons: Array<StaleReason> = [];
  for (const [key, source] of cited) {
    if (!recordedKeys.has(key)) reasons.push({ kind: "not-recorded", ...source });
  }
  for (const file of recorded) {
    const source = { repo: file.repo, path: file.path };
    const key = sourceKey(file.repo, file.path);
    if (!cited.has(key)) {
      reasons.push({ kind: "not-cited", ...source });
      continue;
    }
    const hash = currentHashes.get(key);
    if (hash === undefined) {
      const resolved = yield* resolve(file.repo, file.path);
      if (resolved.status !== "file") reasons.push({ kind: "missing", ...source });
      continue;
    }
    if (hash !== file.hash) reasons.push({ kind: "changed", ...source });
  }
  reasons.sort((a, b) =>
    a.kind === "sources-missing" || b.kind === "sources-missing" ? 0 : compareSourceKeys(a, b),
  );
  return reasons.length === 0
    ? ({ status: "fresh" } satisfies Freshness)
    : ({ status: "stale", reasons } satisfies Freshness);
});

export const writeSources = Effect.fnUntraced(function* (root: string, page: ParsedDocPage) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.writeFileString(path.join(root, page.sourcesFile), formatSourcesFile(page.sources));
});
