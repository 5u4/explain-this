import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const main = join(import.meta.dirname, "../src/main.ts");
const roots: Array<string> = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const indexPage =
  "# Retries\n\nA fold retries at most 3 times, set by [MAX_RETRIES](src:fold.ts:1).\n";
const viewPage = "# View\n\nThe view is exported from [view](src:view.ts:1).\n";

describe("explain-this skill lifecycle", () => {
  it("writes a doc root, validates it, and builds it", () => {
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

    writeFileSync(
      join(docs, "explain.json"),
      JSON.stringify({
        title: "Lifecycle",
        repos: { src: repo },
        nav: [{ title: "Basics", pages: ["index", "view"] }],
      }),
    );
    writeFileSync(join(docs, "index.md"), indexPage);
    writeFileSync(join(docs, "view.md"), viewPage);

    expect(explain("validate written pages", ["validate", "index.md", "view.md"], 0)).toContain(
      "2 pages valid",
    );
    expect(explain("build", ["build"], 0)).toContain(
      `explain build: ${join(docs, "dist")} (2 pages, 2 sources)`,
    );
    expect(existsSync(join(docs, "dist", "index.html"))).toBe(true);
    expect(existsSync(join(docs, "dist", "view", "index.html"))).toBe(true);
  });
});
