import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const main = join(import.meta.dirname, "../src/main.ts");
const env = { ...process.env, BROWSER: "none" };
const roots: Array<string> = [];
const servers: Array<ChildProcess> = [];

const stop = async (server: ChildProcess) => {
  if (server.exitCode !== null) return server.exitCode;
  const exited = Promise.withResolvers<number | null>();
  server.once("exit", (code) => exited.resolve(code));
  server.kill("SIGINT");
  return exited.promise;
};

afterEach(async () => {
  for (const server of servers.splice(0)) await stop(server);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const foldSource = "export const fold = 1;\nexport const view = 2;\nexport const settled = 3;\n";
const secret = "do-not-serve-this-secret\n";

const makeWorkspace = (files: Readonly<Record<string, string>>) => {
  const root = mkdtempSync(join(tmpdir(), "explain-open-"));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
};

const makeDoc = () =>
  join(
    makeWorkspace({
      "doc/01-overview.md":
        "# 概览\n\n`fold` 在 [这里](src:fold.ts:1-2)。见 [下一页](./02-b.md)。\n",
      "doc/02-b.md": "# 第二页\n\n正文。\n",
      "doc/10-a.md": "没有标题。\n",
      "doc/code/src/fold.ts": foldSource,
      "secret.txt": secret,
    }),
    "doc",
  );

const freePort = async () => {
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
  return address.port;
};

const startOpen = async (args: ReadonlyArray<string>) => {
  const server = spawn("bun", [main, "open", ...args], { env });
  servers.push(server);
  let output = "";
  const ready = Promise.withResolvers<URL>();
  server.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    const url = /explain open: (http:\/\/\S+)/.exec(output)?.[1];
    if (url !== undefined) ready.resolve(new URL(url));
  });
  server.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  server.once("exit", (code) => ready.reject(new Error(`explain open exited ${code}: ${output}`)));
  return { server, url: await ready.promise, output: () => output };
};

const openDoc = async (target: string) => startOpen([target, "--port", String(await freePort())]);

const validate = (dir: string) => {
  const result = spawnSync("bun", [main, "validate", dir], { encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
};

describe("explain open", () => {
  it("serves the dir's pages in filename order under the entry page's title", async () => {
    const { url, output } = await openDoc(makeDoc());
    expect(url.pathname).toBe("/01-overview");
    expect(output()).toContain("10-a.md:1:1 a page starts with one # title\n");

    const site = await fetch(new URL("/@explain/api/site.json", url));
    expect(await site.json()).toEqual({
      status: "ok",
      title: "概览",
      errors: [],
      nav: [
        { id: "01-overview", title: "概览" },
        { id: "02-b", title: "第二页" },
        { id: "10-a", title: "10-a" },
      ],
    });

    const page = await fetch(new URL("/@explain/api/page/01-overview.json", url));
    expect(await page.json()).toMatchObject({
      status: "parsed",
      id: "01-overview",
      file: "01-overview.md",
      diagnostics: [],
    });
    expect((await fetch(new URL("/@explain/api/page/later.json", url))).status).toBe(404);

    const html = await fetch(new URL("/02-b", url), { headers: { accept: "text/html" } });
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toContain("text/html");
  });

  it("opens the page named by a file argument", async () => {
    const { url } = await openDoc(join(makeDoc(), "02-b.md"));
    expect(url.pathname).toBe("/02-b");
    const site = await fetch(new URL("/@explain/api/site.json", url));
    expect(await site.json()).toMatchObject({ status: "ok", title: "概览" });
  });

  it("serves a frozen file and refuses paths outside code/<key>/", async () => {
    const { url } = await openDoc(makeDoc());

    const cited = await fetch(new URL("/@explain/api/source/src/fold.ts.json", url));
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

    expect((await fetch(new URL("/@explain/api/source/src/fold.ts", url))).status).toBe(404);
    expect(
      await (await fetch(new URL("/@explain/api/source/src/gone.ts.json", url))).json(),
    ).toEqual({ status: "missing", repo: "src", path: "gone.ts" });

    const unknown = await fetch(new URL("/@explain/api/source/lib/fold.ts.json", url));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "no code/lib/ in doc dir" });

    const refused = await fetch(
      new URL("/@explain/api/source/src/..%2F..%2F..%2Fsecret.txt.json", url),
    );
    expect(refused.status).toBe(403);
    expect(await refused.text()).not.toContain("do-not-serve");
  });

  const citing = (citation: string) => `# 链接\n\n见 [x](${citation})。\n`;

  it.each([
    {
      name: "a code/<key> symlink to a directory outside the doc dir",
      citation: "live:x.ts",
      setup: (root: string) => {
        mkdirSync(join(root, "external"));
        writeFileSync(join(root, "external", "x.ts"), secret);
        symlinkSync(join(root, "external"), join(root, "doc", "code", "live"));
      },
    },
    {
      name: "a file symlink into another key's tree",
      citation: "a:x.ts",
      setup: (root: string) => {
        mkdirSync(join(root, "doc", "code", "a"), { recursive: true });
        mkdirSync(join(root, "doc", "code", "b"), { recursive: true });
        writeFileSync(join(root, "doc", "code", "b", "y.ts"), secret);
        symlinkSync(join(root, "doc", "code", "b", "y.ts"), join(root, "doc", "code", "a", "x.ts"));
      },
    },
  ])("refuses $name", async ({ citation, setup }) => {
    const root = makeWorkspace({ "doc/01-link.md": citing(citation), "doc/code/.keep": "" });
    setup(root);
    const doc = join(root, "doc");
    const [key, path] = citation.split(":") as [string, string];

    const result = validate(doc);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(`01-link.md:3:3 ${citation} resolves outside code/${key}/\n`);

    const { url } = await openDoc(doc);
    const refused = await fetch(new URL(`/@explain/api/source/${key}/${path}.json`, url));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: `${citation} resolves outside code/${key}/` });
  });

  it("follows a symlink that stays inside its own key", async () => {
    const root = makeWorkspace({
      "doc/01-link.md": citing("a:alias.ts:1-3"),
      "doc/code/a/real.ts": foldSource,
    });
    const doc = join(root, "doc");
    symlinkSync(join(doc, "code", "a", "real.ts"), join(doc, "code", "a", "alias.ts"));

    expect(validate(doc)).toEqual({ code: 0, stdout: "1 pages valid\n", stderr: "" });

    const { url } = await openDoc(doc);
    const served = await fetch(new URL("/@explain/api/source/a/alias.ts.json", url));
    expect(served.status).toBe(200);
    expect(await served.json()).toMatchObject({ status: "file", text: foldSource, lines: 3 });
  });

  it("tells the browser to reload when a frozen file is added", async () => {
    const doc = makeDoc();
    const { url } = await openDoc(doc);
    const client = await (await fetch(new URL("/@vite/client", url))).text();
    const token = /const wsToken = ("[^"]*");/.exec(client)?.[1];
    expect(token).toBeDefined();

    const socket = new WebSocket(
      `ws://${url.host}/?token=${encodeURIComponent(JSON.parse(token as string))}`,
      "vite-hmr",
    );
    const reloaded = Promise.withResolvers<void>();
    const connected = Promise.withResolvers<void>();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === "connected") connected.resolve();
      if (message.type === "full-reload") reloaded.resolve();
    });
    socket.addEventListener("error", () => connected.reject(new Error("hmr socket failed")));
    try {
      await connected.promise;
      writeFileSync(join(doc, "code", "src", "new.ts"), "export const fresh = 1;\n");
      await reloaded.promise;
    } finally {
      socket.close();
    }
  });

  it("prints every diagnostic again on reload and exits 0 on Ctrl-C", async () => {
    const doc = makeDoc();
    const { server, output } = await openDoc(doc);
    writeFileSync(join(doc, "03-broken.md"), "# 坏\n\n见 [x](lib:x.ts)。\n");
    await expect
      .poll(output, { timeout: 10_000 })
      .toContain("03-broken.md:3:3 no code/lib/ in doc dir");
    servers.splice(servers.indexOf(server), 1);
    expect(await stop(server)).toBe(0);
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
      const { url } = await startOpen([makeDoc()]);
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
      const result = spawnSync("bun", [main, "open", makeDoc(), "--port", String(held.port)], {
        encoding: "utf8",
        env,
        timeout: 30_000,
      });
      expect(result.status).toBe(2);
      expect(result.stderr.endsWith(`\nexplain open: Port ${held.port} is already in use\n`)).toBe(
        true,
      );
    } finally {
      await held.release();
    }
  });
});
