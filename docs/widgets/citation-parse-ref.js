const tw = String.raw;

// Port of parseRef and its helpers from packages/contract/src/citation.ts.
const repoKeyPattern = /^[a-z][a-z0-9-]*$/;
const reservedRepoKeys = { http: true, https: true, mailto: true };
const rangePattern = /^([1-9][0-9]*)(?:-([1-9][0-9]*))?$/;

const repoKeyProblem = (key) => {
  if (!repoKeyPattern.test(key)) return `repo key "${key}" must match ${repoKeyPattern.source}`;
  if (Object.hasOwn(reservedRepoKeys, key)) return `repo key "${key}" is reserved`;
  return undefined;
};

const pathProblem = (path) => {
  if (path === "") return "citation path is empty";
  if (path.startsWith("/")) return `citation path "${path}" must be relative to the repo root`;
  if (path.includes("\\")) return `citation path "${path}" must use "/" separators`;
  for (const segment of path.split("/")) {
    if (segment === "") return `citation path "${path}" has an empty segment`;
    if (segment === "." || segment === "..") {
      return `citation path "${path}" must not contain "." or ".." segments`;
    }
  }
  return undefined;
};

const parseRanges = (text) => {
  const ranges = [];
  for (const part of text.split(",")) {
    const match = rangePattern.exec(part);
    if (match === null) {
      return {
        ok: false,
        error: `line range "${part}" must be N or N-M with 1-based line numbers`,
      };
    }
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    if (from > to) return { ok: false, error: `line range "${part}" ends before it starts` };
    const previous = ranges.at(-1);
    if (previous !== undefined && from <= previous.to) {
      return { ok: false, error: `line ranges "${text}" must be ascending and non-overlapping` };
    }
    ranges.push({ from, to });
  }
  return { ok: true, value: ranges };
};

const parseRef = (text) => {
  const parts = text.split(":");
  const [repo, path, ranges] = parts;
  if (parts.length < 2 || parts.length > 3 || repo === undefined || path === undefined) {
    return { ok: false, error: `citation "${text}" must be <repo>:<path>[:<ranges>]` };
  }
  const problem = repoKeyProblem(repo) ?? pathProblem(path);
  if (problem !== undefined) return { ok: false, error: problem };
  if (ranges === undefined) return { ok: true, value: { repo, path, ranges: [] } };
  const parsed = parseRanges(ranges);
  return parsed.ok ? { ok: true, value: { repo, path, ranges: parsed.value } } : parsed;
};

// The cases of packages/contract/src/citation.test.ts. `expect` is the test's expectation:
// an exact Ref for the two accepting tests, or "reject" for the it.each table.
const cases = [
  {
    input: "fold:src/fold.ts",
    label: "parses a whole-file citation",
    expect: { repo: "fold", path: "src/fold.ts", ranges: [] },
  },
  {
    input: "fold:fold.ts:3,12-30,40-45",
    label: "parses single lines and spans",
    expect: {
      repo: "fold",
      path: "fold.ts",
      ranges: [
        { from: 3, to: 3 },
        { from: 12, to: 30 },
        { from: 40, to: 45 },
      ],
    },
  },
  ...[
    ["fold.ts", "no repo"],
    ["Fold:fold.ts", "uppercase repo"],
    ["http:fold.ts", "reserved repo"],
    ["fold:", "empty path"],
    ["fold:/fold.ts", "absolute path"],
    ["fold:src//fold.ts", "empty segment"],
    ["fold:./fold.ts", "dot segment"],
    ["fold:src/../fold.ts", "dot-dot segment"],
    ["fold:src\\fold.ts", "backslash"],
    ["fold:fold.ts:", "empty ranges"],
    ["fold:fold.ts:0", "line zero"],
    ["fold:fold.ts:01", "leading zero"],
    ["fold:fold.ts:5-3", "descending span"],
    ["fold:fold.ts:10,4", "descending ranges"],
    ["fold:fold.ts:1-5,5-9", "overlapping ranges"],
    ["fold:fold.ts:1-", "open span"],
    ["fold:fold.ts:1-2-3", "triple bound"],
    ["fold:fold.ts:1, 2", "space"],
    ["fold:a:b:1", "colon in path"],
  ].map(([input, reason]) => ({ input, label: `rejects ${input} (${reason})`, expect: "reject" })),
];

const strings = {
  en: {
    pick: "Test case",
    previous: "Previous case",
    next: "Next case",
    input: "Input",
    returns: "parseRef returns",
    success: "Success",
    failure: "Failure",
    repo: "repo",
    path: "path",
    ranges: "ranges",
    none: "none (whole file)",
    test: "The test expects",
    testAccept: "Success with exactly this Ref",
    testReject: "Any failure",
    agree: "The port agrees with the test",
    disagree: "The port disagrees with the test",
  },
  zh: {
    pick: "测试用例",
    previous: "上一个用例",
    next: "下一个用例",
    input: "输入",
    returns: "parseRef 返回",
    success: "成功",
    failure: "失败",
    repo: "repo",
    path: "path",
    ranges: "ranges",
    none: "无（整个文件）",
    test: "测试期望",
    testAccept: "成功，且恰好是这个 Ref",
    testReject: "任意失败",
    agree: "移植版与测试一致",
    disagree: "移植版与测试不一致",
  },
};

const stringsFor = (locale) => strings[locale] ?? strings[locale.split("-")[0]] ?? strings.en;

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
};

const formatRange = (range) =>
  range.from === range.to ? `${range.from}` : `${range.from}-${range.to}`;

const sameRef = (a, b) =>
  a.repo === b.repo &&
  a.path === b.path &&
  a.ranges.length === b.ranges.length &&
  a.ranges.every((range, i) => range.from === b.ranges[i].from && range.to === b.ranges[i].to);

const ROW = tw`flex flex-wrap items-center gap-2`;
const LABEL = tw`text-step--1 text-muted min-w-28`;
const CARD = tw`flex flex-col gap-2 rounded-medium bg-inset p-3`;
const VERDICT_PASS = tw`font-mono text-step--1 text-pass bg-pass-wash rounded-small px-2 py-1`;
const VERDICT_FAIL = tw`font-mono text-step--1 text-fail bg-fail-wash rounded-small px-2 py-1`;

export function mount(root, ctx) {
  const t = stringsFor(ctx.locale);
  let index = 0;

  const select = el("select", {
    class: `ui-select ${tw`min-w-0 flex-1 max-sm:w-full`}`,
    "aria-label": t.pick,
  });
  for (const [i, item] of cases.entries()) {
    select.append(el("option", { value: String(i), text: item.label }));
  }
  const previous = el("button", {
    type: "button",
    class: "ui-button",
    "aria-label": t.previous,
    text: "←",
  });
  const next = el("button", {
    type: "button",
    class: "ui-button",
    "aria-label": t.next,
    text: "→",
  });
  const body = el("div", { class: tw`flex flex-col gap-3` });

  const show = (i) => {
    index = (i + cases.length) % cases.length;
    select.value = String(index);
    const item = cases[index];
    const result = parseRef(item.input);
    const agrees =
      item.expect === "reject" ? !result.ok : result.ok && sameRef(result.value, item.expect);

    const returned = result.ok
      ? el("table", { class: "ui-table" }, [
          el("tbody", {}, [
            el("tr", {}, [
              el("th", { text: t.repo }),
              el("td", { class: tw`font-mono`, text: result.value.repo }),
            ]),
            el("tr", {}, [
              el("th", { text: t.path }),
              el("td", { class: tw`font-mono`, text: result.value.path }),
            ]),
            el("tr", {}, [
              el("th", { text: t.ranges }),
              el("td", { class: tw`font-mono` }, [
                result.value.ranges.length === 0
                  ? t.none
                  : result.value.ranges.map((r) => `{ from: ${r.from}, to: ${r.to} }`).join(", "),
              ]),
            ]),
          ]),
        ])
      : el("code", { class: `ui-code ${tw`whitespace-pre-wrap break-all`}`, text: result.error });

    body.replaceChildren(
      el("div", { class: ROW }, [
        el("span", { class: LABEL, text: t.input }),
        el("code", { class: `ui-code ${tw`break-all`}`, text: item.input }),
      ]),
      el("div", { class: CARD }, [
        el("div", { class: ROW }, [
          el("span", { class: LABEL, text: t.returns }),
          el("span", { class: "ui-tag", text: result.ok ? t.success : t.failure }),
        ]),
        returned,
      ]),
      el("div", { class: ROW }, [
        el("span", { class: LABEL, text: t.test }),
        el("span", {
          class: tw`text-body`,
          text:
            item.expect === "reject"
              ? t.testReject
              : `${t.testAccept}: ${item.expect.repo}:${item.expect.path}${
                  item.expect.ranges.length === 0
                    ? ""
                    : `:${item.expect.ranges.map(formatRange).join(",")}`
                }`,
        }),
      ]),
      el("div", { class: ROW }, [
        el("span", {
          class: agrees ? VERDICT_PASS : VERDICT_FAIL,
          text: `${agrees ? "✓" : "✗"} ${agrees ? t.agree : t.disagree}`,
        }),
      ]),
    );
  };

  const onChange = () => show(Number(select.value));
  const onPrevious = () => show(index - 1);
  const onNext = () => show(index + 1);
  select.addEventListener("change", onChange);
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);

  root.append(
    el("div", { class: tw`flex flex-col gap-3` }, [
      el("div", { class: ROW }, [previous, select, next]),
      body,
    ]),
  );
  show(0);

  return () => {
    select.removeEventListener("change", onChange);
    previous.removeEventListener("click", onPrevious);
    next.removeEventListener("click", onNext);
    root.replaceChildren();
  };
}
