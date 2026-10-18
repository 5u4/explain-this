import type { TocEntry } from "@explain/contract/page";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import type { SourceEntry } from "../api.ts";
import { type Site, type Viewer, ViewerContext } from "../context.ts";
import { stringsFor } from "../i18n/strings.ts";
import { icons } from "../icons.tsx";
import { PaneController } from "../pane/controller.ts";
import { SourcePane } from "../pane/source-pane.tsx";
import { pageHref, savedScroll } from "../router.ts";
import { Rail } from "./rail.tsx";
import { SearchDialog } from "./search-dialog.tsx";
import { openSearch } from "./search-opener.ts";

export const homeHref = (site: Site, locale: string): string => {
  const ids =
    site.byLocale[locale]?.nav.flatMap((group) => group.pages.map((page) => page.id)) ?? [];
  const id = ids.includes("index") ? "index" : ids[0];
  return id === undefined ? `/${encodeURIComponent(locale)}` : pageHref(locale, id);
};

const revealPage = () => {
  const saved = savedScroll();
  if (saved !== null) scrollTo(0, saved);
  else if (location.hash === "") scrollTo(0, 0);
  else document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  document.body.classList.add("ready");
  return () => document.body.classList.remove("ready");
};

export function Shell({
  site,
  locale,
  current,
  title,
  toc = [],
  sources = [],
  pane = false,
  children,
}: {
  readonly site: Site;
  readonly locale: string;
  readonly current: string | null;
  readonly title: string | null;
  readonly toc?: ReadonlyArray<TocEntry>;
  readonly sources?: ReadonlyArray<SourceEntry>;
  readonly pane?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const strings = stringsFor(locale);
  const [controller, setController] = useState<PaneController | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  const status = useCallback((message: string) => {
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);
  const viewer = useMemo<Viewer>(
    () => ({ site, locale, strings, sources, status }),
    [site, locale, strings, sources, status],
  );
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
          <a className="brand" href={homeHref(site, locale)}>
            <span>{site.title}</span>
          </a>
          <button
            type="button"
            className="icon-btn search-btn-top"
            aria-label={strings.search}
            onClick={openSearch}
          >
            {icons.search}
          </button>
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
      <SearchDialog />
      <div className="sr" role="status">
        {announcement}
      </div>
    </ViewerContext>
  );
}
