import type { TocEntry } from "@explain/contract/page";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SearchIndex, SourceEntry } from "./api.ts";
import { type Site, useViewer, type Viewer, ViewerContext } from "./context.ts";
import { loadSearch } from "./data.ts";
import { icons } from "./icons.tsx";
import { PaneController } from "./pane.ts";
import { pageHref } from "./router.ts";
import { SourcePane } from "./source-pane.tsx";
import { stringsFor } from "./strings.ts";

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

function Rail({
  current,
  toc,
  onOpenSearch,
  onNavigate,
}: {
  readonly current: string | null;
  readonly toc: ReadonlyArray<TocEntry>;
  readonly onOpenSearch: () => void;
  readonly onNavigate: () => void;
}): ReactNode {
  const { site, locale, strings } = useViewer();
  const localeSite = site.byLocale[locale];
  const sections = toc.filter((entry) => entry.depth === 2);
  const spied = useScrollSpy(sections);
  if (localeSite === undefined) return <nav className="rail" id="rail" />;
  const tocList = (id: string) =>
    id === current &&
    sections.length > 0 && (
      <ol className="toc" aria-label={strings.tocLabel}>
        {sections.map((entry) => (
          <li key={entry.id}>
            <a href={`#${entry.id}`} aria-current={entry.id === spied ? "true" : undefined}>
              {entry.text}
            </a>
          </li>
        ))}
      </ol>
    );
  return (
    <nav
      className="rail"
      id="rail"
      aria-label={strings.navLabel}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a") !== null) onNavigate();
      }}
    >
      <div className="rail-inner">
        <a className="brand" href={homeHref(site, locale)}>
          <span className="brand-mark" aria-hidden="true">
            {strings.brandMark}
          </span>
          <span>{site.title}</span>
        </a>
        <button type="button" className="search-trigger" onClick={onOpenSearch}>
          {icons.search}
          <span>{strings.searchSite}</span>
          <kbd>⌘K</kbd>
        </button>
        {localeSite.nav.map((group) => (
          <section className="nav-section" key={group.title}>
            <h2 className="nav-group">{group.title}</h2>
            <ul>
              {group.pages.map((page) => (
                <li key={page.id} className={page.status === "missing" ? "unbuilt" : undefined}>
                  <a
                    href={pageHref(locale, page.id)}
                    aria-current={page.id === current ? "page" : undefined}
                  >
                    {page.title}
                    {page.status !== "fresh" && page.status !== "missing" && (
                      <span
                        className="nav-flag"
                        data-status={page.status}
                        title={page.status === "stale" ? strings.stale : strings.pageErrors(1)}
                      />
                    )}
                  </a>
                  {tocList(page.id)}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="rail-foot">
          <span>{locale}</span>
          {site.locales.length > 1 && (
            <nav className="locale-switch" aria-label={strings.language}>
              {site.locales.map((other) => (
                <a
                  key={other}
                  lang={other}
                  href={current === null ? homeHref(site, other) : pageHref(other, current)}
                  aria-current={other === locale ? "true" : undefined}
                >
                  {other}
                </a>
              ))}
            </nav>
          )}
        </div>
      </div>
    </nav>
  );
}

const useScrollSpy = (sections: ReadonlyArray<TocEntry>): string | null => {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);
  useEffect(() => {
    if (sections.length === 0) return;
    const onScroll = () => {
      let current = sections[0]?.id ?? null;
      for (const entry of sections) {
        const element = document.getElementById(entry.id);
        if (element !== null && element.getBoundingClientRect().top < innerHeight * 0.3) {
          current = entry.id;
        }
      }
      setActive(current);
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, [sections]);
  return active;
};

interface Hit {
  readonly href: string;
  readonly where: string;
  readonly before: string;
  readonly match: string;
  readonly after: string;
}

const searchHits = (index: SearchIndex, query: string): ReadonlyArray<Hit> => {
  const needle = query.toLowerCase();
  return index
    .flatMap((entry) => {
      const haystack = `${entry.heading} ${entry.text}`;
      const at = haystack.toLowerCase().indexOf(needle);
      if (at < 0) return [];
      const start = Math.max(0, at - 24);
      return [
        {
          href: `/${encodeURIComponent(entry.page)}${entry.anchor === null ? "" : `#${encodeURIComponent(entry.anchor)}`}`,
          where:
            entry.heading === entry.pageTitle
              ? entry.pageTitle
              : `${entry.pageTitle} › ${entry.heading}`,
          before: `${start > 0 ? "…" : ""}${haystack.slice(start, at)}`,
          match: haystack.slice(at, at + needle.length),
          after: `${haystack.slice(at + needle.length, at + needle.length + 48)}…`,
        },
      ];
    })
    .slice(0, 12);
};

function SearchDialog({
  open,
  onOpen,
  onClose,
}: {
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const { locale, strings } = useViewer();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchIndex | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof Element && event.target.closest("input, textarea, select") !== null;
      if (
        (event.key === "k" && (event.metaKey || event.ctrlKey)) ||
        (event.key === "/" && !typing)
      ) {
        event.preventDefault();
        onOpen();
      }
    };
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, [onOpen]);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (open && !element.open) {
      setQuery("");
      element.showModal();
      input.current?.focus();
      loadSearch(locale).then(setIndex, () => setIndex([]));
    } else if (!open && element.open) element.close();
  }, [open, locale]);

  const trimmed = query.trim();
  const hits = index === null || trimmed === "" ? [] : searchHits(index, trimmed);

  return (
    <dialog
      ref={dialog}
      className="search"
      aria-label={strings.searchSite}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
        else if (event.target instanceof Element && event.target.closest(".search-results a")) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        const links = [
          ...(dialog.current?.querySelectorAll<HTMLElement>(".search-results a") ?? []),
        ];
        if ((event.key !== "ArrowDown" && event.key !== "ArrowUp") || links.length === 0) return;
        event.preventDefault();
        const active = document.activeElement;
        const at = active instanceof HTMLElement ? links.indexOf(active) : -1;
        const next =
          event.key === "ArrowDown"
            ? links[Math.min(links.length - 1, at + 1)]
            : at <= 0
              ? input.current
              : links[at - 1];
        next?.focus();
      }}
    >
      <form method="dialog" className="search-box" onSubmit={(event) => event.preventDefault()}>
        {icons.search}
        <label className="sr" htmlFor="search-query">
          {strings.search}
        </label>
        <input
          ref={input}
          id="search-query"
          type="search"
          placeholder={strings.searchPlaceholder}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd>esc</kbd>
      </form>
      <div className="search-results" role="region" aria-live="polite">
        {trimmed === "" ? null : index === null ? (
          <p className="search-hint">{strings.searchIndexing}</p>
        ) : hits.length === 0 ? (
          <p className="search-empty">{strings.searchEmpty(trimmed)}</p>
        ) : (
          <ol>
            {hits.map((hit) => (
              <li key={hit.href + hit.before}>
                <a href={`/${encodeURIComponent(locale)}${hit.href}`}>
                  <span className="hit-where">{hit.where}</span>
                  <span className="hit-snip">
                    {hit.before}
                    <mark>{hit.match}</mark>
                    {hit.after}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>
    </dialog>
  );
}
