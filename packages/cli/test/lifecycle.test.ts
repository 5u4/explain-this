import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const main = join(import.meta.dirname, "../src/main.ts");
const roots: Array<string> = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const indexPage = (retries: number) =>
  `# Retries\n\nA fold retries at most ${retries} times, set by [MAX_RETRIES](src:fold.ts:1).\n`;
const indexPageZh = (retries: number) =>
  `# 重试\n\nfold 最多重试 ${retries} 次，由 [MAX_RETRIES](src:fold.ts:1) 决定。\n`;
const viewPage = "# View\n\nThe view is exported from [view](src:view.ts:1).\n";
const viewPageZh = "# 视图\n\n`view` 由 [view](src:view.ts:1) 导出。\n";
const allPages = ["en/index.md", "zh-CN/index.md", "en/view.md", "zh-CN/view.md"];
const indexPages = ["en/index.md", "zh-CN/index.md"];

describe("explain-this skill lifecycle", () => {
  it("writes, validates, syncs, detects staleness, refreshes, and builds", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "explain-cli-")));
    roots.push(root);
    const repo = join(root, "repo");
    const docs = join(root, "docs");
    mkdirSync(repo);
    mkdirSync(docs);
    writeFileSync(
      join(repo, "fold.ts"),
      "export const MAX_RETRIES = 3;\nexport const fold = () => MAX_RETRIES;\n",
    );
    writeFileSync(join(repo, "view.ts"), "export const view = 1;\n");

    const explain = (label: string, args: ReadonlyArray<string>, expectedCode: number) => {
      const result = spawnSync("bun", [main, ...args], { cwd: docs, encoding: "utf8" });
      expect(
        result.status,
        `${label}\n--- stdout\n${result.stdout}\n--- stderr\n${result.stderr}`,
      ).toBe(expectedCode);
      return result.stdout;
    };
    const writePage = (path: string, text: string) => {
      mkdirSync(dirname(join(docs, path)), { recursive: true });
      writeFileSync(join(docs, path), text);
    };

    explain("init", ["init", "--locales=en,zh-CN"], 0);

    const configPath = join(docs, "explain.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.title = "Lifecycle";
    config.repos = { src: repo };
    config.nav = [{ title: "Basics", pages: ["index", "view"] }];
    writeFileSync(configPath, JSON.stringify(config));

    writePage("en/index.md", indexPage(3));
    writePage("zh-CN/index.md", indexPageZh(3));
    writePage("en/view.md", viewPage);
    writePage("zh-CN/view.md", viewPageZh);

    expect(explain("validate written pages", ["validate", ...allPages], 0)).toContain(
      "4 pages valid",
    );
    explain("sync written pages", ["freshness", "sync", ...allPages], 0);
    expect(explain("check after sync", ["freshness", "check"], 0)).toContain(
      "4 pages: 4 fresh, 0 stale, 0 not checked",
    );

    writeFileSync(
      join(repo, "fold.ts"),
      "export const MAX_RETRIES = 5;\nexport const fold = () => MAX_RETRIES;\n",
    );

    const stale = explain("check after source change", ["freshness", "check"], 1);
    expect(stale).toContain("stale en/index.md\n  src:fold.ts changed\n");
    expect(stale).toContain("stale zh-CN/index.md\n  src:fold.ts changed\n");
    expect(stale).not.toContain("stale en/view.md");
    expect(stale).not.toContain("stale zh-CN/view.md");
    expect(stale).toContain("4 pages: 2 fresh, 2 stale, 0 not checked");

    writePage("en/index.md", indexPage(5));
    writePage("zh-CN/index.md", indexPageZh(5));

    expect(explain("validate refreshed pages", ["validate", ...indexPages], 0)).toContain(
      "2 pages valid",
    );
    explain("sync refreshed pages", ["freshness", "sync", ...indexPages], 0);
    expect(explain("check after refresh", ["freshness", "check"], 0)).toContain(
      "4 pages: 4 fresh, 0 stale, 0 not checked",
    );

    expect(explain("build", ["build"], 0)).toContain(
      `explain build: ${join(docs, "dist")} (4 pages, 2 sources)`,
    );
    expect(existsSync(join(docs, "dist", "index.html"))).toBe(true);
  });
});
