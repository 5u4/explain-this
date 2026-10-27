import type { TocEntry } from "@explain/contract/page";
import { type ReactNode, useSyncExternalStore } from "react";
import { useViewer } from "../context.ts";
import { pageHref } from "../router.ts";
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
  const { site, strings } = useViewer();
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
        <a className="brand" href={homeHref(site)}>
          <span>{site.title}</span>
        </a>
        <ul className="nav-list">
          {site.nav.map((page) => (
            <li key={page.id}>
              <a href={pageHref(page.id)} aria-current={page.id === current ? "page" : undefined}>
                {page.title}
              </a>
              {tocList(page.id)}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

const subscribeScroll = (listener: () => void) => {
  addEventListener("scroll", listener, { passive: true });
  return () => removeEventListener("scroll", listener);
};
