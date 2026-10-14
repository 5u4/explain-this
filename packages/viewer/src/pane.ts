import type { Ref } from "@explain/contract/citation";
import { parseRef } from "./ref.ts";

export type AnchorKind = "cite" | "file" | "excerpt" | "note";

export interface Anchor {
  readonly el: HTMLElement;
  readonly key: string;
  readonly ref: Ref;
  readonly kind: AnchorKind;
  readonly follow: boolean;
}

export interface NoteMarker {
  readonly key: string;
  readonly index: number;
  readonly ref: Ref;
}

export type PaneMode = "follow" | "pinned" | "preview";

export interface PaneState {
  readonly shown: Anchor | null;
  readonly mode: PaneMode;
  readonly position: number;
  readonly total: number;
  readonly notes: ReadonlyArray<NoteMarker>;
  readonly sheetOpen: boolean;
}

const anchorKinds: Readonly<Record<string, AnchorKind>> = {
  cite: "cite",
  file: "file",
  excerpt: "excerpt",
  note: "note",
};

export const splitQuery = "(min-width: 1080px)";

const readingLine = 0.4;
const releaseDistance = 140;
const programmaticWindow = 900;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const isSplit = () => matchMedia(splitQuery).matches;

const scrollBehavior = (): ScrollBehavior => (reducedMotion.matches ? "auto" : "smooth");

const isVisible = (anchor: Anchor): boolean =>
  anchor.el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }) &&
  anchor.el.closest("[hidden]") === null;

export class PaneController {
  readonly #main: HTMLElement;
  #anchors: ReadonlyArray<Anchor> = [];
  readonly #byElement = new WeakMap<Element, Anchor>();
  #following = true;
  #pinned: Anchor | null = null;
  #preview: Anchor | null = null;
  #held: Anchor | null = null;
  #pinY = 0;
  #programmaticUntil = 0;
  #leaveTimer: number | undefined;
  #refreshFrame = 0;
  #leaderFrame = 0;
  #settleUntil = 0;
  #pane: HTMLElement | null = null;
  #leader: SVGSVGElement | null = null;
  #leaderFor: Anchor | null = null;
  #sheetReturn: HTMLElement | null = null;
  #state: PaneState = {
    shown: null,
    mode: "follow",
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
    const main = this.#main;
    const observer = new MutationObserver(this.#scheduleRefresh);
    observer.observe(main, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden", "open", "data-ref"],
    });
    main.addEventListener("mouseover", this.#onMouseOver);
    main.addEventListener("mouseout", this.#onMouseOut);
    main.addEventListener("focusin", this.#onFocusIn);
    main.addEventListener("focusout", this.#onFocusOut);
    main.addEventListener("click", this.#onClick);
    addEventListener("keydown", this.#onKeyDown);
    addEventListener("scroll", this.#onScroll, { passive: true });
    addEventListener("resize", this.#onResize);
    this.#refresh();
    return () => {
      observer.disconnect();
      main.removeEventListener("mouseover", this.#onMouseOver);
      main.removeEventListener("mouseout", this.#onMouseOut);
      main.removeEventListener("focusin", this.#onFocusIn);
      main.removeEventListener("focusout", this.#onFocusOut);
      main.removeEventListener("click", this.#onClick);
      removeEventListener("keydown", this.#onKeyDown);
      removeEventListener("scroll", this.#onScroll);
      removeEventListener("resize", this.#onResize);
      clearTimeout(this.#leaveTimer);
      cancelAnimationFrame(this.#refreshFrame);
      cancelAnimationFrame(this.#leaderFrame);
      if (this.#state.sheetOpen) this.setSheet(false);
    };
  }

  attach(pane: HTMLElement, leader: SVGSVGElement): () => void {
    this.#pane = pane;
    this.#leader = leader;
    const head = pane.querySelector<HTMLElement>(".pane-head");
    let startY = 0;
    const onTouchStart = (event: TouchEvent) => {
      startY = event.touches[0]?.clientY ?? 0;
      pane.classList.add("dragging");
    };
    const onTouchMove = (event: TouchEvent) => {
      const dy = (event.touches[0]?.clientY ?? startY) - startY;
      if (this.#state.sheetOpen) pane.style.setProperty("--drag", `${Math.max(0, dy)}px`);
    };
    const onTouchEnd = (event: TouchEvent) => {
      pane.classList.remove("dragging");
      pane.style.removeProperty("--drag");
      const dy = (event.changedTouches[0]?.clientY ?? startY) - startY;
      if (this.#state.sheetOpen && dy > 80) this.setSheet(false);
      else if (!this.#state.sheetOpen && dy < -30) this.setSheet(true);
    };
    head?.addEventListener("touchstart", onTouchStart, { passive: true });
    head?.addEventListener("touchmove", onTouchMove, { passive: true });
    head?.addEventListener("touchend", onTouchEnd);
    this.schedule();
    return () => {
      head?.removeEventListener("touchstart", onTouchStart);
      head?.removeEventListener("touchmove", onTouchMove);
      head?.removeEventListener("touchend", onTouchEnd);
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
    this.#following = true;
    this.#pinned = null;
    this.#preview = null;
    this.#held = next;
    this.#programmaticUntil = performance.now() + programmaticWindow;
    const top = scrollY + next.el.getBoundingClientRect().top - innerHeight * readingLine + 4;
    scrollTo({ top, behavior: scrollBehavior() });
    this.#sync();
  }

  activateNote(key: string) {
    const anchor = this.#anchors.find((item) => item.kind === "note" && item.key === key);
    if (anchor === undefined) return;
    this.#pin(anchor);
    this.#programmaticUntil = performance.now() + programmaticWindow;
    anchor.el.scrollIntoView({ block: "center", behavior: scrollBehavior() });
    anchor.el.focus({ preventScroll: true });
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
    this.#settleUntil = performance.now() + 700;
    if (this.#leaderFrame !== 0) return;
    const tick = () => {
      this.#leaderFrame = 0;
      this.#drawLeader();
      if (performance.now() < this.#settleUntil) this.#leaderFrame = requestAnimationFrame(tick);
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
    this.#anchors = [...this.#main.querySelectorAll<HTMLElement>("[data-ref]")].flatMap((el) => {
      const key = el.dataset.ref ?? "";
      const known = this.#byElement.get(el);
      if (known !== undefined && known.key === key) return [known];
      const ref = parseRef(key);
      const kind = anchorKinds[el.dataset.kind ?? "cite"];
      if (ref === undefined || kind === undefined) return [];
      const anchor: Anchor = {
        el,
        key,
        ref,
        kind,
        follow: kind !== "file" && el.dataset.follow !== "0",
      };
      this.#byElement.set(el, anchor);
      return [anchor];
    });
    const pinned = this.#pinned;
    if (pinned !== null && !pinned.el.isConnected) {
      this.#pinned = this.#anchors.find((anchor) => anchor.key === pinned.key) ?? null;
    }
    if (this.#preview !== null && !this.#preview.el.isConnected) this.#preview = null;
    if (this.#held !== null && !this.#held.el.isConnected) this.#held = null;
    this.#sync();
    this.schedule();
  }

  #followable(): ReadonlyArray<Anchor> {
    return this.#anchors.filter((anchor) => anchor.follow && isVisible(anchor));
  }

  #readingAnchor(list: ReadonlyArray<Anchor>): Anchor | null {
    const line = innerHeight * readingLine;
    let best: Anchor | null = null;
    for (const anchor of list) {
      if (anchor.el.getBoundingClientRect().top <= line) best = anchor;
      else break;
    }
    return best ?? list[0] ?? null;
  }

  #sync() {
    const list = this.#followable();
    const held = performance.now() < this.#programmaticUntil ? this.#held : null;
    const current = this.#state.shown?.el.isConnected === true ? this.#state.shown : null;
    const shown =
      this.#preview ??
      (this.#following ? null : this.#pinned) ??
      held ??
      this.#readingAnchor(list) ??
      current;
    const group = shown?.kind === "note" ? shown.el.closest(".annotated") : null;
    const notes =
      shown === this.#state.shown
        ? this.#state.notes
        : group === null || group === undefined
          ? []
          : [...group.querySelectorAll<HTMLElement>(".note[data-ref]")].flatMap((el) => {
              const ref = parseRef(el.dataset.ref ?? "");
              return ref === undefined
                ? []
                : [{ key: el.dataset.ref ?? "", index: Number(el.dataset.index), ref }];
            });
    this.#emit({
      shown,
      mode: this.#preview !== null ? "preview" : this.#following ? "follow" : "pinned",
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

  #pin(anchor: Anchor) {
    this.#following = false;
    this.#pinned = anchor;
    this.#pinY = scrollY;
    this.#preview = null;
    this.#sync();
  }

  #anchorFor(target: EventTarget | null): Anchor | undefined {
    const el = target instanceof Element ? target.closest("[data-ref]") : null;
    return el === null ? undefined : this.#byElement.get(el);
  }

  readonly #onMouseOver = (event: MouseEvent) => {
    const anchor = this.#anchorFor(event.target);
    if (anchor !== undefined) this.#enter(anchor);
  };

  readonly #onMouseOut = (event: MouseEvent) => {
    const anchor = this.#anchorFor(event.target);
    if (anchor === undefined) return;
    if (event.relatedTarget instanceof Node && anchor.el.contains(event.relatedTarget)) return;
    this.#leave();
  };

  readonly #onFocusIn = (event: FocusEvent) => {
    const anchor = this.#anchorFor(event.target);
    if (
      anchor !== undefined &&
      event.target instanceof Element &&
      event.target.matches(":focus-visible")
    ) {
      this.#enter(anchor);
    }
  };

  readonly #onFocusOut = (event: FocusEvent) => {
    if (this.#anchorFor(event.target) !== undefined) this.#leave();
  };

  #enter(anchor: Anchor) {
    if (!isSplit()) return;
    clearTimeout(this.#leaveTimer);
    this.#preview = anchor;
    this.#sync();
  }

  #leave() {
    clearTimeout(this.#leaveTimer);
    this.#leaveTimer = setTimeout(() => {
      this.#preview = null;
      this.#sync();
    }, 160);
  }

  readonly #onClick = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    const anchor = this.#anchorFor(event.target);
    if (anchor === undefined) return;
    event.preventDefault();
    this.#pin(anchor);
    if (!isSplit()) this.setSheet(true, anchor.el);
  };

  readonly #onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && this.#state.sheetOpen) {
      this.setSheet(false);
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest("input, textarea, select, dialog")
    ) {
      return;
    }
    if (event.key === "]") this.step(1);
    if (event.key === "[") this.step(-1);
  };

  readonly #onScroll = () => {
    if (!this.#following) {
      if (performance.now() <= this.#programmaticUntil) this.#pinY = scrollY;
      else if (Math.abs(scrollY - this.#pinY) > releaseDistance) {
        this.#following = true;
        this.#pinned = null;
      }
    }
    this.#sync();
  };

  readonly #onResize = () => {
    if (isSplit() && this.#state.sheetOpen) this.setSheet(false);
    this.#sync();
    this.schedule();
  };

  #drawLeader() {
    const leader = this.#leader;
    const pane = this.#pane;
    if (leader === null || pane === null) return;
    const anchor = this.#state.shown;
    const hide = () => leader.classList.remove("on");
    if (anchor === null || !isSplit() || !isVisible(anchor)) return hide();
    const band = pane.querySelector(".view.on .band.on");
    const rects = anchor.el.getClientRects();
    const first = rects[0];
    const page = anchor.el.closest(".page") ?? this.#main.querySelector(".page");
    const body = pane.querySelector(".pane-body");
    if (band === null || first === undefined || page === null || body === null) return hide();
    const box = anchor.kind === "excerpt" ? anchor.el.getBoundingClientRect() : first;
    const y1 =
      anchor.kind === "excerpt"
        ? Math.min(Math.max(box.top + 22, 24), box.bottom - 12)
        : box.top + box.height / 2;
    if (y1 < 8 || y1 > innerHeight - 8) return hide();
    const prose = page.getBoundingClientRect();
    const paneBody = body.getBoundingClientRect();
    const bandBox = band.getBoundingClientRect();
    const x1 = prose.right + 14;
    const x2 = paneBody.left + 1;
    const y2 = Math.min(
      Math.max(bandBox.top + Math.min(bandBox.height, 120) / 2, paneBody.top + 14),
      paneBody.bottom - 14,
    );
    const dx = (x2 - x1) * 0.55;
    const path = leader.querySelector<SVGPathElement>(".leader-path");
    const start = leader.querySelector(".leader-a");
    const end = leader.querySelector(".leader-b");
    if (path === null || start === null || end === null) return;
    path.setAttribute("d", `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`);
    start.setAttribute("cx", `${x1}`);
    start.setAttribute("cy", `${y1}`);
    end.setAttribute("cx", `${x2}`);
    end.setAttribute("cy", `${y2}`);
    leader.classList.add("on");
    leader.dataset.mode = this.#state.mode;
    if (this.#leaderFor !== anchor && !reducedMotion.matches && this.#state.mode !== "preview") {
      const length = path.getTotalLength();
      for (const animation of path.getAnimations()) animation.cancel();
      path.animate(
        [
          { strokeDasharray: `${length}`, strokeDashoffset: length },
          { strokeDasharray: `${length}`, strokeDashoffset: 0 },
        ],
        { duration: 460, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      );
    }
    this.#leaderFor = anchor;
  }
}
