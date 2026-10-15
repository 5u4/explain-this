import { parseRef } from "@explain/contract/citation";
import type {
  Citer,
  PageResponse,
  SearchIndex,
  SiteResponse,
  SourceResponse,
} from "@explain/viewer/api";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import type { Diagnostic, DocRoot } from "../doc-root/types.ts";
import { pageResponse, pageTitle, siteResponse } from "./api-bodies.ts";
import { searchEntries } from "./search.ts";

export type DevState =
  | { readonly status: "ok"; readonly docRoot: DocRoot }
  | {
      readonly status: "invalid";
      readonly root: string;
      readonly errors: ReadonlyArray<Diagnostic>;
    };

export interface DevResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | Uint8Array;
}

type JsonBody =
  | SiteResponse
  | PageResponse
  | SourceResponse
  | SearchIndex
  | { readonly error: string };

const json = (status: number, body: JsonBody): DevResponse => ({
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const textDecoder = new TextDecoder();

const decodeSegments = (segments: ReadonlyArray<string>): ReadonlyArray<string> | undefined => {
  try {
    return segments.map((segment) => decodeURIComponent(segment));
  } catch {
    return undefined;
  }
};

const invalidState = json(503, { error: "explain.json is invalid; see /@explain/api/site.json" });

const sourceResponse = Effect.fnUntraced(function* (
  docRoot: DocRoot,
  repo: string,
  path: string,
): Effect.fn.Return<DevResponse, PlatformError.PlatformError> {
  if (!Object.hasOwn(docRoot.config.repos, repo)) {
    return json(404, { error: `unknown repo "${repo}"` });
  }
  const ref = parseRef(`${repo}:${path}`);
  if (ref._tag === "Failure") return json(403, { error: ref.failure });
  const resolved = yield* docRoot.resolveSource(repo, path);
  const citedBy: ReadonlyArray<Citer> = docRoot.pages
    .filter(
      (page) =>
        page.status === "parsed" &&
        page.page.refs.some(({ ref }) => ref.repo === repo && ref.path === path),
    )
    .map((page) => ({ locale: page.locale, id: page.id, title: pageTitle(page) }));
  switch (resolved.status) {
    case "file":
      return json(200, {
        status: "file",
        repo,
        path,
        text: textDecoder.decode(resolved.bytes),
        lines: resolved.lines,
        citedBy,
      });
    case "missing":
      return json(200, { status: "missing", repo, path, citedBy });
    case "escapes":
      return json(403, { error: `${repo}:${path} resolves outside the repo` });
    case "not-a-file":
      return json(403, { error: `${repo}:${path} is not a file` });
    case "unknown-repo":
      return json(404, { error: `unknown repo "${repo}"` });
  }
});

const widgetResponse = Effect.fnUntraced(function* (docRoot: DocRoot, file: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (!(file.endsWith(".js") && docRoot.widgets.includes(file.slice(0, -".js".length)))) {
    return json(404, { error: `no widget file "${file}"` });
  }
  const bytes = yield* fs.readFile(path.join(docRoot.root, "widgets", file)).pipe(Effect.option);
  if (bytes._tag === "None") return json(404, { error: `no widget file "${file}"` });
  return {
    status: 200,
    headers: { "Content-Type": "text/javascript", "Cache-Control": "no-store" },
    body: bytes.value,
  } satisfies DevResponse;
});

export const handleExplainRequest = Effect.fnUntraced(function* (
  state: DevState,
  method: string,
  rawPath: string,
): Effect.fn.Return<DevResponse, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> {
  if (method !== "GET") return json(405, { error: `${method} is not allowed` });
  const [empty, prefix, area, ...encoded] = rawPath.split("/");
  const rest = decodeSegments(encoded);
  if (empty !== "" || prefix !== "@explain" || rest === undefined) {
    return json(404, { error: `no route for ${rawPath}` });
  }
  if (area === "widgets.css" && rest.length === 0) {
    if (state.status === "invalid") return invalidState;
    return {
      status: 200,
      headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store" },
      body: state.docRoot.widgetCss,
    } satisfies DevResponse;
  }
  if (area === "widgets" && rest.length === 1 && rest[0] !== undefined) {
    if (state.status === "invalid") return invalidState;
    return yield* widgetResponse(state.docRoot, rest[0]);
  }
  const last = rest.at(-1);
  if (area !== "api" || last === undefined || !last.endsWith(".json")) {
    return json(404, { error: `no route for ${rawPath}` });
  }
  const [route, ...args] = [...rest.slice(0, -1), last.slice(0, -".json".length)];
  if (route === "site" && args.length === 0) {
    if (state.status === "invalid") {
      return json(200, { status: "invalid", errors: state.errors } satisfies SiteResponse);
    }
    return json(200, siteResponse(state.docRoot));
  }
  if (state.status === "invalid") return invalidState;
  const { docRoot } = state;
  const [first, ...more] = args;
  if (route === "page" && first !== undefined && more.length === 1 && more[0] !== undefined) {
    const page = docRoot.pages.find((page) => page.locale === first && page.id === more[0]);
    if (page === undefined) return json(404, { error: `no page ${first}/${more[0]}` });
    return json(200, pageResponse(page));
  }
  if (route === "source" && first !== undefined && more.length > 0) {
    return yield* sourceResponse(docRoot, first, more.join("/"));
  }
  if (route === "search" && first !== undefined && more.length === 0) {
    if (!docRoot.config.locales.includes(first)) {
      return json(404, { error: `unknown locale "${first}"` });
    }
    return json(
      200,
      docRoot.pages.flatMap((page) =>
        page.locale === first && page.status === "parsed" ? searchEntries(page) : [],
      ),
    );
  }
  return json(404, { error: `no route for ${rawPath}` });
});
