import { type ReactNode, useEffect, useState } from "react";
import { useViewer } from "./context.ts";

type Diagram =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly svg: string; readonly kind: string }
  | { readonly status: "failed"; readonly message: string };

const theme = {
  bg: "var(--surface-page)",
  fg: "var(--diagram-fg)",
  line: "var(--diagram-line)",
  accent: "var(--diagram-accent)",
  muted: "var(--diagram-muted)",
  surface: "var(--diagram-surface)",
  border: "var(--diagram-border)",
  font: "Inter",
  transparent: true,
  padding: 16,
  nodeSpacing: 28,
  layerSpacing: 44,
};

export function Mermaid({ source }: { readonly source: string }): ReactNode {
  const { strings } = useViewer();
  const [diagram, setDiagram] = useState<Diagram>({ status: "loading" });
  useEffect(() => {
    let live = true;
    import("beautiful-mermaid")
      .then((mermaid) => {
        const svg = mermaid
          .renderMermaidSVG(source, theme)
          .replace(/@import url\([^)]*\);/g, "")
          .replace(
            /'Inter', system-ui, sans-serif/g,
            "Inter, 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
          );
        if (live)
          setDiagram({ status: "ready", svg, kind: /^\s*([\w-]+)/.exec(source)?.[1] ?? "" });
      })
      .catch((error: unknown) => {
        if (live) setDiagram({ status: "failed", message: String(error) });
      });
    return () => {
      live = false;
    };
  }, [source]);
  return (
    <figure className="diagram" data-kind={diagram.status === "ready" ? diagram.kind : undefined}>
      {diagram.status === "ready" && (
        <div
          className="diagram-canvas"
          role="img"
          aria-label={diagram.kind}
          dangerouslySetInnerHTML={{ __html: diagram.svg }}
        />
      )}
      {diagram.status === "failed" && (
        <div className="err">
          {strings.diagramFailed}: {diagram.message}
          <details>
            <summary>{strings.diagramSource}</summary>
            <pre>{source}</pre>
          </details>
        </div>
      )}
    </figure>
  );
}
