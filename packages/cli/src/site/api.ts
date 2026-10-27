import { parseRef } from "@explain/contract/citation";
import type { PageResponse, SiteResponse, SourceResponse } from "@explain/viewer/api";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import { escapesMessage, missingKeyMessage } from "../doc-dir/resolve-source.ts";
import type { Diagnostic, DocDir } from "../doc-dir/types.ts";
import { pageResponse, siteResponse } from "./api-bodies.ts";

export type DevState =
  | { readonly status: "ok"; readonly docDir: DocDir }
  | { readonly status: "invalid"; readonly errors: ReadonlyArray<Diagnostic> };

export interface DevResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | Uint8Array;
}

type JsonBody = SiteResponse | PageResponse | SourceResponse | { readonly error: string };

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

const invalidState = json(503, {
  error: "the doc dir could not be read; see /@explain/api/site.json",
});

const sourceResponse = Effect.fnUntraced(function* (
  docDir: DocDir,
  repo: string,
  path: string,
): Effect.fn.Return<DevResponse, PlatformError.PlatformError> {
  const ref = parseRef(`${repo}:${path}`);
  if (ref._tag === "Failure") return json(403, { error: ref.failure });
  const resolved = yield* docDir.resolveSource(repo, path);
  switch (resolved.status) {
    case "file":
      return json(200, {
        status: "file",
        repo,
        path,
        text: textDecoder.decode(resolved.bytes),
        lines: resolved.lines,
      });
    case "missing":
      return json(200, { status: "missing", repo, path });
    case "escapes":
      return json(403, { error: escapesMessage(repo, path) });
    case "not-a-file":
      return json(403, { error: `${repo}:${path} is not a file` });
    case "missing-key":
      return json(404, { error: missingKeyMessage(repo) });
  }
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
  const last = rest.at(-1);
  if (area !== "api" || last === undefined || !last.endsWith(".json")) {
    return json(404, { error: `no route for ${rawPath}` });
  }
  const [route, ...args] = [...rest.slice(0, -1), last.slice(0, -".json".length)];
  if (route === "site" && args.length === 0) {
    if (state.status === "invalid") {
      return json(200, { status: "invalid", errors: state.errors } satisfies SiteResponse);
    }
    return json(200, siteResponse(state.docDir));
  }
  if (state.status === "invalid") return invalidState;
  const { docDir } = state;
  const [first, ...more] = args;
  if (route === "page" && first !== undefined && more.length === 0) {
    const page = docDir.pages.find((page) => page.id === first);
    if (page === undefined) return json(404, { error: `no page ${first}` });
    return json(200, pageResponse(page));
  }
  if (route === "source" && first !== undefined && more.length > 0) {
    return yield* sourceResponse(docDir, first, more.join("/"));
  }
  return json(404, { error: `no route for ${rawPath}` });
});
