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

type Redirect = (pathname: string, search: string) => string | null;

const listeners = new Set<() => void>();
let redirect: Redirect = () => null;

const settle = () => {
  const to = redirect(location.pathname, location.search);
  if (to !== null) history.replaceState(null, "", to);
  for (const listener of listeners) listener();
};

export const subscribeLocation = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useLocation = (): string =>
  useSyncExternalStore(
    subscribeLocation,
    () => location.pathname + location.search + location.hash,
  );

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
  history.pushState(null, "", url.pathname + url.search + url.hash);
  settle();
};

export const startRouter = (resolve: Redirect) => {
  redirect = resolve;
  addEventListener("popstate", settle);
  document.addEventListener("click", onClick);
  settle();
};
