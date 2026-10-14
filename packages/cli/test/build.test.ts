import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BunServices } from "@effect/platform-bun";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "vitest";
import { buildSite } from "../src/build.ts";
import { handleExplainRequest } from "../src/dev-api.ts";
import { loadDocRoot } from "../src/doc-root.ts";

const run = <A, E>(effect: Effect.Effect<A, E, BunServices.BunServices>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(BunServices.layer)));

const fixture = () => {
  const base = mkdtempSync(join(tmpdir(), "explain-build-"));
  const repo = join(base, "repo");
  const root = join(base, "docs");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "数据.ts"), "export const a = 1;\n");
  mkdirSync(join(root, "zh-CN"), { recursive: true });
  mkdirSync(join(root, "widgets"));
  writeFileSync(
    join(root, "explain.json"),
    JSON.stringify({
      title: { "zh-CN": "t" },
      locales: ["zh-CN"],
      defaultLocale: "zh-CN",
      repos: { fold: repo },
      nav: [{ title: { "zh-CN": "入门" }, pages: ["index"] }],
    }),
  );
  writeFileSync(
    join(root, "zh-CN", "index.md"),
    '# 首页\n\n见 [a](fold:src/数据.ts:1)。\n\n<Widget name="probe" title="Probe" source="fold:src/数据.ts">\n\n说明。\n\n</Widget>\n',
  );
  writeFileSync(
    join(root, "zh-CN", "index.sources.json"),
    JSON.stringify({ files: [{ repo: "fold", path: "src/old.ts", hash: "0".repeat(40) }] }),
  );
  writeFileSync(join(root, "zh-CN", "glossary.md"), "# 术语\n\n## 折叠 {#fold}\n\n定义。\n");
  writeFileSync(
    join(root, "widgets", "probe.js"),
    'export function mount(root) {\n  root.textContent = "ok";\n}\n',
  );
  return { base, root };
};

describe("buildSite", () => {
  it("writes every viewer request and route, rebuilds in place, and refuses foreign directories", async () => {
    const { base, root } = fixture();
    const loaded = await run(loadDocRoot(root));
    if (!Exit.isSuccess(loaded)) throw new Error(String(loaded.cause));
    const docRoot = loaded.value;
    expect([...docRoot.errors, ...docRoot.pages.flatMap((page) => page.errors)]).toEqual([]);

    const out = join(base, "out");
    expect(Exit.isSuccess(await run(buildSite(docRoot, out)))).toBe(true);
    expect(await run(buildSite(docRoot, out))).toEqual(
      Exit.succeed({ pages: 2, sources: 2, widgets: 1 }),
    );

    for (const url of [
      "/@explain/api/site",
      "/@explain/widgets.css",
      "/@explain/widgets/probe.js",
      "/@explain/api/page/zh-CN/index",
      "/@explain/api/page/zh-CN/glossary",
      "/@explain/api/search/zh-CN",
      `/@explain/api/source/fold/src/${encodeURIComponent("数据.ts")}`,
      "/@explain/api/source/fold/src/old.ts",
    ]) {
      const response = await run(handleExplainRequest({ status: "ok", docRoot }, "GET", url));
      if (!Exit.isSuccess(response)) throw new Error(String(response.cause));
      const body = response.value.body;
      expect(new Uint8Array(readFileSync(join(out, decodeURIComponent(url))))).toEqual(
        typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body),
      );
    }
    const html = readFileSync(join(out, "index.html"), "utf8");
    for (const route of [
      "404.html",
      "zh-CN/index.html",
      "zh-CN/index/index.html",
      "zh-CN/glossary/index.html",
      "zh-CN/source/fold/src/数据.ts/index.html",
      "zh-CN/source/fold/src/old.ts/index.html",
    ]) {
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
});
