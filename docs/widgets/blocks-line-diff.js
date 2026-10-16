// Ports lineDiff and foldContext from packages/viewer/src/blocks/line-diff.ts and replays
// the cases of line-diff.test.ts, comparing the port's output with the test's expectation.
const tw = String.raw;

const STRINGS = {
  en: {
    case: "Test case",
    before: "before",
    after: "after",
    empty: "(empty)",
    rows: "Rows lineDiff returns",
    pieces: "Pieces foldContext returns",
    noRows: "no rows",
    folded: (count) => `⋯ ${count} unchanged rows folded`,
    pass: "✓ the port returns exactly what the test expects",
    fail: "✗ the port differs from the test's expectation",
    input: "Input rows",
  },
  zh: {
    case: "测试用例",
    before: "修改前",
    after: "修改后",
    empty: "（空）",
    rows: "lineDiff 返回的行",
    pieces: "foldContext 返回的片段",
    noRows: "没有行",
    folded: (count) => `⋯ 折叠了 ${count} 行未改动的内容`,
    pass: "✓ 移植版的输出与测试期望完全一致",
    fail: "✗ 移植版的输出与测试期望不一致",
    input: "输入行",
  },
};

// Port of lineDiff (line-diff.ts:10-60).
const lineDiff = (before, after) => {
  const n = before.length;
  const m = after.length;
  const offset = n + m + 1;
  const stepsDown = (reach, k, d) =>
    k === -d || (k !== d && (reach[offset + k - 1] ?? 0) < (reach[offset + k + 1] ?? 0));
  const reach = new Int32Array(2 * offset + 1);
  const trace = [];
  search: for (let d = 0; d <= n + m; d++) {
    trace.push(reach.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = stepsDown(reach, k, d)
        ? (reach[offset + k + 1] ?? 0)
        : (reach[offset + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && before[x] === after[y]) {
        x++;
        y++;
      }
      reach[offset + k] = x;
      if (x >= n && y >= m) break search;
    }
  }
  const reversed = [];
  let x = n;
  let y = m;
  trace.reverse().forEach((previous, index) => {
    const d = trace.length - 1 - index;
    const k = x - y;
    const previousK = stepsDown(previous, k, d) ? k + 1 : k - 1;
    const previousX = previous[offset + previousK] ?? 0;
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      x--;
      y--;
      reversed.push({ kind: "context", before: x, after: y });
    }
    if (d === 0) return;
    reversed.push(
      x === previousX
        ? { kind: "added", after: previousY }
        : { kind: "removed", before: previousX },
    );
    x = previousX;
    y = previousY;
  });
  return reversed.reverse();
};

// Port of foldContext (line-diff.ts:62-92).
const foldOver = 6;
const keep = 3;
const foldContext = (rows) => {
  const pieces = [];
  let shown = [];
  let run = [];
  const closeRun = () => {
    if (run.length > foldOver) {
      pieces.push(
        { kind: "shown", rows: [...shown, ...run.slice(0, keep)] },
        { kind: "folded", rows: run.slice(keep, -keep) },
      );
      shown = run.slice(-keep);
    } else {
      shown.push(...run);
    }
    run = [];
  };
  for (const row of rows) {
    if (row.kind === "context") {
      run.push(row);
      continue;
    }
    closeRun();
    shown.push(row);
  }
  closeRun();
  if (shown.length > 0) pieces.push({ kind: "shown", rows: shown });
  return pieces;
};

// Cases copied from line-diff.test.ts.
const context = (from, to) =>
  Array.from({ length: to - from }, (_, index) => ({
    kind: "context",
    before: from + index,
    after: from + index,
  }));
const removed10 = { kind: "removed", before: 10 };
const added6 = { kind: "added", after: 6 };

const CASES = [
  {
    fn: "lineDiff",
    title: "returns no rows for two empty sides",
    zh: "两侧都为空时不返回任何行",
    before: [],
    after: [],
    expected: [],
  },
  {
    fn: "lineDiff",
    title: "marks every line added when the before side is empty",
    zh: "修改前为空时每一行都是新增",
    before: [],
    after: ["a", "b"],
    expected: [
      { kind: "added", after: 0 },
      { kind: "added", after: 1 },
    ],
  },
  {
    fn: "lineDiff",
    title: "marks every line removed when the after side is empty",
    zh: "修改后为空时每一行都是删除",
    before: ["a", "b"],
    after: [],
    expected: [
      { kind: "removed", before: 0 },
      { kind: "removed", before: 1 },
    ],
  },
  {
    fn: "lineDiff",
    title: "puts a changed middle line between unchanged neighbors, removal first",
    zh: "中间改动的一行夹在未改动的邻行之间，删除在前",
    before: ["a", "b", "c", "d"],
    after: ["a", "x", "c", "d"],
    expected: [
      { kind: "context", before: 0, after: 0 },
      { kind: "removed", before: 1 },
      { kind: "added", after: 1 },
      { kind: "context", before: 2, after: 2 },
      { kind: "context", before: 3, after: 3 },
    ],
  },
  {
    fn: "lineDiff",
    title: "shifts the after numbering past an inserted line",
    zh: "插入一行后，修改后一侧的编号顺延",
    before: ["a", "c", "d"],
    after: ["a", "b", "c", "d"],
    expected: [
      { kind: "context", before: 0, after: 0 },
      { kind: "added", after: 1 },
      { kind: "context", before: 1, after: 2 },
      { kind: "context", before: 2, after: 3 },
    ],
  },
  {
    fn: "foldContext",
    title: "folds an unchanged run longer than six lines to three lines on each side",
    zh: "超过六行的未改动段折叠为两端各三行",
    rows: [...context(0, 10), removed10, ...context(11, 15)],
    expected: [
      { kind: "shown", rows: context(0, 3) },
      { kind: "folded", rows: context(3, 7) },
      { kind: "shown", rows: [...context(7, 10), removed10, ...context(11, 15)] },
    ],
  },
  {
    fn: "foldContext",
    title: "keeps a run of exactly six unchanged lines",
    zh: "恰好六行的未改动段保持原样",
    rows: [...context(0, 6), added6],
    expected: [{ kind: "shown", rows: [...context(0, 6), added6] }],
  },
];

const ROW = tw`flex font-mono text-step--1 leading-6`;
const ROW_REMOVED = tw`flex font-mono text-step--1 leading-6 text-removed`;
const ROW_ADDED = tw`flex font-mono text-step--1 leading-6 text-added`;
const ROW_FOLDED = tw`font-mono text-step--1 leading-6 text-faint px-2 bg-inset rounded-small`;
const NUM = tw`w-12 shrink-0 text-faint text-right pr-2`;
const SIGN = tw`w-6 shrink-0 text-center`;
const TEXT = tw`min-w-0`;
const TEXT_REMOVED = tw`min-w-0 line-through decoration-removed`;
const BOX = tw`rounded-medium border border-border bg-raised p-3`;
const LABEL = tw`text-step--1 text-muted mb-1`;
const PASS = tw`text-step--1 text-pass font-body`;
const FAIL = tw`text-step--1 text-fail font-body`;

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
};

// One row in diff.tsx's column layout (before number, after number, sign, text), but numbered with
// lineDiff's raw 0-based indices rather than file line numbers.
const diffRow = (row, before, after) => {
  const cls = row.kind === "removed" ? ROW_REMOVED : row.kind === "added" ? ROW_ADDED : ROW;
  const sign = row.kind === "removed" ? "−" : row.kind === "added" ? "+" : "";
  const text =
    before === undefined
      ? row.kind
      : row.kind === "removed"
        ? before[row.before]
        : after[row.after];
  return el("div", { class: cls }, [
    el("span", { class: NUM, text: row.kind === "added" ? "" : String(row.before) }),
    el("span", { class: NUM, text: row.kind === "removed" ? "" : String(row.after) }),
    el("span", { class: SIGN, text: sign }),
    el("span", { class: row.kind === "removed" ? TEXT_REMOVED : TEXT, text }),
  ]);
};

const sideList = (label, lines, t) =>
  el("div", { class: tw`min-w-0 flex-1` }, [
    el("div", { class: LABEL, text: label }),
    el("pre", {
      class: "ui-code",
      text:
        lines.length === 0 ? t.empty : lines.map((line, index) => `${index}  ${line}`).join("\n"),
    }),
  ]);

export function mount(root, ctx) {
  const t = STRINGS[ctx.locale] ?? STRINGS.en;
  const select = el("select", {
    class: `ui-select ${tw`min-w-0 max-sm:w-full`}`,
    "aria-label": t.case,
  });
  CASES.forEach((item, index) => {
    const title = ctx.locale === "zh" ? item.zh : item.title;
    select.append(el("option", { value: String(index), text: `${item.fn}: ${title}` }));
  });
  const view = el("div", { class: tw`flex flex-col gap-3 mt-3` });

  const render = () => {
    const item = CASES[Number(select.value)];
    view.replaceChildren();
    let actual;
    if (item.fn === "lineDiff") {
      actual = lineDiff(item.before, item.after);
      view.append(
        el("div", { class: tw`flex gap-3 max-sm:flex-col` }, [
          sideList(t.before, item.before, t),
          sideList(t.after, item.after, t),
        ]),
        el("div", { class: BOX }, [
          el("div", { class: LABEL, text: t.rows }),
          ...(actual.length === 0
            ? [el("div", { class: tw`text-step--1 text-faint`, text: t.noRows })]
            : actual.map((row) => diffRow(row, item.before, item.after))),
        ]),
      );
    } else {
      actual = foldContext(item.rows);
      view.append(
        el("div", { class: BOX }, [
          el("div", { class: LABEL, text: t.input }),
          ...item.rows.map((row) => diffRow(row)),
        ]),
        el("div", { class: BOX }, [
          el("div", { class: LABEL, text: t.pieces }),
          ...actual.flatMap((piece) =>
            piece.kind === "folded"
              ? [el("div", { class: ROW_FOLDED, text: t.folded(piece.rows.length) })]
              : piece.rows.map((row) => diffRow(row)),
          ),
        ]),
      );
    }
    const ok = JSON.stringify(actual) === JSON.stringify(item.expected);
    view.append(el("div", { class: ok ? PASS : FAIL, text: ok ? t.pass : t.fail }));
  };

  select.addEventListener("change", render);
  root.append(select, view);
  render();
  return () => select.removeEventListener("change", render);
}
