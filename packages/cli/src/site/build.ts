import {
  type ApiPath,
  pageApiPath,
  searchApiPath,
  siteApiPath,
  sourceApiPath,
} from "@explain/viewer/api";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { build } from "vite";
import type { DocRoot } from "../doc-root/types.ts";
import { type DevState, handleExplainRequest } from "./api.ts";
import { viewerImportGuard, viewerRoot } from "./viewer.ts";

export class BuildFailed extends Schema.TaggedError<BuildFailed>()("BuildFailed", {
  message: Schema.String,
}) {}

const textDecoder = new TextDecoder();

const staticSite = (docRoot: DocRoot) => {
  const sources = new Map<string, { readonly repo: string; readonly path: string }>();
  for (const page of docRoot.pages) {
    if (page.status !== "parsed") continue;
    for (const { repo, path } of [
      ...page.page.refs.map(({ ref }) => ref),
      ...(page.recorded ?? []),
    ]) {
      sources.set(`${repo}\u0000${path}`, { repo, path });
    }
  }
  const { locales } = docRoot.config;
  const requests: ReadonlyArray<ApiPath> = [
    siteApiPath,
    ...docRoot.pages.map((page) => pageApiPath(page.locale, page.id)),
    ...locales.map(searchApiPath),
    ...[...sources.values()].map(({ repo, path }) => sourceApiPath(repo, path)),
  ];
  const routes: ReadonlyArray<ReadonlyArray<string>> = [
    ...locales.flatMap((locale) => [[locale], [locale, "source"]]),
    ...docRoot.pages.map((page) => [page.locale, page.id]),
  ];
  return {
    requests,
    routes,
    counts: {
      pages: docRoot.pages.length,
      sources: sources.size,
    },
  };
};

export const buildSite = Effect.fnUntraced(function* (docRoot: DocRoot, out: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const site = staticSite(docRoot);
  const state: DevState = { status: "ok", docRoot };
  const files = yield* Effect.forEach(
    site.requests,
    Effect.fnUntraced(function* (url) {
      const response = yield* handleExplainRequest(state, "GET", url);
      if (response.status !== 200) {
        const body =
          typeof response.body === "string" ? response.body : textDecoder.decode(response.body);
        return yield* new BuildFailed({ message: `${url} answered ${response.status}: ${body}` });
      }
      return {
        file: path.join(out, ...url.split("/").map(decodeURIComponent)),
        body: response.body,
      };
    }),
    { concurrency: 16 },
  );

  if (yield* fs.exists(out)) {
    const entries = yield* fs.readDirectory(out);
    if (entries.length > 0 && !(yield* fs.exists(path.join(out, "@explain")))) {
      return yield* new BuildFailed({
        message: `${out} is not empty and is not an explain build; remove it or choose another --out`,
      });
    }
    yield* fs.remove(out, { recursive: true });
  }

  const viewer = yield* viewerRoot;
  yield* Effect.tryPromise({
    try: () =>
      build({
        configFile: false,
        root: viewer,
        logLevel: "warn",
        build: {
          outDir: out,
          emptyOutDir: false,
          rolldownOptions: {
            output: {
              codeSplitting: {
                groups: [
                  {
                    name: "pele",
                    test: /[\\/]node_modules[\\/]pele[\\/]dist[\\/]esm[\\/]/,
                    minShareCount: 2,
                  },
                ],
              },
            },
          },
        },
        plugins: [viewerImportGuard(viewer, path.sep)],
      }),
    catch: (cause) =>
      new BuildFailed({ message: cause instanceof Error ? cause.message : String(cause) }),
  });

  const html = yield* fs.readFile(path.join(out, "index.html"));
  yield* Effect.forEach(
    [
      ...files,
      ...[...site.routes.map((route) => [...route, "index.html"]), ["404.html"]].map((route) => ({
        file: path.join(out, ...route),
        body: html,
      })),
    ],
    ({ file, body }) =>
      fs
        .makeDirectory(path.dirname(file), { recursive: true })
        .pipe(
          Effect.andThen(
            typeof body === "string" ? fs.writeFileString(file, body) : fs.writeFile(file, body),
          ),
        ),
    { concurrency: 16, discard: true },
  );
  return site.counts;
});
