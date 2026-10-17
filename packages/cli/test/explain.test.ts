import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

const blobId = (repo: string, file: string) =>
  run("git", ["hash-object", "--no-filters", file], repo).stdout.trim();

const makeTempDir = () => {
  const directory = mkdtempSync(join(tmpdir(), "explain-cli-"));
  roots.push(directory);
  return directory;
};

const foldSource = "export const fold = 1;\nexport const view = 2;\nexport const settled = 3;\n";

const makeDocRoot = (page: string, navPages: ReadonlyArray<string> = ["index"]) => {
  const root = makeTempDir();
  const repo = join(root, "repo");
  const docs = join(root, "docs");
  mkdirSync(repo);
  mkdirSync(join(docs, "zh-CN"), { recursive: true });
  writeFileSync(join(repo, "fold.ts"), foldSource);
  writeFileSync(join(repo, "index.ts"), "import { fold } from './fold.ts';\n");
  writeFileSync(
    join(docs, "explain.json"),
    JSON.stringify({
      title: "测试",
      locales: ["zh-CN"],
      defaultLocale: "zh-CN",
      repos: { src: repo },
      nav: [{ title: "入门", pages: navPages }],
    }),
  );
  writeFileSync(join(docs, "zh-CN", "index.md"), page);
  return {
    repo,
    docs,
    explain: (...args: ReadonlyArray<string>) => run("bun", [main, ...args], docs),
    sourcesFile: join(docs, "zh-CN", "index.sources.json"),
    sources: () => readFileSync(join(docs, "zh-CN", "index.sources.json"), "utf8"),
    sourcesExists: () => existsSync(join(docs, "zh-CN", "index.sources.json")),
    writePage: (page: string) => writeFileSync(join(docs, "zh-CN", "index.md"), page),
  };
};

const citingPage = "# 折叠\n\n`fold` 在 [这里](src:fold.ts:1-2) 定义，见 [视图](src:fold.ts:2)。\n";

describe("explain freshness and validate", () => {
  it("records git blob ids, then reports every page fresh", () => {
    const docRoot = makeDocRoot(citingPage);
    expect(docRoot.explain("freshness", "sync", "zh-CN/index.md").code).toBe(0);
    expect(JSON.parse(docRoot.sources())).toEqual({
      files: [{ repo: "src", path: "fold.ts", hash: blobId(docRoot.repo, "fold.ts") }],
    });
    expect(docRoot.explain("freshness", "check").code).toBe(0);
  });

  it("writes byte-identical sources when syncing twice", () => {
    const docRoot = makeDocRoot(citingPage);
    docRoot.explain("freshness", "sync", "zh-CN/index.md");
    const first = docRoot.sources();
    docRoot.explain("freshness", "sync", "zh-CN/index.md");
    expect(docRoot.sources()).toBe(first);
    expect(first.endsWith("}\n")).toBe(true);
  });

  it("reports a page stale with no sources file, and still valid", () => {
    const docRoot = makeDocRoot(citingPage);
    const result = docRoot.explain("freshness", "check");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(
      "stale zh-CN/index.md\n  no sources file; run explain freshness sync zh-CN/index.md\n",
    );
    expect(docRoot.explain("validate").code).toBe(0);
  });

  it("names an edited cited file", () => {
    const docRoot = makeDocRoot(citingPage);
    docRoot.explain("freshness", "sync", "zh-CN/index.md");
    appendFileSync(join(docRoot.repo, "fold.ts"), "// edit\n");
    const result = docRoot.explain("freshness", "check");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("stale zh-CN/index.md\n  src:fold.ts changed\n");
  });

  it("reports a deleted cited file as stale, not as an error", () => {
    const docRoot = makeDocRoot(citingPage);
    docRoot.explain("freshness", "sync", "zh-CN/index.md");
    rmSync(join(docRoot.repo, "fold.ts"));
    const result = docRoot.explain("freshness", "check");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("stale zh-CN/index.md\n  src:fold.ts no longer exists\n");
  });

  it("reports a cited file that shrank below the cited lines as stale", () => {
    const docRoot = makeDocRoot(citingPage);
    docRoot.explain("freshness", "sync", "zh-CN/index.md");
    writeFileSync(join(docRoot.repo, "fold.ts"), "x\n");
    const result = docRoot.explain("freshness", "check");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("stale zh-CN/index.md\n  src:fold.ts changed\n");
    expect(docRoot.explain("freshness", "sync", "zh-CN/index.md").code).toBe(2);
  });

  it("names a citation added without syncing", () => {
    const docRoot = makeDocRoot(citingPage);
    docRoot.explain("freshness", "sync", "zh-CN/index.md");
    docRoot.writePage(`${citingPage}\n入口在 [index](src:index.ts)。\n`);
    const result = docRoot.explain("freshness", "check");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(
      "stale zh-CN/index.md\n  src:index.ts is cited but not hashed\n",
    );
  });

  it.each([
    ["an unknown repo key", "# 折叠\n\n见 [x](lib:fold.ts)。\n"],
    ["lines beyond the file", "# 折叠\n\n见 [x](src:fold.ts:2-9)。\n"],
    ["a missing file", "# 折叠\n\n见 [x](src:gone.ts)。\n"],
  ])("rejects a page with %s in validate and sync", (_, page) => {
    const docRoot = makeDocRoot(page);
    const validate = docRoot.explain("validate", "zh-CN/index.md");
    expect(validate.code).toBe(2);
    expect(validate.stderr).toContain("zh-CN/index.md:3:3 ");
    const sync = docRoot.explain("freshness", "sync", "zh-CN/index.md");
    expect(sync.code).toBe(2);
    expect(sync.stderr).toContain("zh-CN/index.md:3:3 ");
    expect(docRoot.sourcesExists()).toBe(false);
  });

  it("rejects a page with a parse error in validate and sync", () => {
    const docRoot = makeDocRoot(`${citingPage}\n# 第二个标题\n`);
    const validate = docRoot.explain("validate", "zh-CN/index.md");
    expect(validate.code).toBe(2);
    expect(validate.stderr).toContain("zh-CN/index.md:5:1 ");
    const sync = docRoot.explain("freshness", "sync", "zh-CN/index.md");
    expect(sync.code).toBe(2);
    expect(sync.stderr).toContain("zh-CN/index.md:5:1 ");
    expect(sync.stderr).toContain("refused to sync zh-CN/index.md: fix the errors above\n");
    expect(docRoot.sourcesExists()).toBe(false);
    expect(docRoot.explain("freshness", "check").stdout).toContain(
      "not checked zh-CN/index.md: run explain validate\n",
    );
  });

  it("lists a page citing an unknown repo as not checked", () => {
    const docRoot = makeDocRoot("# 折叠\n\n见 [x](lib:fold.ts)。\n");
    const result = docRoot.explain("freshness", "check");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("not checked zh-CN/index.md: run explain validate\n");
  });

  it("syncs a page that links to a nav page not written yet, which validate still reports", () => {
    const docRoot = makeDocRoot(`${citingPage}\n下一步见 [后续](./later.md)。\n`, [
      "index",
      "later",
    ]);
    const sync = docRoot.explain("freshness", "sync", "zh-CN/index.md");
    expect(sync).toEqual({ code: 0, stdout: "synced zh-CN/index.md (1 files)\n", stderr: "" });
    const validate = docRoot.explain("validate", "zh-CN/index.md");
    expect(validate.code).toBe(2);
    expect(validate.stderr).toBe('zh-CN/index.md:5:6 page link to "later" has no zh-CN/later.md\n');
    const check = docRoot.explain("freshness", "check");
    expect(check.stdout).toBe(
      "not checked zh-CN/later.md: run explain validate\n2 pages: 1 fresh, 0 stale, 1 not checked\n",
    );
  });

  it("reports a malformed sources file as stale, and sync rewrites it", () => {
    const docRoot = makeDocRoot(citingPage);
    writeFileSync(docRoot.sourcesFile, "{ not json");
    const validate = docRoot.explain("validate");
    expect(validate.code).toBe(2);
    expect(validate.stderr).toBe(
      "zh-CN/index.sources.json:1:1 zh-CN/index.sources.json is malformed; run explain freshness sync zh-CN/index.md\n",
    );
    const stale = docRoot.explain("freshness", "check");
    expect(stale).toEqual({
      code: 1,
      stdout:
        "stale zh-CN/index.md\n  zh-CN/index.sources.json is malformed; run explain freshness sync zh-CN/index.md\n1 pages: 0 fresh, 1 stale, 0 not checked\n",
      stderr: "",
    });
    expect(docRoot.explain("freshness", "sync", "zh-CN/index.md").code).toBe(0);
    expect(JSON.parse(docRoot.sources())).toEqual({
      files: [{ repo: "src", path: "fold.ts", hash: blobId(docRoot.repo, "fold.ts") }],
    });
    expect(docRoot.explain("freshness", "check")).toEqual({
      code: 0,
      stdout: "1 pages: 1 fresh, 0 stale, 0 not checked\n",
      stderr: "",
    });
  });

  it("prints config diagnostics relative to the current directory", () => {
    const docRoot = makeDocRoot(citingPage);
    writeFileSync(join(docRoot.docs, "explain.json"), JSON.stringify({ locales: ["zh-CN"] }));
    const result = run("bun", [main, "validate"], join(docRoot.docs, "zh-CN"));
    expect(result).toEqual({
      code: 2,
      stdout: "",
      stderr: "../explain.json:1:1 repos: Missing key\n../explain.json:1:1 nav: Missing key\n",
    });
  });

  it("resolves a relative repo path against the doc root from a locale directory", () => {
    const docRoot = makeDocRoot(citingPage);
    const config = JSON.parse(readFileSync(join(docRoot.docs, "explain.json"), "utf8"));
    writeFileSync(
      join(docRoot.docs, "explain.json"),
      JSON.stringify({ ...config, repos: { src: "../repo" } }),
    );
    const result = run("bun", [main, "validate"], join(docRoot.docs, "zh-CN"));
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
    const result = run("bun", [main, "validate"], join(docRoot.docs, "zh-CN"));
    expect(result).toEqual({
      code: 2,
      stdout: "",
      stderr: `../explain.json:1:1 repos.src: ../missing (${resolved}) is not a directory\n`,
    });
  });

  it("rejects an argument that is not a page", () => {
    const docRoot = makeDocRoot(citingPage);
    const result = docRoot.explain("validate", "zh-CN/other.md");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("zh-CN/other.md is not a page of the doc root");
  });

  it("rejects a citation that escapes the repo through a symlink", () => {
    const docRoot = makeDocRoot("# 折叠\n\n见 [x](src:outside.ts)。\n");
    writeFileSync(join(docRoot.docs, "..", "secret.ts"), "secret\n");
    spawnSync("ln", [
      "-s",
      join(docRoot.docs, "..", "secret.ts"),
      join(docRoot.repo, "outside.ts"),
    ]);
    const result = docRoot.explain("validate", "zh-CN/index.md");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("zh-CN/index.md:3:3 src:outside.ts resolves outside the repo");
  });
});

describe("explain init", () => {
  const explainIn = (cwd: string, ...args: ReadonlyArray<string>) =>
    run("bun", [main, ...args], cwd);

  it("writes explain.json in the current directory, which then validates and is fresh", () => {
    const directory = makeTempDir();
    const result = explainIn(directory, "init", "--locales=zh,en");
    expect(result.code).toBe(0);
    expect(readFileSync(join(directory, "explain.json"), "utf8")).toBe(
      '{\n  "locales": [\n    "zh",\n    "en"\n  ],\n  "repos": {},\n  "nav": []\n}\n',
    );
    const validate = explainIn(directory, "validate");
    expect(validate.code).toBe(0);
    expect(validate.stdout).toContain("0 pages valid");
    expect(explainIn(directory, "freshness", "check").code).toBe(0);
  });

  it("refuses to overwrite an existing explain.json", () => {
    const directory = makeTempDir();
    writeFileSync(join(directory, "explain.json"), "{}");
    const result = explainIn(directory, "init", "--locales=zh");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("explain.json already exists");
    expect(readFileSync(join(directory, "explain.json"), "utf8")).toBe("{}");
  });

  it("rejects a malformed locale and writes nothing", () => {
    const directory = makeTempDir();
    const result = explainIn(directory, "init", "--locales=zh,not a locale");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("locale must be a BCP 47 tag");
    expect(existsSync(join(directory, "explain.json"))).toBe(false);
  });
});
