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

export const parseRoute = (pathname: string): Route => {
  const segments = pathname
    .split("/")
    .filter((part) => part !== "")
    .map(decodeURIComponent);
  const [locale, id, repo, ...path] = segments;
  if (locale === undefined) return { kind: "home", locale: null };
  if (id === undefined) return { kind: "home", locale };
  if (id === "source" && repo !== undefined && path.length > 0) {
    return { kind: "source", locale, repo, path: path.join("/") };
  }
  if (repo === undefined) return { kind: "page", locale, id };
  return { kind: "unknown", path: pathname };
};

export const pageHref = (locale: string, id: string, anchor?: string | null): string =>
  `/${encodeURIComponent(locale)}/${encodeURIComponent(id)}${anchor ? `#${encodeURIComponent(anchor)}` : ""}`;

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
  useSyncExternalStore(subscribe, () => location.pathname + location.hash);

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
    if (url.pathname === location.pathname && url.hash !== "") return;
    event.preventDefault();
    navigate(url.pathname + url.hash);
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
};
