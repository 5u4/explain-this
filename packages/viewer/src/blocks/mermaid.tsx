import { type ReactNode, Suspense, use } from "react";
import { useViewer } from "../context.ts";

type Diagram =
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

const diagrams = new Map<string, Promise<Diagram>>();

const renderDiagram = (source: string): Promise<Diagram> => {
  const cached = diagrams.get(source);
  if (cached !== undefined) return cached;
  const rendering = import("beautiful-mermaid")
    .then(
      (mermaid): Diagram => ({
        status: "ready",
        svg: mermaid
          .renderMermaidSVG(source, theme)
          .replace(/@import url\([^)]*\);/g, "")
          .replace(
            /'Inter', system-ui, sans-serif/g,
            "Inter, 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
          ),
        kind: /^\s*([\w-]+)/.exec(source)?.[1] ?? "",
      }),
    )
    .catch((error: unknown): Diagram => ({ status: "failed", message: String(error) }));
  diagrams.set(source, rendering);
  return rendering;
};

export function Mermaid({ source }: { readonly source: string }): ReactNode {
  return (
    <Suspense fallback={<figure className="diagram" />}>
      <RenderedMermaid source={source} />
    </Suspense>
  );
}

function RenderedMermaid({ source }: { readonly source: string }): ReactNode {
  const { strings } = useViewer();
  const diagram = use(renderDiagram(source));
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
