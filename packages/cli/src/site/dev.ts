import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import { loadDocRoot } from "../doc-root/load.ts";
import type { Diagnostic, DocRoot, DocRootServices } from "../doc-root/types.ts";
import { type DevState, handleExplainRequest } from "./api.ts";
import { viewerImportGuard, viewerRoot } from "./viewer.ts";

export class DevServerFailed extends Schema.TaggedError<DevServerFailed>()("DevServerFailed", {
  message: Schema.String,
}) {}

export const serveDocRoot = Effect.fnUntraced(function* (
  initial: DocRoot,
  listen: { readonly port: number; readonly strictPort: boolean },
  printDiagnostics: (
    diagnostics: ReadonlyArray<Diagnostic>,
  ) => Effect.Effect<void, never, DocRootServices>,
) {
  const path = yield* Path.Path;
  const run = Effect.runPromiseWith(yield* Effect.context<DocRootServices>());
  const viewer = yield* viewerRoot;
  const { root } = initial;
  const lock = yield* Semaphore.make(1);
  const changes = yield* Queue.unbounded<string>();
  let state: DevState = { status: "ok", docRoot: initial };
  let locales = initial.config.locales;
  let watched: ReadonlySet<string> = new Set([root, ...Object.values(initial.config.repos)]);

  const reload = Effect.fnUntraced(function* (server: ViteDevServer) {
    const next = yield* lock.withPermit(
      loadDocRoot(root).pipe(
        Effect.map((docRoot): DevState => ({ status: "ok", docRoot })),
        Effect.catchTags({
          InvalidConfig: (error) =>
            Effect.succeed<DevState>({ status: "invalid", root, errors: error.diagnostics }),
          PlatformError: (error) =>
            Effect.succeed<DevState>({
              status: "invalid",
              root,
              errors: [{ file: ".", line: 1, column: 1, message: error.message }],
            }),
        }),
        Effect.tap((next) =>
          Effect.sync(() => {
            state = next;
          }),
        ),
      ),
    );
    if (next.status === "ok") {
      locales = next.docRoot.config.locales;
      const repos = new Set([root, ...Object.values(next.docRoot.config.repos)]);
      server.watcher.unwatch([...watched].filter((directory) => !repos.has(directory)));
      server.watcher.add([...repos].filter((directory) => !watched.has(directory)));
      watched = repos;
    } else yield* printDiagnostics(next.errors);
    server.ws.send({ type: "full-reload" });
  });

  const plugin: Plugin = {
    name: "explain",
    configureServer(server) {
      server.watcher.add([...watched]);
      server.watcher.on("all", (event, file) => {
        if (
          (event === "add" || event === "change" || event === "unlink") &&
          [...watched].some(
            (directory) => file === directory || file.startsWith(`${directory}${path.sep}`),
          )
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
        const first = rawPath.split("/")[1] ?? "";
        if (
          req.method === "GET" &&
          req.headers.accept?.includes("text/html") &&
          (first === "" || locales.includes(first))
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
