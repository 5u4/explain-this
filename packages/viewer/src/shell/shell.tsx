import type { TocEntry } from "@explain/contract/page";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { type Site, type Viewer, ViewerContext } from "../context.ts";
import { strings } from "../i18n/strings.ts";
import { icons } from "../icons.tsx";
import { PaneController } from "../pane/controller.ts";
import { SourcePane } from "../pane/source-pane.tsx";
import { pageHref, revealEntry } from "../router.ts";
import { Rail } from "./rail.tsx";

export const homeHref = (site: Site): string => {
  const ids = site.nav.flatMap((group) => group.pages.map((page) => page.id));
  const id = ids.includes("index") ? "index" : ids[0];
  return id === undefined ? "/" : pageHref(id);
};

const revealPage = () => {
  const release = revealEntry();
  document.body.classList.add("ready");
  return () => {
    release();
    document.body.classList.remove("ready");
  };
};

export function Shell({
  site,
  current,
  title,
  toc = [],
  pane = false,
  children,
}: {
  readonly site: Site;
  readonly current: string | null;
  readonly title: string | null;
  readonly toc?: ReadonlyArray<TocEntry>;
  readonly pane?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const [controller, setController] = useState<PaneController | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  const status = useCallback((message: string) => {
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);
  const viewer = useMemo<Viewer>(() => ({ site, strings, status }), [site, status]);
  const startPane = useCallback((main: HTMLElement) => {
    const next = new PaneController(main);
    setController(next);
    const stop = next.start();
    return () => {
      stop();
      setController(null);
    };
  }, []);

  return (
    <ViewerContext value={viewer}>
      <title>{title === null ? site.title : `${title} · ${site.title}`}</title>
      <a className="skip" href="#main">
        {strings.skip}
      </a>
      <div
        ref={revealPage}
        className={`shell${pane ? "" : " no-pane"}${drawerOpen ? " drawer-open" : ""}`}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !drawerOpen) return;
          setDrawerOpen(false);
          menuButton.current?.focus();
        }}
      >
        <header className="topbar">
          <button
            ref={menuButton}
            type="button"
            className="icon-btn menu-btn"
            aria-label={strings.openNav}
            aria-expanded={drawerOpen}
            aria-controls="rail"
            onClick={() => {
              if (!drawerOpen)
                document.querySelector<HTMLElement>(".rail a[aria-current]")?.focus();
              setDrawerOpen(!drawerOpen);
            }}
          >
            {icons.menu}
          </button>
          <a className="brand" href={homeHref(site)}>
            <span>{site.title}</span>
          </a>
        </header>
        <Rail current={current} toc={toc} onNavigate={() => setDrawerOpen(false)} />
        <main
          id="main"
          className="prose-col"
          tabIndex={-1}
          inert={drawerOpen}
          ref={pane ? startPane : undefined}
        >
          {children}
        </main>
        {pane &&
          (controller === null ? (
            <aside className="pane" aria-label={strings.pane} />
          ) : (
            <SourcePane controller={controller} />
          ))}
        <div className="drawer-scrim" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
      </div>
      <div className="sr" role="status">
        {announcement}
      </div>
    </ViewerContext>
  );
}
