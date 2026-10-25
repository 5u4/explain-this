import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BunServices } from "@effect/platform-bun";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "vitest";
import { loadDocRoot } from "../src/doc-root/load.ts";
import { handleExplainRequest } from "../src/site/api.ts";
import { buildSite } from "../src/site/build.ts";

const run = <A, E>(effect: Effect.Effect<A, E, BunServices.BunServices>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(BunServices.layer)));

const filesUnder = (dir: string) =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => statSync(join(dir, file)).isFile())
    .sort();

const diagramFetches = (out: string) => {
  const assets = join(out, "assets");
  const scripts = new Map(
    readdirSync(assets)
      .filter((file) => file.endsWith(".js"))
      .map((file) => [file, readFileSync(join(assets, file), "utf8")]),
  );
  const targets = (file: string, pattern: RegExp) =>
    [...(scripts.get(file) ?? "").matchAll(pattern)].flatMap(([, target]) =>
      target === undefined ? [] : [target],
    );
  const closure = (roots: ReadonlyArray<string>) => {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const next of targets(file, /(?:\bfrom|\bimport)\s*["'`]\.\/([^"'`]+\.js)["'`]/g)) {
        visit(next);
      }
    };
    for (const root of roots) visit(root);
    return seen;
  };
  const dynamicImports = (files: Iterable<string>) =>
    [...files].flatMap((file) => targets(file, /\bimport\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)/g));
  const entryFile = /<script type="module"[^>]* src="\/assets\/([^"]+\.js)"/.exec(
    readFileSync(join(out, "index.html"), "utf8"),
  )?.[1];
  if (entryFile === undefined) throw new Error("index.html loads no module script");
  const entry = closure([entryFile]);
  const pele = dynamicImports(entry).find((file) =>
    /\bexport\s*\{[^}]*\bas mountAsync\b/.test(scripts.get(file) ?? ""),
  );
  if (pele === undefined) throw new Error("no lazily imported chunk exports mountAsync");
  const bytes = (files: Iterable<string>) =>
    [...files].reduce((sum, file) => sum + statSync(join(assets, file)).size, 0);
  const perType = dynamicImports([...closure([pele])].filter((file) => !entry.has(file))).map(
    (loader) => [...closure([pele, loader])].filter((file) => !entry.has(file)),
  );
  return {
    requests: perType.map((fetched) => fetched.length),
    bytes: perType.map(bytes),
    everyTypeBytes: bytes(new Set(perType.flat())),
  };
};

const fixture = () => {
  const base = mkdtempSync(join(tmpdir(), "explain-build-"));
  const repo = join(base, "repo");
  const root = join(base, "docs");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "数据.ts"), "export const a = 1;\n");
  writeFileSync(join(repo, "src", "index.html"), "<p>home</p>\n");
  mkdirSync(join(root, "zh-CN"), { recursive: true });
  writeFileSync(
    join(root, "explain.json"),
    JSON.stringify({
      title: "t",
      locales: ["zh-CN"],
      defaultLocale: "zh-CN",
      repos: { fold: repo },
      nav: [{ title: "入门", pages: ["index"] }],
    }),
  );
  writeFileSync(
    join(root, "zh-CN", "index.md"),
    "# 首页\n\n见 [a](fold:src/数据.ts:1)、[b](fold:src/index.html:1)。\n",
  );
  writeFileSync(
    join(root, "zh-CN", "index.sources.json"),
    JSON.stringify({ files: [{ repo: "fold", path: "src/old.ts", hash: "0".repeat(40) }] }),
  );
  return { base, root };
};

describe("buildSite", () => {
  it("writes every viewer request and route, rebuilds in place, and refuses foreign directories", async () => {
    const { base, root } = fixture();
    const loaded = await run(loadDocRoot(root));
    if (!Exit.isSuccess(loaded)) throw new Error(String(loaded.cause));
    const docRoot = loaded.value;
    expect([...docRoot.errors, ...docRoot.pages.flatMap((page) => page.diagnostics)]).toEqual([]);

    const out = join(base, "out");
    expect(Exit.isSuccess(await run(buildSite(docRoot, out)))).toBe(true);
    expect(await run(buildSite(docRoot, out))).toEqual(Exit.succeed({ pages: 1, sources: 3 }));

    const explain = join(out, "@explain");
    const written = filesUnder(explain);
    expect(written).toEqual(
      [
        "api/page/zh-CN/index.json",
        "api/search/zh-CN.json",
        "api/site.json",
        "api/source/fold/src/index.html.json",
        "api/source/fold/src/old.ts.json",
        "api/source/fold/src/数据.ts.json",
      ].sort(),
    );

    for (const file of written) {
      const url = `/@explain/${file.split("/").map(encodeURIComponent).join("/")}`;
      const response = await run(handleExplainRequest({ status: "ok", docRoot }, "GET", url));
      if (!Exit.isSuccess(response)) throw new Error(String(response.cause));
      expect(response.value.status).toBe(200);
      const body = response.value.body;
      expect(new Uint8Array(readFileSync(join(explain, file)))).toEqual(
        typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body),
      );
    }
    const html = readFileSync(join(out, "index.html"), "utf8");
    const routes = filesUnder(out).filter(
      (file) => !file.startsWith("@explain/") && !file.startsWith("assets/"),
    );
    expect(routes).toEqual(
      [
        "404.html",
        "index.html",
        "zh-CN/index.html",
        "zh-CN/source/index.html",
        "zh-CN/index/index.html",
      ].sort(),
    );
    for (const route of routes) {
      expect(readFileSync(join(out, route), "utf8")).toBe(html);
    }

    const foreign = join(base, "foreign");
    mkdirSync(foreign);
    writeFileSync(join(foreign, "keep.txt"), "mine");
    const refused = await run(buildSite(docRoot, foreign));
    expect(Exit.isFailure(refused)).toBe(true);
    expect(existsSync(join(foreign, "keep.txt"))).toBe(true);
    expect(existsSync(join(foreign, "index.html"))).toBe(false);
  });

  it("loads any one diagram type with at most three scripts and without every type's code", async () => {
    const { base, root } = fixture();
    const loaded = await run(loadDocRoot(root));
    if (!Exit.isSuccess(loaded)) throw new Error(String(loaded.cause));
    const out = join(base, "out");
    expect(Exit.isSuccess(await run(buildSite(loaded.value, out)))).toBe(true);

    const { requests, bytes, everyTypeBytes } = diagramFetches(out);
    expect(requests.length).toBeGreaterThan(1);
    expect(Math.max(...requests)).toBeLessThanOrEqual(3);
    expect(Math.min(...bytes)).toBeLessThan(everyTypeBytes);
  });
});
