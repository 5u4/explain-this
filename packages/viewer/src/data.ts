import {
  type ApiPath,
  type PageResponse,
  pageApiPath,
  type SiteResponse,
  type SourceResponse,
  siteApiPath,
  sourceApiPath,
} from "./api.ts";
import { highlightLines, languageOf } from "./highlight.ts";
import { fileKey } from "./ref.ts";

const responses = new Map<string, Promise<unknown>>();

const getJson = <T>(path: ApiPath): Promise<T> => {
  const cached = responses.get(path);
  if (cached !== undefined) return cached as Promise<T>;
  const loading = fetch(path).then(async (response) => {
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    return (await response.json()) as T;
  });
  loading.catch(() => responses.delete(path));
  responses.set(path, loading);
  return loading;
};

export const loadSite = (): Promise<SiteResponse> => getJson(siteApiPath);

export const loadPage = (id: string): Promise<PageResponse> => getJson(pageApiPath(id));

export const loadSource = (repo: string, path: string): Promise<SourceResponse> =>
  getJson(sourceApiPath(repo, path));

export type SourceLines =
  | {
      readonly status: "file";
      readonly raw: ReadonlyArray<string>;
      readonly html: ReadonlyArray<string>;
    }
  | { readonly status: "missing" }
  | { readonly status: "error"; readonly message: string };

const sourceLines = new Map<string, Promise<SourceLines>>();

export const loadSourceLines = (repo: string, path: string): Promise<SourceLines> => {
  const key = fileKey({ repo, path });
  const cached = sourceLines.get(key);
  if (cached !== undefined) return cached;
  const loading = loadSource(repo, path)
    .then(async (source): Promise<SourceLines> => {
      if (source.status === "missing") return { status: "missing" };
      const raw = source.text.replace(/\n$/, "").split("\n");
      return { status: "file", raw, html: await highlightLines(raw, languageOf(path)) };
    })
    .catch((error: unknown): SourceLines => ({ status: "error", message: String(error) }));
  sourceLines.set(key, loading);
  return loading;
};
