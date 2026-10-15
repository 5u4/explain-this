import { discoverAnchors, noteMarkers } from "./anchors.ts";
import { isSplit, isVisible, readingAnchor, readingLine, scrollBehavior } from "./geometry.ts";
import { bindInput } from "./input.ts";
import { drawLeader } from "./leader.ts";
import {
  type Anchor,
  following,
  type PaneEvent,
  type PaneMode,
  type PaneState,
  transition,
} from "./model.ts";
import { bindSheetDrag } from "./sheet-drag.ts";

const settleDelay = 150;

export class PaneController {
  readonly #main: HTMLElement;
  #anchors: ReadonlyArray<Anchor> = [];
  readonly #byElement = new WeakMap<Element, Anchor>();
  #mode: PaneMode = following;
  #followed: Anchor | null = null;
  #hold: Anchor | null = null;
  #preview: Anchor | null = null;
  #settleTimer: number | undefined;
  #leaveTimer: number | undefined;
  #refreshFrame = 0;
  #leaderFrame = 0;
  #leaderUntil = 0;
  #pane: HTMLElement | null = null;
  #leader: SVGSVGElement | null = null;
  #leaderFor: Anchor | null = null;
  #sheetReturn: HTMLElement | null = null;
  #state: PaneState = {
    shown: null,
    mode: following,
    preview: false,
    position: -1,
    total: 0,
    notes: [],
    sheetOpen: false,
  };
  readonly #listeners = new Set<() => void>();

  constructor(main: HTMLElement) {
    this.#main = main;
  }

  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getState = () => this.#state;

  start(): () => void {
    const observer = new MutationObserver(this.#scheduleRefresh);
    observer.observe(this.#main, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden", "open", "data-ref"],
    });
    const unbind = bindInput({
      main: this.#main,
      byElement: this.#byElement,
      sheetOpen: () => this.#state.sheetOpen,
      mode: () => this.#mode,
      enter: (anchor) => this.#enter(anchor),
      leave: () => this.#leave(),
      dispatch: (event) => this.#dispatch(event),
      setSheet: (open, from) => this.setSheet(open, from),
      step: (direction) => this.step(direction),
      arm: () => this.#arm(),
      update: () => this.#update(),
      schedule: this.schedule,
    });
    this.#refresh();
    return () => {
      observer.disconnect();
      unbind();
      clearTimeout(this.#leaveTimer);
      clearTimeout(this.#settleTimer);
      cancelAnimationFrame(this.#refreshFrame);
      cancelAnimationFrame(this.#leaderFrame);
      if (this.#state.sheetOpen) this.setSheet(false);
    };
  }

  attach(pane: HTMLElement, leader: SVGSVGElement): () => void {
    this.#pane = pane;
    this.#leader = leader;
    const unbind = bindSheetDrag(
      pane,
      () => this.#state.sheetOpen,
      (open) => this.setSheet(open),
    );
    this.schedule();
    return () => {
      unbind();
      this.#pane = null;
      this.#leader = null;
    };
  }

  step(direction: 1 | -1) {
    const list = this.#followable();
    if (list.length === 0) return;
    const index = this.#state.shown === null ? -1 : list.indexOf(this.#state.shown);
    const next = list[Math.max(0, Math.min(list.length - 1, (index < 0 ? 0 : index) + direction))];
    if (next === undefined) return;
    this.#mode = transition(this.#mode, { type: "resume" });
    this.#preview = null;
    this.#followed = next;
    this.#hold = next;
    const top = scrollY + next.el.getBoundingClientRect().top - innerHeight * readingLine + 4;
    scrollTo({ top, behavior: scrollBehavior() });
    this.#arm();
    this.#render();
  }

  activateNote(key: string) {
    const anchor = this.#anchors.find((item) => item.kind === "note" && item.key === key);
    if (anchor === undefined) return;
    this.#dispatch({ type: "pin", anchor });
    anchor.el.scrollIntoView({ block: "center", behavior: scrollBehavior() });
    anchor.el.focus({ preventScroll: true });
  }

  resume() {
    this.#dispatch({ type: "resume" });
  }

  setSheet(open: boolean, from?: HTMLElement) {
    if (open && isSplit()) return;
    document.body.classList.toggle("sheet-open", open);
    this.#main.inert = open;
    const topbar = document.querySelector<HTMLElement>(".topbar");
    if (topbar !== null) topbar.inert = open;
    if (open) {
      this.#sheetReturn =
        from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      this.#pane?.querySelector<HTMLElement>(".sheet-close")?.focus({ preventScroll: true });
    } else {
      this.#pane?.style.removeProperty("--drag");
      this.#sheetReturn?.focus({ preventScroll: true });
    }
    this.#emit({ ...this.#state, sheetOpen: open });
  }

  readonly schedule = () => {
    this.#leaderUntil = performance.now() + 700;
    if (this.#leaderFrame !== 0) return;
    const tick = () => {
      this.#leaderFrame = 0;
      this.#drawLeader();
      if (performance.now() < this.#leaderUntil) this.#leaderFrame = requestAnimationFrame(tick);
    };
    this.#leaderFrame = requestAnimationFrame(tick);
  };

  readonly #scheduleRefresh = () => {
    if (this.#refreshFrame !== 0) return;
    this.#refreshFrame = requestAnimationFrame(() => {
      this.#refreshFrame = 0;
      this.#refresh();
    });
  };

  #refresh() {
    this.#anchors = discoverAnchors(this.#main, this.#byElement);
    const mode = this.#mode;
    if (mode.kind === "pinned" && !mode.anchor.el.isConnected) {
      const anchor = this.#anchors.find((item) => item.key === mode.anchor.key);
      this.#mode = transition(
        mode,
        anchor === undefined ? { type: "resume" } : { type: "pin", anchor },
      );
    }
    if (this.#preview !== null && !this.#preview.el.isConnected) this.#preview = null;
    if (this.#followed !== null && !this.#followed.el.isConnected) this.#followed = null;
    if (this.#hold !== null && !this.#hold.el.isConnected) this.#hold = null;
    this.#update();
    this.schedule();
  }

  #followable(): ReadonlyArray<Anchor> {
    return this.#anchors.filter((anchor) => anchor.follow && isVisible(anchor));
  }

  #arm() {
    clearTimeout(this.#settleTimer);
    this.#settleTimer = setTimeout(this.#settle, settleDelay);
  }

  readonly #settle = () => {
    this.#settleTimer = undefined;
    this.#update();
  };

  #rest() {
    this.#followed = this.#hold ?? readingAnchor(this.#followable());
    this.#hold = null;
  }

  #update() {
    if (this.#settleTimer !== undefined) return;
    this.#rest();
    this.#render();
  }

  #dispatch(event: PaneEvent) {
    const active = document.activeElement;
    const fromResume = active instanceof Element && active.closest(".pane-resume") !== null;
    this.#mode = transition(this.#mode, event);
    this.#preview = null;
    if (this.#settleTimer === undefined) this.#rest();
    this.#render();
    if (fromResume && this.#mode.kind === "follow") {
      this.#pane?.querySelector<HTMLElement>(".pane-state")?.focus({ preventScroll: true });
    }
  }

  #render() {
    const list = this.#followable();
    const pinned = this.#mode.kind === "pinned" ? this.#mode.anchor : null;
    const current = this.#state.shown?.el.isConnected === true ? this.#state.shown : null;
    const shown = this.#preview ?? pinned ?? this.#followed ?? current;
    const group = shown?.kind === "note" ? shown.el.closest(".annotated") : null;
    const notes =
      shown === this.#state.shown
        ? this.#state.notes
        : group === null || group === undefined
          ? []
          : noteMarkers(group);
    this.#emit({
      shown,
      mode: this.#mode,
      preview: this.#preview !== null,
      position: shown === null ? -1 : list.indexOf(shown),
      total: list.length,
      notes,
      sheetOpen: this.#state.sheetOpen,
    });
  }

  #emit(next: PaneState) {
    const previous = this.#state;
    if (
      previous.shown === next.shown &&
      previous.mode === next.mode &&
      previous.preview === next.preview &&
      previous.position === next.position &&
      previous.total === next.total &&
      previous.notes === next.notes &&
      previous.sheetOpen === next.sheetOpen
    ) {
      return;
    }
    if (previous.shown !== next.shown) {
      previous.shown?.el.classList.remove("is-shown");
      next.shown?.el.classList.add("is-shown");
    }
    this.#state = next;
    for (const listener of this.#listeners) listener();
    this.schedule();
  }

  #enter(anchor: Anchor) {
    if (!isSplit() || this.#settleTimer !== undefined) return;
    clearTimeout(this.#leaveTimer);
    this.#preview = anchor;
    this.#update();
  }

  #leave() {
    clearTimeout(this.#leaveTimer);
    this.#leaveTimer = setTimeout(() => {
      this.#preview = null;
      this.#update();
    }, 160);
  }

  #drawLeader() {
    const leader = this.#leader;
    const pane = this.#pane;
    if (leader === null || pane === null) return;
    const drawn = drawLeader(leader, pane, this.#main, this.#state, this.#leaderFor);
    if (drawn !== undefined) this.#leaderFor = drawn;
  }
}
