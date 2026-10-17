import { navPageIds } from "@explain/contract/config";
import { parsePage } from "@explain/contract/parse-page";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import { checkPage } from "./check-page.ts";
import { type InvalidConfig, loadConfig } from "./config.ts";
import { makeBlobId } from "./freshness.ts";
import { makeResolveSource, resolveRepos } from "./resolve-source.ts";
import type { DocPage, DocRoot, DocRootServices } from "./types.ts";

export const loadDocRoot = Effect.fnUntraced(function* (
  root: string,
): Effect.fn.Return<DocRoot, InvalidConfig | PlatformError.PlatformError, DocRootServices> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* loadConfig(root);

  const { repos, errors: repoErrors } = yield* resolveRepos(root, config);
  const resolve = yield* makeResolveSource(config, repos);
  const blobId = yield* makeBlobId;

  const pageIds = new Set(navPageIds(config));
  const existing = new Set<string>();
  for (const locale of config.locales) {
    for (const id of pageIds) {
      if (yield* fs.exists(path.join(root, locale, `${id}.md`))) existing.add(`${locale}/${id}`);
    }
  }

  const readPage = Effect.fnUntraced(function* (locale: string, id: string) {
    if (!existing.has(`${locale}/${id}`)) return undefined;
    return parsePage(yield* fs.readFileString(path.join(root, locale, `${id}.md`)), id);
  });

  const context = { root, pageIds, existing, resolve, blobId };
  const pages: Array<DocPage> = [];
  for (const locale of config.locales) {
    for (const id of pageIds) {
      pages.push(yield* checkPage(context, locale, id, yield* readPage(locale, id)));
    }
  }
  return {
    root,
    config,
    repos,
    pages,
    errors: repoErrors,
    resolveSource: resolve,
  } satisfies DocRoot;
});
