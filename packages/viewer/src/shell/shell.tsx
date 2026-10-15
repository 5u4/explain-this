import type { TocEntry } from "@explain/contract/page";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SourceEntry } from "../api.ts";
import { type Site, type Viewer, ViewerContext } from "../context.ts";
import { stringsFor } from "../i18n/strings.ts";
import { icons } from "../icons.tsx";
import { PaneController } from "../pane/controller.ts";
import { SourcePane } from "../pane/source-pane.tsx";
import { pageHref } from "../router.ts";
import { Rail } from "./rail.tsx";
import { SearchDialog } from "./search-dialog.tsx";

export const homeHref = (site: Site, locale: string): string => {
  const ids =
    site.byLocale[locale]?.nav.flatMap((group) => group.pages.map((page) => page.id)) ?? [];
  const id = ids.includes("index") ? "index" : ids[0];
  return id === undefined ? `/${encodeURIComponent(locale)}` : pageHref(locale, id);
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
  const main = useRef<HTMLElement>(null);
  const [controller, setController] = useState<PaneController | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  const status = useCallback((message: string) => {
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);
  const viewer = useMemo<Viewer>(
    () => ({ site, locale, strings, sources, status }),
    [site, locale, strings, sources, status],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = title === null ? site.title : `${title} · ${site.title}`;
  }, [locale, title, site.title]);

  useEffect(() => {
    const target =
      location.hash === ""
        ? null
        : document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target === null) scrollTo(0, 0);
    else target.scrollIntoView();
    document.body.classList.add("ready");
    return () => document.body.classList.remove("ready");
  }, []);

  useEffect(() => {
    if (!pane || main.current === null) return;
    const next = new PaneController(main.current);
    setController(next);
    const stop = next.start();
    return () => {
      stop();
      setController(null);
    };
  }, [pane]);

  useEffect(() => {
    document.body.classList.toggle("drawer-open", drawerOpen);
    if (main.current !== null) main.current.inert = drawerOpen;
    if (drawerOpen) document.querySelector<HTMLElement>(".rail a[aria-current]")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !drawerOpen) return;
      setDrawerOpen(false);
      menuButton.current?.focus();
    };
    addEventListener("keydown", onKeyDown);
    return () => {
      removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("drawer-open");
      if (main.current !== null) main.current.inert = false;
    };
  }, [drawerOpen]);

  return (
    <ViewerContext value={viewer}>
      <a className="skip" href="#main">
        {strings.skip}
      </a>
      <div className={pane ? "shell" : "shell no-pane"}>
        <header className="topbar">
          <button
            ref={menuButton}
            type="button"
            className="icon-btn menu-btn"
            aria-label={strings.openNav}
            aria-expanded={drawerOpen}
            aria-controls="rail"
            onClick={() => setDrawerOpen(!drawerOpen)}
          >
            {icons.menu}
          </button>
          <a className="brand" href={homeHref(site, locale)}>
            <span className="brand-mark" aria-hidden="true">
              {strings.brandMark}
            </span>
            <span>{site.title}</span>
          </a>
          <button
            type="button"
            className="icon-btn search-btn-top"
            aria-label={strings.search}
            onClick={() => setSearchOpen(true)}
          >
            {icons.search}
          </button>
        </header>
        <Rail
          current={current}
          toc={toc}
          onOpenSearch={() => setSearchOpen(true)}
          onNavigate={() => setDrawerOpen(false)}
        />
        <main id="main" className="prose-col" tabIndex={-1} ref={main}>
          {children}
        </main>
        {pane &&
          (controller === null ? (
            <aside className="pane" aria-label={strings.pane} />
          ) : (
            <SourcePane controller={controller} />
          ))}
      </div>
      <div className="drawer-scrim" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
      <SearchDialog
        open={searchOpen}
        onOpen={() => setSearchOpen(true)}
        onClose={() => setSearchOpen(false)}
      />
      <div className="sr" role="status">
        {announcement}
      </div>
    </ViewerContext>
  );
}
