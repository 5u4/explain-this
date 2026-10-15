import { useSyncExternalStore } from "react";

export type Route =
  | { readonly kind: "home"; readonly locale: string | null }
  | { readonly kind: "page"; readonly locale: string; readonly id: string }
  | {
      readonly kind: "source";
      readonly locale: string;
      readonly repo: string;
      readonly path: string;
    }
  | { readonly kind: "unknown"; readonly path: string };

export const parseRoute = (pathname: string, search: string): Route => {
  const segments = pathname
    .split("/")
    .filter((part) => part !== "")
    .map(decodeURIComponent);
  const [locale, id, ...rest] = segments;
  if (locale === undefined) return { kind: "home", locale: null };
  if (id === undefined) return { kind: "home", locale };
  if (rest.length > 0) return { kind: "unknown", path: pathname + search };
  if (id !== "source") return { kind: "page", locale, id };
  const [repo, ...path] = search.slice(1).split("/").map(decodeURIComponent);
  if (repo === undefined || repo === "" || path.length === 0) {
    return { kind: "unknown", path: pathname + search };
  }
  return { kind: "source", locale, repo, path: path.join("/") };
};

export const pageHref = (locale: string, id: string, anchor?: string | null): string =>
  `/${encodeURIComponent(locale)}/${encodeURIComponent(id)}${anchor ? `#${encodeURIComponent(anchor)}` : ""}`;

export const sourceRouteHref = (locale: string, repo: string, path: string): string =>
  `/${encodeURIComponent(locale)}/source?${encodeURIComponent(repo)}/${path.split("/").map(encodeURIComponent).join("/")}`;

const routeEvent = "explain:route";

const subscribe = (listener: () => void) => {
  addEventListener("popstate", listener);
  addEventListener(routeEvent, listener);
  return () => {
    removeEventListener("popstate", listener);
    removeEventListener(routeEvent, listener);
  };
};

export const useLocation = (): string =>
  useSyncExternalStore(subscribe, () => location.pathname + location.search + location.hash);

export const navigate = (href: string, options?: { readonly replace?: boolean }) => {
  if (options?.replace === true) history.replaceState(null, "", href);
  else history.pushState(null, "", href);
  dispatchEvent(new Event(routeEvent));
};

export const interceptLinks = (): (() => void) => {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(anchor instanceof HTMLAnchorElement) || anchor.target !== "") return;
    const url = new URL(anchor.href);
    if (url.origin !== location.origin || url.pathname.startsWith("/@")) return;
    const here = url.pathname === location.pathname && url.search === location.search;
    if (here && url.hash !== "") return;
    event.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
};
