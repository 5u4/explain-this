import { isSplit, isVisible, reducedMotion } from "./geometry.ts";
import type { Anchor, PaneState } from "./model.ts";

export const drawLeader = (
  leader: SVGSVGElement,
  pane: HTMLElement,
  main: HTMLElement,
  state: PaneState,
  leaderFor: Anchor | null,
): Anchor | undefined => {
  const anchor = state.shown;
  const hide = (): undefined => {
    leader.classList.remove("on");
  };
  if (anchor === null || !isSplit() || !isVisible(anchor)) return hide();
  const band = pane.querySelector(".view.on .band.on");
  const rects = anchor.el.getClientRects();
  const first = rects[0];
  const page = anchor.el.closest(".page") ?? main.querySelector(".page");
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
  leader.dataset.mode = state.preview ? "preview" : state.mode.kind;
  if (leaderFor !== anchor && !reducedMotion.matches && !state.preview) {
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
  return anchor;
};
