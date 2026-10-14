import type { LineRange, Ref } from "@explain/contract/citation";
import type { Strings } from "./strings.ts";

const rangePattern = /^([1-9][0-9]*)(?:-([1-9][0-9]*))?$/;

export const formatRef = (ref: Ref): string => {
  const ranges = ref.ranges.map((range) =>
    range.from === range.to ? `${range.from}` : `${range.from}-${range.to}`,
  );
  return ranges.length === 0
    ? `${ref.repo}:${ref.path}`
    : `${ref.repo}:${ref.path}:${ranges.join(",")}`;
};

export const parseRef = (text: string): Ref | undefined => {
  const [repo, path, ranges, ...rest] = text.split(":");
  if (repo === undefined || path === undefined || repo === "" || path === "" || rest.length > 0) {
    return undefined;
  }
  if (ranges === undefined) return { repo, path, ranges: [] };
  const parsed: Array<LineRange> = [];
  for (const part of ranges.split(",")) {
    const match = rangePattern.exec(part);
    if (match === null) return undefined;
    const from = Number(match[1]);
    parsed.push({ from, to: match[2] === undefined ? from : Number(match[2]) });
  }
  return { repo, path, ranges: parsed };
};

export const fileKey = (ref: { readonly repo: string; readonly path: string }): string =>
  `${ref.repo}:${ref.path}`;

export const rangeLabel = (ref: Ref, strings: Strings): string =>
  ref.ranges.length === 0
    ? strings.wholeFile
    : ref.ranges.map((range) => strings.lines(range.from, range.to)).join(", ");

export const sourceHref = (locale: string, ref: Ref): string => {
  const path = ref.path.split("/").map(encodeURIComponent).join("/");
  const first = ref.ranges[0];
  return `/${encodeURIComponent(locale)}/source/${encodeURIComponent(ref.repo)}/${path}${first === undefined ? "" : `#L${first.from}`}`;
};

export const citedLines = (ref: Ref, lines: ReadonlyArray<string>): string =>
  ref.ranges.length === 0
    ? lines.join("\n")
    : ref.ranges.map((range) => lines.slice(range.from - 1, range.to).join("\n")).join("\n");
