import { parseRef } from "@explain/contract/citation";
import { type Block, plainText, type TreeItem } from "@explain/contract/page";
import { compareSourceKeys, type SourceFile } from "@explain/contract/sources";
import type {
  Citer,
  LocaleSite,
  NavPage,
  PageResponse,
  SearchEntry,
  SearchIndex,
  SiteResponse,
  SourceEntry,
  SourceResponse,
  SourceState,
} from "@explain/viewer/api";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import type { Diagnostic, DocPage, DocRoot, ParsedDocPage } from "./doc-root.ts";

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

const sourceKey = (repo: string, path: string): string => `${repo}\u0000${path}`;

const decodeSegments = (segments: ReadonlyArray<string>): ReadonlyArray<string> | undefined => {
  try {
    return segments.map((segment) => decodeURIComponent(segment));
  } catch {
    return undefined;
  }
};

export const pageTitle = (page: DocPage): string =>
  (page.status === "parsed" ? plainText(page.page.title).trim() : "") || page.id;

const navPage = (page: DocPage): NavPage => ({
  id: page.id,
  title: pageTitle(page),
  status:
    page.status === "missing"
      ? "missing"
      : page.status === "invalid" || page.errors.length > 0
        ? "invalid"
        : page.freshness.status,
});

const invalidState = json(503, { error: "explain.json is invalid; see /@explain/api/site.json" });

const siteResponse = (docRoot: DocRoot): SiteResponse => {
  const { config } = docRoot;
  const pages = new Map(docRoot.pages.map((page) => [`${page.locale}/${page.id}`, page]));
  const navEntry = (locale: string, id: string): NavPage => {
    const page = pages.get(`${locale}/${id}`);
    return page === undefined ? { id, title: id, status: "missing" } : navPage(page);
  };
  const byLocale: Record<string, LocaleSite> = {};
  for (const locale of config.locales) {
    byLocale[locale] = {
      nav: config.nav.map((group) => ({
        title: group.title,
        pages: group.pages.map((id) => navEntry(locale, id)),
      })),
    };
  }
  return {
    status: "ok",
    title: config.title ?? "Document",
    locales: config.locales,
    defaultLocale: config.defaultLocale,
    widgets: docRoot.widgets,
    errors: docRoot.errors,
    byLocale,
  };
};

const sourceEntries = (page: ParsedDocPage): ReadonlyArray<SourceEntry> => {
  const recorded = new Map(
    (page.recorded ?? []).map((file) => [sourceKey(file.repo, file.path), file]),
  );
  const current = new Map(page.sources.map((file) => [sourceKey(file.repo, file.path), file]));
  const keys = new Map<string, { readonly repo: string; readonly path: string }>();
  for (const { ref } of page.page.refs) {
    keys.set(sourceKey(ref.repo, ref.path), { repo: ref.repo, path: ref.path });
  }
  for (const file of recorded.values()) {
    keys.set(sourceKey(file.repo, file.path), { repo: file.repo, path: file.path });
  }
  const reasons = page.freshness.status === "stale" ? page.freshness.reasons : [];
  const sourcesMissing = reasons.some((reason) => reason.kind === "sources-missing");
  const states = new Map<string, SourceState>();
  for (const reason of reasons) {
    if (reason.kind !== "sources-missing") {
      states.set(sourceKey(reason.repo, reason.path), reason.kind);
    }
  }
  return [...keys.entries()]
    .sort(([, a], [, b]) => compareSourceKeys(a, b))
    .map(([key, source]) => ({
      ...source,
      state: sourcesMissing ? "not-recorded" : (states.get(key) ?? "fresh"),
      recorded: recorded.get(key) ?? null,
      current: current.get(key) ?? (null satisfies SourceFile | null),
    }));
};

const pageResponse = (page: DocPage): PageResponse => {
  const address = { locale: page.locale, id: page.id, file: page.file };
  switch (page.status) {
    case "missing":
      return { ...address, status: "missing" };
    case "invalid":
      return { ...address, status: "invalid", errors: page.errors };
    case "parsed":
      return {
        ...address,
        status: "parsed",
        page: page.page,
        errors: page.errors,
        refProblems: page.refProblems,
        freshness: page.freshness,
        sources: sourceEntries(page),
      };
  }
};

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

const treeTexts = (items: ReadonlyArray<TreeItem>): ReadonlyArray<string> =>
  items.flatMap((item) => [plainText(item.label), ...treeTexts(item.children)]);

const blockText = (block: Block): ReadonlyArray<string> => {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return [plainText(block.children)];
    case "list":
      return block.items.flatMap((item) => item.children.flatMap(blockText));
    case "table":
      return [...block.head, ...block.rows.flat()].map(plainText);
    case "alert":
    case "quote":
      return block.children.flatMap(blockText);
    case "details":
      return [plainText(block.summary), ...block.children.flatMap(blockText)];
    case "tree":
      return treeTexts(block.items);
    case "tabs":
      return block.tabs.flatMap((tab) => [tab.label, ...tab.children.flatMap(blockText)]);
    case "beforeAfter":
      return [block.before, block.after].flatMap((side) => [
        side.label,
        ...side.children.flatMap(blockText),
      ]);
    case "annotatedSource":
      return block.notes.map((note) => plainText(note.children));
    case "widget":
      return [block.title, plainText(block.children)];
    case "code":
    case "excerpt":
    case "mermaid":
    case "diff":
    case "thematicBreak":
      return [];
  }
};

const searchEntries = (page: ParsedDocPage): ReadonlyArray<SearchEntry> => {
  const title = pageTitle(page);
  const sections: Array<{ heading: string; anchor: string | null; blocks: Array<Block> }> = [];
  for (const block of page.page.blocks) {
    if (block.type === "heading") {
      sections.push({ heading: plainText(block.children).trim(), anchor: block.id, blocks: [] });
    } else if (sections.length === 0) {
      sections.push({ heading: title, anchor: null, blocks: [block] });
    } else {
      sections.at(-1)?.blocks.push(block);
    }
  }
  return sections.map((section) => ({
    page: page.id,
    pageTitle: title,
    heading: section.heading,
    anchor: section.anchor,
    text: section.blocks
      .flatMap(blockText)
      .map((text) => text.trim())
      .filter((text) => text !== "")
      .join(" "),
  }));
};

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
