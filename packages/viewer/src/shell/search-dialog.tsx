import { type ReactNode, useEffect, useRef, useState } from "react";
import type { SearchIndex } from "../api.ts";
import { useViewer } from "../context.ts";
import { loadSearch } from "../data.ts";
import { icons } from "../icons.tsx";

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

export function SearchDialog({
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
