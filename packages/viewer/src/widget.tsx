import type { Block } from "@explain/contract/page";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useViewer } from "./context.ts";
import { loadSourceLines } from "./data.ts";
import { Inlines } from "./inlines.tsx";
import { citedLines, formatRef, parseRef, sourceHref } from "./ref.ts";

type WidgetBlock = Extract<Block, { readonly type: "widget" }>;

interface WidgetContext {
  readonly props: Readonly<Record<string, string>>;
  readonly locale: string;
  readonly cite: (ref: string, label?: string) => HTMLElement;
  readonly readSource: (ref: string) => Promise<string>;
}

type Mount = (root: HTMLElement, ctx: WidgetContext) => (() => void) | undefined;

const isMount = (value: unknown): value is Mount => typeof value === "function";

const ensureStylesheet = (name: string) => {
  const href = `/@explain/widgets/${name}.css`;
  if (document.head.querySelector(`link[data-widget="${name}"]`) !== null) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.widget = name;
  document.head.append(link);
};

export function WidgetFrame({ block }: { readonly block: WidgetBlock }): ReactNode {
  const { site, locale, strings } = useViewer();
  const titleId = useId();
  const body = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const entry = site.widgets[block.name];
  const propsKey = JSON.stringify(block.props);

  useEffect(() => {
    const root = body.current;
    if (root === null) return;
    if (entry === undefined) {
      setFailure(`widgets/${block.name}.js`);
      return;
    }
    if (entry.css) ensureStylesheet(block.name);
    const ctx: WidgetContext = {
      props: JSON.parse(propsKey) as Readonly<Record<string, string>>,
      locale,
      cite: (text, label) => {
        const ref = parseRef(text);
        const link = document.createElement("a");
        link.className = "cite";
        link.href = ref === undefined ? "#" : sourceHref(locale, ref);
        link.dataset.ref = text;
        link.dataset.kind = ref !== undefined && ref.ranges.length === 0 ? "file" : "cite";
        link.dataset.follow = "0";
        link.textContent = label ?? text;
        return link;
      },
      readSource: async (text) => {
        const ref = parseRef(text);
        if (ref === undefined) throw new Error(`invalid citation ${text}`);
        const lines = await loadSourceLines(ref.repo, ref.path);
        if (lines.status === "missing") throw new Error(strings.fileGone(ref.path));
        return citedLines(ref, lines.raw);
      },
    };
    let live = true;
    let cleanup: (() => void) | undefined;
    setFailure(null);
    import(/* @vite-ignore */ `/@explain/widgets/${block.name}.js`)
      .then((module: { readonly mount?: unknown }) => {
        if (!live) return;
        if (!isMount(module.mount)) throw new Error("the module does not export mount(root, ctx)");
        const result = module.mount(root, ctx);
        if (typeof result === "function") cleanup = result;
      })
      .catch((error: unknown) => {
        if (live) setFailure(error instanceof Error ? error.message : String(error));
      });
    return () => {
      live = false;
      cleanup?.();
      root.replaceChildren();
    };
  }, [block.name, entry, locale, propsKey, strings]);

  return (
    <section className="widget-frame" aria-labelledby={titleId}>
      <header className="widget-head">
        <h3 className="widget-title" id={titleId}>
          {block.title}
        </h3>
        <p className="widget-desc">
          <Inlines inlines={block.children} />
        </p>
        <p className="widget-sources">
          <span className="widget-sources-label">{strings.widgetSources}</span>
          {block.sources.map((ref) => {
            const key = formatRef(ref);
            return (
              <a
                key={key}
                className="cite"
                href={sourceHref(locale, ref)}
                data-ref={key}
                data-kind={ref.ranges.length === 0 ? "file" : "cite"}
                data-follow="0"
              >
                {key.slice(ref.repo.length + 1)}
              </a>
            );
          })}
        </p>
      </header>
      {failure !== null && (
        <p className="err" role="alert">
          {strings.widgetFailed(block.name)}: {failure}
        </p>
      )}
      <div className="widget-body" ref={body} />
    </section>
  );
}
