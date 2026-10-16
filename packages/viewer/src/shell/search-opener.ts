let opener: (() => void) | null = null;

export const openSearch = () => opener?.();

export const bindSearch = (open: () => void): (() => void) => {
  opener = open;
  return () => {
    if (opener === open) opener = null;
  };
};

export const installSearchShortcut = () => {
  addEventListener("keydown", (event) => {
    const typing =
      event.target instanceof Element && event.target.closest("input, textarea, select") !== null;
    if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
      event.preventDefault();
      openSearch();
    }
  });
};
