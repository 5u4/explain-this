import type { TocEntry } from "@explain/contract/page";
import { type ReactNode, useSyncExternalStore } from "react";
import { useViewer } from "../context.ts";
import { icons } from "../icons.tsx";
import { pageHref } from "../router.ts";
import { openSearch } from "./search-opener.ts";
import { homeHref } from "./shell.tsx";

export function Rail({
  current,
  toc,
  onNavigate,
}: {
  readonly current: string | null;
  readonly toc: ReadonlyArray<TocEntry>;
  readonly onNavigate: () => void;
}): ReactNode {
  const { site, locale, strings } = useViewer();
  const localeSite = site.byLocale[locale];
  const sections = toc.filter((entry) => entry.depth === 2);
  const spied = useSyncExternalStore(subscribeScroll, () => {
    let active = sections[0]?.id ?? null;
    for (const entry of sections) {
      const element = document.getElementById(entry.id);
      if (element !== null && element.getBoundingClientRect().top < innerHeight * 0.3) {
        active = entry.id;
      }
    }
    return active;
  });
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
      tabIndex={-1}
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
        <button type="button" className="search-trigger" onClick={openSearch}>
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

const subscribeScroll = (listener: () => void) => {
  addEventListener("scroll", listener, { passive: true });
  return () => removeEventListener("scroll", listener);
};
