import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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

const git = (repo: string, ...args: ReadonlyArray<string>) =>
  run(
    "git",
    ["-c", "user.email=test@example.com", "-c", "user.name=test", ...args],
    repo,
  ).stdout.trim();

const foldSource = "export const fold = 1;\nexport const view = 2;\nexport const settled = 3;\n";

const makeDocRoot = (options: { readonly git: boolean; readonly page: string }) => {
  const root = mkdtempSync(join(tmpdir(), "explain-cli-"));
  roots.push(root);
  const repo = join(root, "repo");
  const docs = join(root, "docs");
  mkdirSync(repo);
  mkdirSync(join(docs, "zh-CN"), { recursive: true });
  writeFileSync(join(repo, "fold.ts"), foldSource);
  writeFileSync(join(repo, "index.ts"), "import { fold } from './fold.ts';\n");
  if (options.git) {
    git(repo, "init", "-q");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "init");
  }
  writeFileSync(
    join(docs, "explain.json"),
    JSON.stringify({
      title: { "zh-CN": "测试" },
      locales: ["zh-CN"],
      defaultLocale: "zh-CN",
      repos: { src: repo },
      nav: [{ title: { "zh-CN": "入门" }, pages: ["index"] }],
    }),
  );
  writeFileSync(join(docs, "zh-CN", "index.md"), options.page);
  writeFileSync(join(docs, "zh-CN", "glossary.md"), "# 术语表\n\n## run {#run}\n\n一次运行。\n");
  return {
    repo,
    docs,
    explain: (...args: ReadonlyArray<string>) => run("bun", [main, ...args], docs),
    sources: () => readFileSync(join(docs, "zh-CN", "index.sources.json"), "utf8"),
    sourcesExists: () => existsSync(join(docs, "zh-CN", "index.sources.json")),
    writePage: (page: string) => writeFileSync(join(docs, "zh-CN", "index.md"), page),
  };
};

const citingPage = "# 折叠\n\n`fold` 在 [这里](src:fold.ts:1-2) 定义，见 [run](term:run)。\n";

describe("explain hash and check", () => {
  it("records git blob ids and HEAD, then reports every page fresh", () => {
    const docRoot = makeDocRoot({ git: true, page: citingPage });
    expect(docRoot.explain("hash", "zh-CN/index.md", "zh-CN/glossary.md").code).toBe(0);
    expect(JSON.parse(docRoot.sources())).toEqual({
      files: [
        {
          repo: "src",
          path: "fold.ts",
          hash: git(docRoot.repo, "hash-object", "--no-filters", "fold.ts"),
          commit: git(docRoot.repo, "rev-parse", "HEAD"),
        },
      ],
    });
    expect(docRoot.explain("check").code).toBe(0);
  });

  it("writes byte-identical sources when hashing twice", () => {
    const docRoot = makeDocRoot({ git: true, page: citingPage });
    docRoot.explain("hash", "zh-CN/index.md");
    const first = docRoot.sources();
    docRoot.explain("hash", "zh-CN/index.md");
    expect(docRoot.sources()).toBe(first);
    expect(first.endsWith("}\n")).toBe(true);
  });

  it("omits commit when the repo is not a git work tree", () => {
    const docRoot = makeDocRoot({ git: false, page: citingPage });
    expect(docRoot.explain("hash", "zh-CN/index.md").code).toBe(0);
    expect(JSON.parse(docRoot.sources())).toEqual({
      files: [
        {
          repo: "src",
          path: "fold.ts",
          hash: git(docRoot.repo, "hash-object", "--no-filters", "fold.ts"),
        },
      ],
    });
  });

  it("reports a page stale with no sources file", () => {
    const docRoot = makeDocRoot({ git: true, page: citingPage });
    const result = docRoot.explain("check");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("stale zh-CN/index.md");
  });

  it("names an edited cited file", () => {
    const docRoot = makeDocRoot({ git: true, page: citingPage });
    docRoot.explain("hash", "zh-CN/index.md", "zh-CN/glossary.md");
    appendFileSync(join(docRoot.repo, "fold.ts"), "// edit\n");
    const result = docRoot.explain("check");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("stale zh-CN/index.md\n  src:fold.ts changed\n");
  });

  it("reports a deleted cited file as stale, not as an error", () => {
    const docRoot = makeDocRoot({ git: true, page: citingPage });
    docRoot.explain("hash", "zh-CN/index.md", "zh-CN/glossary.md");
    rmSync(join(docRoot.repo, "fold.ts"));
    const result = docRoot.explain("check");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("stale zh-CN/index.md\n  src:fold.ts no longer exists\n");
  });

  it("reports a cited file that shrank below the cited lines as stale", () => {
    const docRoot = makeDocRoot({ git: true, page: citingPage });
    docRoot.explain("hash", "zh-CN/index.md", "zh-CN/glossary.md");
    writeFileSync(join(docRoot.repo, "fold.ts"), "x\n");
    const result = docRoot.explain("check");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("stale zh-CN/index.md\n  src:fold.ts changed\n");
    expect(docRoot.explain("hash", "zh-CN/index.md").code).toBe(2);
  });

  it("names a citation added without re-hashing", () => {
    const docRoot = makeDocRoot({ git: true, page: citingPage });
    docRoot.explain("hash", "zh-CN/index.md", "zh-CN/glossary.md");
    docRoot.writePage(`${citingPage}\n入口在 [index](src:index.ts)。\n`);
    const result = docRoot.explain("check");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(
      "stale zh-CN/index.md\n  src:index.ts is cited but not hashed\n",
    );
  });

  it.each([
    ["an unknown repo key", "# 折叠\n\n见 [x](lib:fold.ts)。\n", "zh-CN/index.md:3:3 ", 2],
    ["lines beyond the file", "# 折叠\n\n见 [x](src:fold.ts:2-9)。\n", "zh-CN/index.md:3:3 ", 1],
    ["an unknown term", "# 折叠\n\n见 [x](term:fold)。\n", "zh-CN/index.md:3:3 ", 2],
    ["a missing file", "# 折叠\n\n见 [x](src:gone.ts)。\n", "zh-CN/index.md:3:3 ", 1],
  ])("refuses to hash a page with %s", (_, page, location, checkCode) => {
    const docRoot = makeDocRoot({ git: true, page });
    const result = docRoot.explain("hash", "zh-CN/index.md");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(location);
    expect(docRoot.sourcesExists()).toBe(false);
    expect(docRoot.explain("check").code).toBe(checkCode);
  });

  it("rejects a citation that escapes the repo through a symlink", () => {
    const docRoot = makeDocRoot({ git: false, page: "# 折叠\n\n见 [x](src:outside.ts)。\n" });
    writeFileSync(join(docRoot.docs, "..", "secret.ts"), "secret\n");
    spawnSync("ln", [
      "-s",
      join(docRoot.docs, "..", "secret.ts"),
      join(docRoot.repo, "outside.ts"),
    ]);
    const result = docRoot.explain("hash", "zh-CN/index.md");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("zh-CN/index.md:3:3 src:outside.ts resolves outside the repo");
  });

  it("rejects a widget without a module and color literals in widget CSS", () => {
    const docRoot = makeDocRoot({
      git: false,
      page: '# 折叠\n\n<Widget name="fold-play" title="演练" source="src:fold.ts">\n\n说明。\n\n</Widget>\n',
    });
    mkdirSync(join(docRoot.docs, "widgets"));
    writeFileSync(
      join(docRoot.docs, "widgets", "fold-play.css"),
      ".removed {\n  color: var(--removed);\n  border: 1px solid #fff;\n  background: red;\n}\n",
    );
    const missingModule = docRoot.explain("check");
    expect(missingModule.code).toBe(2);
    expect(missingModule.stderr).toContain("zh-CN/index.md:3:1 ");
    expect(missingModule.stderr).toContain("widgets/fold-play.css:3:21 ");
    expect(missingModule.stderr).toContain("widgets/fold-play.css:4:15 ");

    writeFileSync(join(docRoot.docs, "widgets", "fold-play.js"), "export function mount() {}\n");
    writeFileSync(
      join(docRoot.docs, "widgets", "fold-play.css"),
      ".removed {\n  color: var(--removed);\n}\n",
    );
    expect(docRoot.explain("hash", "zh-CN/index.md", "zh-CN/glossary.md").code).toBe(0);
    expect(docRoot.explain("check").code).toBe(0);
  });
});
