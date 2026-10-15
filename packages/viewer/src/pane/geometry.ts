import type { Anchor } from "./model.ts";

export const splitQuery = "(min-width: 1080px)";

export const readingLine = 0.4;
export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

export const isSplit = () => matchMedia(splitQuery).matches;

export const scrollBehavior = (): ScrollBehavior => (reducedMotion.matches ? "auto" : "smooth");

export const isVisible = (anchor: Anchor): boolean =>
  anchor.el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }) &&
  anchor.el.closest("[hidden]") === null;

export const readingAnchor = (list: ReadonlyArray<Anchor>): Anchor | null => {
  const line = innerHeight * readingLine;
  let best: Anchor | null = null;
  for (const anchor of list) {
    if (anchor.el.getBoundingClientRect().top <= line) best = anchor;
    else break;
  }
  return best ?? list[0] ?? null;
};
