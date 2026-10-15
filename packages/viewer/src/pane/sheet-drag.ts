export const bindSheetDrag = (
  pane: HTMLElement,
  isOpen: () => boolean,
  setSheet: (open: boolean) => void,
): (() => void) => {
  const head = pane.querySelector<HTMLElement>(".pane-head");
  let startY = 0;
  const onTouchStart = (event: TouchEvent) => {
    startY = event.touches[0]?.clientY ?? 0;
    pane.classList.add("dragging");
  };
  const onTouchMove = (event: TouchEvent) => {
    const dy = (event.touches[0]?.clientY ?? startY) - startY;
    if (isOpen()) pane.style.setProperty("--drag", `${Math.max(0, dy)}px`);
  };
  const onTouchEnd = (event: TouchEvent) => {
    pane.classList.remove("dragging");
    pane.style.removeProperty("--drag");
    const dy = (event.changedTouches[0]?.clientY ?? startY) - startY;
    if (isOpen() && dy > 80) setSheet(false);
    else if (!isOpen() && dy < -30) setSheet(true);
  };
  head?.addEventListener("touchstart", onTouchStart, { passive: true });
  head?.addEventListener("touchmove", onTouchMove, { passive: true });
  head?.addEventListener("touchend", onTouchEnd);
  return () => {
    head?.removeEventListener("touchstart", onTouchStart);
    head?.removeEventListener("touchmove", onTouchMove);
    head?.removeEventListener("touchend", onTouchEnd);
  };
};
