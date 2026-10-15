import type { Ref } from "@explain/contract/citation";

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

export type PaneMode =
  | { readonly kind: "follow" }
  | { readonly kind: "pinned"; readonly anchor: Anchor };

export type PaneEvent =
  | { readonly type: "toggle"; readonly anchor: Anchor }
  | { readonly type: "pin"; readonly anchor: Anchor }
  | { readonly type: "resume" };

export const following: PaneMode = { kind: "follow" };

export const transition = (mode: PaneMode, event: PaneEvent): PaneMode => {
  switch (event.type) {
    case "toggle":
      return mode.kind === "pinned" && mode.anchor.el === event.anchor.el
        ? following
        : { kind: "pinned", anchor: event.anchor };
    case "pin":
      return { kind: "pinned", anchor: event.anchor };
    case "resume":
      return following;
  }
};

export interface PaneState {
  readonly shown: Anchor | null;
  readonly mode: PaneMode;
  readonly preview: boolean;
  readonly position: number;
  readonly total: number;
  readonly notes: ReadonlyArray<NoteMarker>;
  readonly sheetOpen: boolean;
}
