import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { build } from "vite";
import { type DevState, handleExplainRequest } from "./dev-api.ts";
import type { DocRoot } from "./doc-root.ts";
import { viewerImportGuard, viewerRoot } from "./viewer.ts";

export class BuildFailed extends Schema.TaggedError<BuildFailed>()("BuildFailed", {
  message: Schema.String,
}) {}

export interface StaticRequest {
  readonly prefix: string;
  readonly segments: ReadonlyArray<string>;
}

export const requestUrl = ({ prefix, segments }: StaticRequest): string =>
  [prefix, ...segments.map(encodeURIComponent)].join("/");

const textDecoder = new TextDecoder();

export const staticSite = (docRoot: DocRoot) => {
  const sources = new Map<string, ReadonlyArray<string>>();
  for (const page of docRoot.pages) {
    if (page.status !== "parsed") continue;
    for (const { repo, path } of [
      ...page.page.refs.map(({ ref }) => ref),
      ...(page.recorded ?? []),
    ]) {
      sources.set(`${repo}\u0000${path}`, [repo, ...path.split("/")]);
    }
  }
  const { locales } = docRoot.config;
  const requests: ReadonlyArray<StaticRequest> = [
    { prefix: "/@explain/api/site", segments: [] },
    { prefix: "/@explain/widgets.css", segments: [] },
    ...docRoot.pages.map((page) => ({
      prefix: "/@explain/api/page",
      segments: [page.locale, page.id],
    })),
    ...locales.map((locale) => ({ prefix: "/@explain/api/search", segments: [locale] })),
    ...[...sources.values()].map((segments) => ({ prefix: "/@explain/api/source", segments })),
    ...docRoot.widgets.map((name) => ({ prefix: "/@explain/widgets", segments: [`${name}.js`] })),
  ];
  const routes: ReadonlyArray<ReadonlyArray<string>> = [
    ...locales.map((locale) => [locale]),
    ...docRoot.pages.map((page) => [page.locale, page.id]),
    ...locales.flatMap((locale) =>
      [...sources.values()].map((segments) => [locale, "source", ...segments]),
    ),
  ];
  return {
    requests,
    routes,
    counts: {
      pages: docRoot.pages.length,
      sources: sources.size,
      widgets: docRoot.widgets.length,
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
    Effect.fnUntraced(function* (request) {
      const url = requestUrl(request);
      const response = yield* handleExplainRequest(state, "GET", url);
      if (response.status !== 200) {
        const body =
          typeof response.body === "string" ? response.body : textDecoder.decode(response.body);
        return yield* new BuildFailed({ message: `${url} answered ${response.status}: ${body}` });
      }
      return {
        file: path.join(out, ...request.prefix.split("/"), ...request.segments),
        body: response.body,
      };
    }),
    { concurrency: 16 },
  );

  if (yield* fs.exists(out)) {
    const entries = yield* fs.readDirectory(out);
    if (entries.length > 0 && !(yield* fs.exists(path.join(out, "@explain", "api", "site")))) {
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
        build: { outDir: out, emptyOutDir: false },
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
