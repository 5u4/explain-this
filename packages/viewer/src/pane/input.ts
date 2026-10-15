import { isSplit } from "./geometry.ts";
import type { Anchor, PaneEvent, PaneMode } from "./model.ts";

export interface PaneInput {
  readonly main: HTMLElement;
  readonly byElement: WeakMap<Element, Anchor>;
  readonly sheetOpen: () => boolean;
  readonly mode: () => PaneMode;
  readonly enter: (anchor: Anchor) => void;
  readonly leave: () => void;
  readonly dispatch: (event: PaneEvent) => void;
  readonly setSheet: (open: boolean, from?: HTMLElement) => void;
  readonly step: (direction: 1 | -1) => void;
  readonly arm: () => void;
  readonly update: () => void;
  readonly schedule: () => void;
}

const anchorFor = (
  byElement: WeakMap<Element, Anchor>,
  target: EventTarget | null,
): Anchor | undefined => {
  const el = target instanceof Element ? target.closest("[data-ref]") : null;
  return el === null ? undefined : byElement.get(el);
};

export const bindInput = (input: PaneInput): (() => void) => {
  const { main, byElement } = input;
  const onMouseOver = (event: MouseEvent) => {
    const anchor = anchorFor(byElement, event.target);
    if (anchor !== undefined) input.enter(anchor);
  };

  const onMouseOut = (event: MouseEvent) => {
    const anchor = anchorFor(byElement, event.target);
    if (anchor === undefined) return;
    if (event.relatedTarget instanceof Node && anchor.el.contains(event.relatedTarget)) return;
    input.leave();
  };

  const onFocusIn = (event: FocusEvent) => {
    const anchor = anchorFor(byElement, event.target);
    if (
      anchor !== undefined &&
      event.target instanceof Element &&
      event.target.matches(":focus-visible")
    ) {
      input.enter(anchor);
    }
  };

  const onFocusOut = (event: FocusEvent) => {
    if (anchorFor(byElement, event.target) !== undefined) input.leave();
  };

  const onClick = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    const anchor = anchorFor(byElement, event.target);
    if (anchor === undefined) return;
    event.preventDefault();
    if (isSplit()) {
      input.dispatch({ type: "toggle", anchor });
      return;
    }
    input.dispatch({ type: "pin", anchor });
    input.setSheet(true, anchor.el);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && input.sheetOpen()) {
      input.setSheet(false);
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest("input, textarea, select, dialog")
    ) {
      return;
    }
    if (event.key === "Escape" && input.mode().kind === "pinned" && !main.inert) {
      input.dispatch({ type: "resume" });
    }
    if (event.key === "]") input.step(1);
    if (event.key === "[") input.step(-1);
  };

  const onScroll = () => {
    input.arm();
    input.schedule();
  };

  const onResize = () => {
    if (isSplit() && input.sheetOpen()) input.setSheet(false);
    input.update();
    input.schedule();
  };

  main.addEventListener("mouseover", onMouseOver);
  main.addEventListener("mouseout", onMouseOut);
  main.addEventListener("focusin", onFocusIn);
  main.addEventListener("focusout", onFocusOut);
  main.addEventListener("click", onClick);
  addEventListener("keydown", onKeyDown);
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onResize);
  return () => {
    main.removeEventListener("mouseover", onMouseOver);
    main.removeEventListener("mouseout", onMouseOut);
    main.removeEventListener("focusin", onFocusIn);
    main.removeEventListener("focusout", onFocusOut);
    main.removeEventListener("click", onClick);
    removeEventListener("keydown", onKeyDown);
    removeEventListener("scroll", onScroll);
    removeEventListener("resize", onResize);
  };
};
