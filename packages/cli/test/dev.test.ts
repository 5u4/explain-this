import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const main = join(import.meta.dirname, "../src/main.ts");
const roots: Array<string> = [];
const servers: Array<ChildProcess> = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    const exited = Promise.withResolvers<void>();
    server.once("exit", () => exited.resolve());
    server.kill("SIGINT");
    await exited.promise;
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const foldSource = "export const fold = 1;\nexport const view = 2;\nexport const settled = 3;\n";
const secret = "do-not-serve-this-secret\n";

const makeDocRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "explain-dev-"));
  roots.push(root);
  const repo = join(root, "repo");
  const docs = join(root, "docs");
  mkdirSync(repo);
  mkdirSync(docs);
  writeFileSync(join(repo, "fold.ts"), foldSource);
  writeFileSync(join(root, "secret.txt"), secret);
  symlinkSync(join(root, "secret.txt"), join(repo, "leak.txt"));
  writeFileSync(
    join(docs, "explain.json"),
    JSON.stringify({
      title: "测试",
      repos: { src: repo },
      nav: [{ title: "入门", pages: ["index"] }],
    }),
  );
  writeFileSync(join(docs, "index.md"), "# 折叠\n\n`fold` 在 [这里](src:fold.ts:1-2)。\n");
  return docs;
};

const startDev = async (docs: string) => {
  const probe = createServer();
  const listening = Promise.withResolvers<void>();
  probe.once("error", listening.reject);
  probe.listen(0, "127.0.0.1", listening.resolve);
  await listening.promise;
  const address = probe.address();
  if (typeof address !== "object" || address === null) throw new Error("no free port");
  const closed = Promise.withResolvers<void>();
  probe.close(() => closed.resolve());
  await closed.promise;

  const server = spawn("bun", [main, "dev", "--port", String(address.port)], { cwd: docs });
  servers.push(server);
  let output = "";
  const ready = Promise.withResolvers<void>();
  server.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    if (output.includes("explain dev: http")) ready.resolve();
  });
  server.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  server.once("exit", (code) => ready.reject(new Error(`explain dev exited ${code}: ${output}`)));
  await ready.promise;
  return `http://127.0.0.1:${address.port}`;
};

describe("explain dev", () => {
  it("serves the site, its pages, and the viewer at a page path", async () => {
    const base = await startDev(makeDocRoot());

    const site = await fetch(`${base}/@explain/api/site.json`);
    expect(await site.json()).toEqual({
      status: "ok",
      title: "测试",
      errors: [],
      nav: [{ title: "入门", pages: [{ id: "index", title: "折叠" }] }],
    });

    const page = await fetch(`${base}/@explain/api/page/index.json`);
    expect(page.status).toBe(200);
    expect(await page.json()).toMatchObject({
      status: "parsed",
      id: "index",
      file: "index.md",
      diagnostics: [],
    });
    expect((await fetch(`${base}/@explain/api/page/later.json`)).status).toBe(404);

    const html = await fetch(`${base}/index`, { headers: { accept: "text/html" } });
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toContain("text/html");
  });

  it("serves a cited file and refuses paths that escape the repo", async () => {
    const base = await startDev(makeDocRoot());

    const cited = await fetch(`${base}/@explain/api/source/src/fold.ts.json`);
    expect(cited.status).toBe(200);
    expect(cited.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(cited.headers.get("cache-control")).toBe("no-store");
    expect(await cited.json()).toEqual({
      status: "file",
      repo: "src",
      path: "fold.ts",
      text: foldSource,
      lines: 3,
    });

    expect((await fetch(`${base}/@explain/api/source/src/fold.ts`)).status).toBe(404);

    for (const escape of ["..%2Fsecret.txt", "leak.txt"]) {
      const refused = await fetch(`${base}/@explain/api/source/src/${escape}.json`);
      expect(refused.status).toBe(403);
      expect(await refused.text()).not.toContain("do-not-serve");
    }
  });

  const holdPort = async (wanted: number) => {
    const holder = createServer();
    const listening = Promise.withResolvers<void>();
    holder.once("error", listening.reject);
    holder.listen(wanted, "127.0.0.1", listening.resolve);
    await listening.promise;
    const address = holder.address();
    if (typeof address !== "object" || address === null) throw new Error("no port held");
    return {
      port: address.port,
      release: () => new Promise<void>((resolve) => holder.close(() => resolve())),
    };
  };

  it("takes the next free port when 4321 is busy and no --port is given", async () => {
    const held = await holdPort(4321);
    try {
      const server = spawn("bun", [main, "dev"], { cwd: makeDocRoot() });
      servers.push(server);
      let output = "";
      const ready = Promise.withResolvers<string>();
      server.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        const url = /explain dev: (http:\/\/\S+)/.exec(output)?.[1];
        if (url !== undefined) ready.resolve(url);
      });
      server.once("exit", (code) => ready.reject(new Error(`explain dev exited ${code}`)));
      const url = new URL(await ready.promise);
      expect(url.port).not.toBe("4321");
      expect(Number(url.port)).toBeGreaterThan(4321);
      expect((await fetch(new URL("/@explain/api/site.json", url))).status).toBe(200);
    } finally {
      await held.release();
    }
  });

  it("fails with exit 2 when an explicit --port is busy", async () => {
    const held = await holdPort(0);
    try {
      const result = spawnSync("bun", [main, "dev", "--port", String(held.port)], {
        cwd: makeDocRoot(),
        encoding: "utf8",
        timeout: 30_000,
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toBe(`explain dev: Port ${held.port} is already in use\n`);
    } finally {
      await held.release();
    }
  });
});
