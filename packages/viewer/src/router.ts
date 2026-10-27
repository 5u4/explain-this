import { useSyncExternalStore } from "react";

export type Route =
  | { readonly kind: "home" }
  | { readonly kind: "page"; readonly id: string }
  | { readonly kind: "unknown"; readonly path: string };

export const parseRoute = (pathname: string, search: string): Route => {
  const segments = pathname
    .split("/")
    .filter((part) => part !== "")
    .map(decodeURIComponent);
  const [id, ...rest] = segments;
  if (id === undefined) return { kind: "home" };
  if (rest.length > 0) return { kind: "unknown", path: pathname + search };
  return { kind: "page", id };
};

export const pageHref = (id: string, anchor?: string | null): string =>
  `/${encodeURIComponent(id)}${anchor ? `#${encodeURIComponent(anchor)}` : ""}`;

type Redirect = (pathname: string, search: string) => string | null;

const listeners = new Set<() => void>();
let redirect: Redirect = () => null;

const settle = () => {
  const to = redirect(location.pathname, location.search);
  if (to !== null) history.replaceState(history.state, "", to);
  page = location.pathname + location.search;
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

type Entry = { readonly key: string; readonly scrollY?: number };

const readEntry = (state: unknown): Entry | null => {
  if (typeof state !== "object" || state === null) return null;
  if (!("key" in state) || typeof state.key !== "string") return null;
  return "scrollY" in state && typeof state.scrollY === "number" && Number.isFinite(state.scrollY)
    ? { key: state.key, scrollY: state.scrollY }
    : { key: state.key };
};

const offsets = new Map<string, number>();
let current = "";
let page = "";
let release = () => {};

const enter = () => {
  current = Math.random().toString(36).slice(2);
  history.replaceState({ key: current }, "");
};

const readingOffset = () => {
  const target = offsets.get(current);
  const end = document.documentElement.scrollHeight - innerHeight;
  return target !== undefined && target > end && scrollY >= end - 1 ? target : scrollY;
};

const remember = () => {
  const top = readingOffset();
  offsets.set(current, top);
  history.replaceState({ key: current, scrollY: top }, "");
};

const intents = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

const holdScroll = (key: string, top: number): (() => void) => {
  const observer = new ResizeObserver(() => scrollTo(0, top));
  const stop = () => {
    observer.disconnect();
    clearTimeout(timer);
    for (const type of intents) removeEventListener(type, cancel, true);
  };
  const cancel = () => {
    offsets.delete(key);
    stop();
  };
  const timer = setTimeout(() => observer.disconnect(), 10_000);
  for (const type of intents) addEventListener(type, cancel, { capture: true, passive: true });
  scrollTo(0, top);
  observer.observe(document.documentElement);
  return stop;
};

export const revealEntry = (): (() => void) => {
  release();
  release = () => {};
  const offset = offsets.get(current) ?? readEntry(history.state)?.scrollY;
  if (offset !== undefined) {
    offsets.set(current, offset);
    release = holdScroll(current, offset);
  } else if (location.hash === "") scrollTo(0, 0);
  else document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  return release;
};

const onClick = (event: MouseEvent) => {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement) || anchor.target !== "") return;
  const url = new URL(anchor.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/@")) return;
  remember();
  if (url.pathname === location.pathname && url.search === location.search && url.hash !== "") {
    return;
  }
  event.preventDefault();
  release();
  current = Math.random().toString(36).slice(2);
  history.pushState({ key: current }, "", url.pathname + url.search + url.hash);
  settle();
};

const onPopState = () => {
  release();
  const entry = readEntry(history.state);
  if (entry === null) {
    enter();
    settle();
    return;
  }
  offsets.set(current, readingOffset());
  current = entry.key;
  const samePage = location.pathname + location.search === page;
  settle();
  if (samePage) revealEntry();
};

const onHashChange = () => {
  if (readEntry(history.state) !== null) return;
  enter();
  settle();
};

export const startRouter = (resolve: Redirect) => {
  redirect = resolve;
  history.scrollRestoration = "manual";
  const entry = readEntry(history.state);
  if (entry === null) enter();
  else current = entry.key;
  addEventListener("popstate", onPopState);
  addEventListener("hashchange", onHashChange);
  addEventListener("pagehide", remember);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") remember();
  });
  document.addEventListener("click", onClick);
  settle();
};
