import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const main = join(import.meta.dirname, "../src/main.ts");
const roots: Array<string> = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const run = (command: string, args: ReadonlyArray<string>, cwd: string) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
};

const foldSource = "export const fold = 1;\nexport const view = 2;\nexport const settled = 3;\n";

const makeDocRoot = (page: string, navPages: ReadonlyArray<string> = ["index"]) => {
  const root = mkdtempSync(join(tmpdir(), "explain-cli-"));
  roots.push(root);
  const repo = join(root, "repo");
  const docs = join(root, "docs");
  mkdirSync(repo);
  mkdirSync(join(docs, "notes"), { recursive: true });
  writeFileSync(join(repo, "fold.ts"), foldSource);
  writeFileSync(
    join(docs, "explain.json"),
    JSON.stringify({
      title: "测试",
      repos: { src: repo },
      nav: [{ title: "入门", pages: navPages }],
    }),
  );
  writeFileSync(join(docs, "index.md"), page);
  return {
    repo,
    docs,
    explain: (...args: ReadonlyArray<string>) => run("bun", [main, ...args], docs),
  };
};

const citingPage = "# 折叠\n\n`fold` 在 [这里](src:fold.ts:1-2) 定义，见 [视图](src:fold.ts:2)。\n";

describe("explain validate", () => {
  it("accepts a page whose citations resolve", () => {
    const docRoot = makeDocRoot(citingPage);
    expect(docRoot.explain("validate")).toEqual({
      code: 0,
      stdout: "1 pages valid\n",
      stderr: "",
    });
  });

  it.each([
    ["an unknown repo key", "# 折叠\n\n见 [x](lib:fold.ts)。\n"],
    ["lines beyond the file", "# 折叠\n\n见 [x](src:fold.ts:2-9)。\n"],
    ["a missing file", "# 折叠\n\n见 [x](src:gone.ts)。\n"],
  ])("rejects a page with %s", (_, page) => {
    const docRoot = makeDocRoot(page);
    const validate = docRoot.explain("validate", "index.md");
    expect(validate.code).toBe(2);
    expect(validate.stderr).toContain("index.md:3:3 ");
  });

  it("rejects a page with a parse error", () => {
    const docRoot = makeDocRoot(`${citingPage}\n# 第二个标题\n`);
    const validate = docRoot.explain("validate", "index.md");
    expect(validate.code).toBe(2);
    expect(validate.stderr).toContain("index.md:5:1 ");
  });

  it("reports a link to a nav page not written yet", () => {
    const docRoot = makeDocRoot(`${citingPage}\n下一步见 [后续](./later.md)。\n`, [
      "index",
      "later",
    ]);
    const validate = docRoot.explain("validate", "index.md");
    expect(validate).toEqual({
      code: 2,
      stdout: "",
      stderr: 'index.md:5:6 page link to "later" has no later.md\n',
    });
  });

  it("prints config diagnostics relative to the current directory", () => {
    const docRoot = makeDocRoot(citingPage);
    writeFileSync(join(docRoot.docs, "explain.json"), JSON.stringify({ title: "测试" }));
    const result = run("bun", [main, "validate"], join(docRoot.docs, "notes"));
    expect(result).toEqual({
      code: 2,
      stdout: "",
      stderr: "../explain.json:1:1 repos: Missing key\n../explain.json:1:1 nav: Missing key\n",
    });
  });

  it("resolves a relative repo path against the doc root from a subdirectory", () => {
    const docRoot = makeDocRoot(citingPage);
    const config = JSON.parse(readFileSync(join(docRoot.docs, "explain.json"), "utf8"));
    writeFileSync(
      join(docRoot.docs, "explain.json"),
      JSON.stringify({ ...config, repos: { src: "../repo" } }),
    );
    const result = run("bun", [main, "validate"], join(docRoot.docs, "notes"));
    expect(result).toEqual({ code: 0, stdout: "1 pages valid\n", stderr: "" });
  });

  it("names both the given and the resolved path of a missing relative repo", () => {
    const docRoot = makeDocRoot("# 折叠\n\n没有引用。\n");
    const config = JSON.parse(readFileSync(join(docRoot.docs, "explain.json"), "utf8"));
    writeFileSync(
      join(docRoot.docs, "explain.json"),
      JSON.stringify({ ...config, repos: { src: "../missing" } }),
    );
    const resolved = join(realpathSync(docRoot.docs), "..", "missing");
    const result = run("bun", [main, "validate"], join(docRoot.docs, "notes"));
    expect(result).toEqual({
      code: 2,
      stdout: "",
      stderr: `../explain.json:1:1 repos.src: ../missing (${resolved}) is not a directory\n`,
    });
  });

  it("rejects an argument that is not a page", () => {
    const docRoot = makeDocRoot(citingPage);
    const result = docRoot.explain("validate", "other.md");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("other.md is not a page of the doc root");
  });

  it("rejects a citation that escapes the repo through a symlink", () => {
    const docRoot = makeDocRoot("# 折叠\n\n见 [x](src:outside.ts)。\n");
    writeFileSync(join(docRoot.docs, "..", "secret.ts"), "secret\n");
    spawnSync("ln", [
      "-s",
      join(docRoot.docs, "..", "secret.ts"),
      join(docRoot.repo, "outside.ts"),
    ]);
    const result = docRoot.explain("validate", "index.md");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("index.md:3:3 src:outside.ts resolves outside the repo");
  });
});
