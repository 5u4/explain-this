import { pageIdPattern } from "@explain/contract/page";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import { docDirDiagnostics, loadDocDir } from "../doc-dir/load.ts";
import type { Diagnostic, DocDir, DocDirServices } from "../doc-dir/types.ts";
import { type DevState, handleExplainRequest } from "./api.ts";
import { viewerImportGuard, viewerRoot } from "./viewer.ts";

export class DevServerFailed extends Schema.TaggedError<DevServerFailed>()("DevServerFailed", {
  message: Schema.String,
}) {}

export const serveDocDir = Effect.fnUntraced(function* (
  initial: DocDir,
  listen: { readonly port: number; readonly strictPort: boolean; readonly open: string },
  printDiagnostics: (
    diagnostics: ReadonlyArray<Diagnostic>,
  ) => Effect.Effect<void, never, DocDirServices>,
) {
  const path = yield* Path.Path;
  const run = Effect.runPromiseWith(yield* Effect.context<DocDirServices>());
  const viewer = yield* viewerRoot;
  const { root } = initial;
  const lock = yield* Semaphore.make(1);
  const changes = yield* Queue.unbounded<string>();
  let state: DevState = { status: "ok", docDir: initial };

  const reload = Effect.fnUntraced(function* (server: ViteDevServer) {
    const next = yield* lock.withPermit(
      loadDocDir(root).pipe(
        Effect.map((docDir): DevState => ({ status: "ok", docDir })),
        Effect.catchTag("PlatformError", (error) =>
          Effect.succeed<DevState>({
            status: "invalid",
            errors: [{ file: ".", line: 1, column: 1, message: error.message }],
          }),
        ),
        Effect.tap((next) =>
          Effect.sync(() => {
            state = next;
          }),
        ),
      ),
    );
    yield* printDiagnostics(next.status === "ok" ? docDirDiagnostics(next.docDir) : next.errors);
    server.ws.send({ type: "full-reload" });
  });

  const plugin: Plugin = {
    name: "explain",
    configureServer(server) {
      server.watcher.add(root);
      server.watcher.on("all", (event, file) => {
        if (
          (event === "add" || event === "change" || event === "unlink") &&
          (file === root || file.startsWith(`${root}${path.sep}`))
        ) {
          Queue.offerUnsafe(changes, file);
        }
      });
      server.middlewares.use((req, res, next) => {
        const rawPath = (req.url ?? "/").split("?")[0] ?? "/";
        if (rawPath.startsWith("/@explain/")) {
          run(
            lock
              .withPermit(Effect.sync(() => state))
              .pipe(
                Effect.flatMap((current) =>
                  handleExplainRequest(current, req.method ?? "GET", rawPath),
                ),
              ),
          ).then((response) => {
            res.writeHead(response.status, response.headers);
            res.end(response.body);
          }, next);
          return;
        }
        const [, first, ...rest] = rawPath.split("/");
        if (
          req.method === "GET" &&
          req.headers.accept?.includes("text/html") &&
          rest.length === 0 &&
          (first === "" || (first !== undefined && pageIdPattern.test(first)))
        ) {
          req.url = "/index.html";
        }
        next();
      });
    },
  };

  const server = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => {
        const server = await createServer({
          configFile: false,
          root: viewer,
          appType: "spa",
          clearScreen: false,
          server: { ...listen, host: "127.0.0.1" },
          plugins: [viewerImportGuard(viewer, path.sep), plugin],
        });
        try {
          await server.listen();
        } catch (error) {
          await server.close();
          throw error;
        }
        return server;
      },
      catch: (cause) =>
        new DevServerFailed({ message: cause instanceof Error ? cause.message : String(cause) }),
    }),
    (server) => Effect.promise(() => server.close()),
  );

  yield* Effect.forkScoped(
    Stream.fromQueue(changes).pipe(
      Stream.debounce("100 millis"),
      Stream.runForEach(() => reload(server)),
    ),
  );
  const url = server.resolvedUrls?.local[0];
  if (url === undefined)
    return yield* new DevServerFailed({ message: "vite reported no local URL" });
  return url;
});
