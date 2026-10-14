import type { AlertKind } from "@explain/contract/page";
import type { ReactElement } from "react";

const svg = (children: ReactElement | ReadonlyArray<ReactElement>, className?: string) => (
  <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
    {children}
  </svg>
);

export const icons = {
  copy: svg(
    [
      <rect key="r" x="7" y="7" width="9" height="9" rx="2" />,
      <path key="p" d="M4 13V5a1 1 0 0 1 1-1h8" />,
    ],
    "i-copy",
  ),
  check: svg(<path d="m4.5 10.5 3.5 3.5 7.5-8" />, "i-check"),
  up: svg(<path d="m5 12 5-5 5 5" />),
  down: svg(<path d="m5 8 5 5 5-5" />),
  chevron: svg(<path d="m8 5 5 5-5 5" />, "chev"),
  search: svg([<circle key="c" cx="9" cy="9" r="5.5" />, <path key="p" d="m13 13 4 4" />]),
  close: svg(<path d="m5 5 10 10M15 5 5 15" />),
  arrowLeft: svg(<path d="M16 10H4m5-5-5 5 5 5" />),
  arrowRight: svg(<path d="M4 10h12m-5-5 5 5-5 5" />),
  menu: svg(<path d="M3 6h14M3 10h14M3 14h9" />),
  file: svg([<path key="a" d="M5 2.5h6.5L15 6v11.5H5z" />, <path key="b" d="M11 2.5V6.5h4" />]),
};

export const alertIcons: Readonly<Record<AlertKind, ReactElement>> = {
  note: svg([<circle key="c" cx="10" cy="10" r="7" />, <path key="p" d="M10 9v5M10 6.5v.01" />]),
  tip: svg(<path d="M7 14h6M8 17h4M10 3a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9z" />),
  important: svg([
    <path key="a" d="M10 2.5 17 6v4.5c0 4-3 6.5-7 7.5-4-1-7-3.5-7-7.5V6z" />,
    <path key="b" d="M10 7v4M10 13.5v.01" />,
  ]),
  warning: svg([<path key="a" d="M10 3 18 17H2z" />, <path key="b" d="M10 8v4M10 14.5v.01" />]),
  caution: svg([<circle key="c" cx="10" cy="10" r="7" />, <path key="p" d="M7 7l6 6M13 7l-6 6" />]),
};
