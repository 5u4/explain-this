import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const main = join(import.meta.dirname, "../src/main.ts");
const roots: Array<string> = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const foldSource = "export const fold = 1;\nexport const view = 2;\nexport const settled = 3;\n";

const makeWorkspace = (files: Readonly<Record<string, string>>) => {
  const root = mkdtempSync(join(tmpdir(), "explain-cli-"));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return {
    root,
    explain: (...args: ReadonlyArray<string>) => {
      const result = spawnSync("bun", [main, ...args], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, BROWSER: "none" },
        timeout: 20_000,
      });
      return { code: result.status, stdout: result.stdout, stderr: result.stderr };
    },
  };
};

const citingPage = "# 折叠\n\n`fold` 在 [这里](src:fold.ts:1-2) 定义，见 [视图](src:fold.ts:2)。\n";

const docWith = (page: string) => ({
  "doc/01-fold.md": page,
  "doc/code/src/fold.ts": foldSource,
});

describe("explain validate", () => {
  it("accepts a doc dir whose pages, diffs, and citations across keys resolve", () => {
    const workspace = makeWorkspace({
      ...docWith(citingPage),
      "doc/02-diff.md": [
        "# 变化",
        "",
        "见 [旧](lib:old.ts:1) 与 [下一页](./01-fold.md)。",
        "",
        '<Diff before="lib:old.ts" after="src:fold.ts" />',
        "",
      ].join("\n"),
      "doc/code/lib/old.ts": "export const fold = 0;\n",
    });
    expect(workspace.explain("validate", "doc")).toEqual({
      code: 0,
      stdout: "2 pages valid\n",
      stderr: "",
    });
  });

  it("reports cited lines beyond the frozen file", () => {
    const workspace = makeWorkspace(docWith("# 折叠\n\n见 [x](src:fold.ts:2-9)。\n"));
    expect(workspace.explain("validate", "doc")).toEqual({
      code: 2,
      stdout: "",
      stderr: "doc/01-fold.md:3:3 src:fold.ts:2-9 is beyond the file's 3 lines\n",
    });
  });

  it("reports a citation key with no code/<key>/ directory", () => {
    const workspace = makeWorkspace(docWith("# 折叠\n\n见 [x](lib:fold.ts)。\n"));
    expect(workspace.explain("validate", "doc")).toEqual({
      code: 2,
      stdout: "",
      stderr: "doc/01-fold.md:3:3 no code/lib/ in doc dir\n",
    });
  });

  it("reports a missing frozen file and a parse error", () => {
    const workspace = makeWorkspace(docWith("# 折叠\n\n见 [x](src:gone.ts)。\n\n# 第二个标题\n"));
    const result = workspace.explain("validate", "doc");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("doc/01-fold.md:3:3 src:gone.ts does not exist\n");
    expect(result.stderr).toContain("doc/01-fold.md:5:1 ");
  });

  it("reports a link to a page that does not exist", () => {
    const workspace = makeWorkspace(docWith(`${citingPage}\n下一步见 [后续](./later.md)。\n`));
    expect(workspace.explain("validate", "doc")).toEqual({
      code: 2,
      stdout: "",
      stderr: 'doc/01-fold.md:5:6 page link to "later" has no later.md\n',
    });
  });

  it("rejects a page file whose name is not a page id and leaves it out", () => {
    const workspace = makeWorkspace({ ...docWith(citingPage), "doc/Bad_Name.md": "# 坏\n" });
    expect(workspace.explain("validate", "doc")).toEqual({
      code: 2,
      stdout: "",
      stderr:
        'doc/Bad_Name.md:1:1 page id "Bad_Name" must match ^[a-z0-9][a-z0-9-]*$; rename the file\n',
    });
  });

  it("ignores nested markdown and reports a dir with no top-level pages", () => {
    const workspace = makeWorkspace({ "doc/notes/01-a.md": "# 嵌套\n" });
    expect(workspace.explain("validate", "doc")).toEqual({
      code: 2,
      stdout: "",
      stderr: "doc:1:1 no pages: add a top-level <id>.md\n",
    });
  });

  it("prints diagnostics relative to the current directory", () => {
    const workspace = makeWorkspace(docWith("# 折叠\n\n见 [x](lib:fold.ts)。\n"));
    const result = spawnSync("bun", [main, "validate", "."], {
      cwd: join(workspace.root, "doc"),
      encoding: "utf8",
    });
    expect(result.stderr).toBe("01-fold.md:3:3 no code/lib/ in doc dir\n");
  });

  it.each([
    ["a sibling of the doc dir", "elsewhere", "../doc"],
    ["the doc dir's code/", "doc/code", ".."],
  ])("prints absolute diagnostic paths from %s", (_, cwd, target) => {
    const workspace = makeWorkspace({
      ...docWith("# 折叠\n\n见 [x](lib:fold.ts)。\n"),
      "elsewhere/.keep": "",
    });
    const result = spawnSync("bun", [main, "validate", target], {
      cwd: join(workspace.root, cwd),
      encoding: "utf8",
    });
    expect(result.stderr).toBe(
      `${join(realpathSync(workspace.root), "doc/01-fold.md")}:3:3 no code/lib/ in doc dir\n`,
    );
  });

  it.each([
    ["a missing path", "nowhere"],
    ["a file", "doc/01-fold.md"],
  ])("refuses %s", (_, target) => {
    const workspace = makeWorkspace(docWith(citingPage));
    expect(workspace.explain("validate", target)).toEqual({
      code: 2,
      stdout: "",
      stderr: `${target}: not a directory\n`,
    });
  });
});

describe("explain open before serving", () => {
  it.each([
    ["a missing page file", "doc/02-gone.md", "doc/02-gone.md does not exist\n"],
    ["a missing directory", "nowhere", "nowhere: not a directory\n"],
    ["a file that is not markdown", "doc/code/src/fold.ts", "doc/code/src/fold.ts is not a page\n"],
    [
      "a page file whose name is not a page id",
      "doc/Bad_Name.md",
      'doc/Bad_Name.md:1:1 page id "Bad_Name" must match ^[a-z0-9][a-z0-9-]*$; rename the file\n',
    ],
    ["a dir with no pages", "doc/code", "doc/code:1:1 no pages: add a top-level <id>.md\n"],
  ])("exits 2 for %s", (_, target, stderr) => {
    const workspace = makeWorkspace({ ...docWith(citingPage), "doc/Bad_Name.md": "# 坏\n" });
    expect(workspace.explain("open", target)).toEqual({ code: 2, stdout: "", stderr });
  });
});
