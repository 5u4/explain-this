import { parseRef } from "../ref.ts";
import type { Anchor, AnchorKind, NoteMarker } from "./model.ts";

const anchorKinds: Readonly<Record<string, AnchorKind>> = {
  cite: "cite",
  file: "file",
  excerpt: "excerpt",
  note: "note",
};

export const discoverAnchors = (
  main: HTMLElement,
  byElement: WeakMap<Element, Anchor>,
): ReadonlyArray<Anchor> =>
  [...main.querySelectorAll<HTMLElement>("[data-ref]")].flatMap((el) => {
    const key = el.dataset.ref ?? "";
    const known = byElement.get(el);
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
    byElement.set(el, anchor);
    return [anchor];
  });

export const noteMarkers = (group: Element): ReadonlyArray<NoteMarker> =>
  [...group.querySelectorAll<HTMLElement>(".note[data-ref]")].flatMap((el) => {
    const ref = parseRef(el.dataset.ref ?? "");
    return ref === undefined
      ? []
      : [{ key: el.dataset.ref ?? "", index: Number(el.dataset.index), ref }];
  });
