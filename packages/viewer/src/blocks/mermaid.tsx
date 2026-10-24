import type { Mounted, MountOptions } from "pele/lazy";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { useViewer } from "../context.ts";

export function Mermaid({ source }: { readonly source: string }): ReactNode {
  const { strings } = useViewer();
  const live = useRef<{ element: HTMLDivElement; handle: Promise<Mounted | undefined> }>(undefined);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const kind = /^\s*([\w-]+)/.exec(source)?.[1] ?? "";

  const attach = useCallback(
    (element: HTMLDivElement) => {
      const fail = (error: unknown): undefined => {
        setFailure(error instanceof Error ? error.message : String(error));
      };
      const options: MountOptions = {
        zoom: "auto",
        onError: fail,
        onRender: () => setFailure(undefined),
      };
      const previous = live.current;
      const mount = (): Promise<Mounted | undefined> =>
        // Loaded on demand so pages without diagrams keep pele's core out of the entry chunk.
        import("pele/lazy")
          .then(({ mountAsync }) => mountAsync(element, source, options))
          .catch(fail);
      const handle =
        previous?.element === element
          ? previous.handle.then(async (mounted) => {
              if (mounted === undefined) return mount();
              await import("pele/lazy")
                .then(({ detectType, load }) => load(detectType(source)))
                .catch(fail);
              mounted.update(source);
              return mounted;
            })
          : mount();
      live.current = { element, handle };
      return () => {
        // React runs this cleanup before reattaching on a source change; only a real unmount destroys.
        queueMicrotask(() => {
          if (live.current?.handle !== handle) return;
          live.current = undefined;
          void handle.then((mounted) => mounted?.destroy());
        });
      };
    },
    [source],
  );

  return (
    <figure className="diagram" data-kind={kind}>
      <div ref={attach} className="diagram-canvas" role="group" aria-label={kind} />
      {failure !== undefined && (
        <div className="err">
          {strings.diagramFailed}: {failure}
          <details>
            <summary>{strings.diagramSource}</summary>
            <pre>{source}</pre>
          </details>
        </div>
      )}
    </figure>
  );
}
