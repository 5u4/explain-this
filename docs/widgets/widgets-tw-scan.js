// Port of scanClasses and the diagnostics of buildWidgetStyles
// (packages/cli/src/doc-root/widget-styles.ts), run on the widget modules of the CLI tests.
const tw = String.raw;

// A literal backtick right after "tw" in this file would itself be scanned as a class template,
// so every such backtick below is spelled through BT.
const BT = "\x60";
const TEMPLATE = new RegExp(`(?<![\\w$])tw${BT}([^${BT}]*)${BT}`, "g");
const CLASS = /\S+/g;
const ARBITRARY = /[[\]()]/;
const FILE = "widgets/fold-play.js";

// Whether Tailwind generated CSS for the class; the tests assert these outcomes.
const IN_THEME = {
  flex: true,
  "text-muted": true,
  "gap-2": true,
  "bg-raised": true,
  "text-pass": true,
  "p-3": true,
  "bg-red-500": false,
};

const CASES = [
  {
    id: "bad",
    source: "explain:packages/cli/test/explain.test.ts:192-212",
    text: [
      "const tw = String.raw;",
      "export function mount(root) {",
      `  root.className = tw${BT}flex bg-red-500 p-[3px] text-muted${BT};`,
      '  root.dataset.kind = "bg-red-500 overflow text";',
      `  root.title = tw${BT}gap-\${1}${BT};`,
      "}",
      "",
    ].join("\n"),
    expected: [
      'widgets/fold-play.js:3:28 "bg-red-500" is not a class of the widget theme',
      'widgets/fold-play.js:3:39 "p-[3px]" is an arbitrary value; use a theme class',
      "widgets/fold-play.js:5:23 tw" +
        BT +
        "…" +
        BT +
        " takes no substitutions; choose between whole tw" +
        BT +
        "…" +
        BT +
        " strings in JS",
    ],
  },
  {
    id: "fixed",
    source: "explain:packages/cli/test/explain.test.ts:214-219",
    text:
      "const tw = String.raw;\nexport function mount(root) {\n  root.className = tw" +
      BT +
      "flex gap-2 bg-raised text-pass" +
      BT +
      ";\n}\n",
    expected: [],
  },
  {
    id: "dev",
    source: "explain:packages/cli/test/dev.test.ts:103-118",
    text: `const tw = String.raw;\nexport const row = tw${BT}bg-raised p-3${BT};\n`,
    expected: [],
  },
];

const STRINGS = {
  en: {
    cases: { bad: "Rejected module", fixed: "Fixed module", dev: "Dev server module" },
    module: "Module text (scanned template bodies are shaded)",
    classes: "Classes read from tw templates",
    name: "Class",
    at: "Line:column",
    verdict: "Verdict",
    theme: "theme utility",
    notTheme: "not in the widget theme",
    arbitrary: "arbitrary value",
    skipped: (at) => `template at ${at} skipped: it has a substitution`,
    none: "No class read.",
    diagnostics: "Diagnostics",
    clean: "No diagnostics.",
    agree: "Port agrees with the test",
    disagree: "Port disagrees with the test",
    expected: "Expected by",
  },
  zh: {
    cases: { bad: "被拒的模块", fixed: "修正后的模块", dev: "dev 服务器测试的模块" },
    module: "模块源码（被扫描的模板内容带底色）",
    classes: "从 tw 模板读出的类",
    name: "类",
    at: "行:列",
    verdict: "结论",
    theme: "主题内的 utility",
    notTheme: "不在 widget 主题里",
    arbitrary: "任意值",
    skipped: (at) => `${at} 处的模板含插值，整段跳过`,
    none: "没有读出任何类。",
    diagnostics: "诊断",
    clean: "没有诊断。",
    agree: "移植结果与测试一致",
    disagree: "移植结果与测试不一致",
    expected: "期望来自",
  },
};

const positionAt = (text, offset) => {
  const before = text.slice(0, offset);
  return { line: before.split("\n").length, column: offset - before.lastIndexOf("\n") };
};

const scan = (text) => {
  const templates = [];
  const classes = [];
  const diagnostics = [];
  for (const template of text.matchAll(TEMPLATE)) {
    const body = template[1] ?? "";
    const bodyOffset = template.index + 3;
    templates.push({ start: bodyOffset, end: bodyOffset + body.length });
    const substitution = body.indexOf("${");
    if (substitution >= 0) {
      const at = positionAt(text, bodyOffset + substitution);
      diagnostics.push({
        ...at,
        skipped: true,
        message:
          "tw" +
          BT +
          "…" +
          BT +
          " takes no substitutions; choose between whole tw" +
          BT +
          "…" +
          BT +
          " strings in JS",
      });
      continue;
    }
    for (const name of body.matchAll(CLASS)) {
      classes.push({ name: name[0], ...positionAt(text, bodyOffset + name.index) });
    }
  }
  for (const { name, line, column } of classes) {
    if (ARBITRARY.test(name)) {
      diagnostics.push({
        line,
        column,
        message: `"${name}" is an arbitrary value; use a theme class`,
      });
    } else if (IN_THEME[name] !== true) {
      diagnostics.push({ line, column, message: `"${name}" is not a class of the widget theme` });
    }
  }
  diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
  return { templates, classes, diagnostics };
};

const el = (tag, attrs, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) node.append(child);
  return node;
};

const HEADING = tw`mt-4 mb-2 font-display text-step-0 text-strong`;
const SHADED = tw`rounded-small bg-inset text-strong`;

export function mount(root, ctx) {
  const t = STRINGS[ctx.locale] ?? STRINGS[ctx.locale.split("-")[0]] ?? STRINGS.en;
  let current = CASES[0];

  const picker = el("div", { class: "ui-segmented", role: "group" });
  const view = el("div", {});
  root.append(picker, view);

  const render = () => {
    for (const button of picker.children) {
      button.setAttribute("aria-pressed", String(button.dataset.case === current.id));
    }
    const { templates, classes, diagnostics } = scan(current.text);

    const code = el("pre", { class: `ui-code ${tw`mt-3 text-muted`}` });
    let offset = 0;
    for (const { start, end } of templates) {
      code.append(
        current.text.slice(offset, start),
        el("span", { class: SHADED }, [current.text.slice(start, end)]),
      );
      offset = end;
    }
    code.append(current.text.slice(offset));

    const rows = classes.map(({ name, line, column }) =>
      el("tr", {}, [
        el("td", { class: tw`font-mono` }, [name]),
        el("td", { class: tw`font-mono text-muted` }, [`${line}:${column}`]),
        el("td", {}, [
          ARBITRARY.test(name) ? t.arbitrary : IN_THEME[name] === true ? t.theme : t.notTheme,
        ]),
      ]),
    );
    const skipped = diagnostics
      .filter((diagnostic) => diagnostic.skipped)
      .map(({ line, column }) =>
        el("tr", {}, [
          el("td", { colspan: "3", class: tw`text-muted` }, [t.skipped(`${line}:${column}`)]),
        ]),
      );
    const table =
      rows.length + skipped.length === 0
        ? el("p", { class: tw`text-muted` }, [t.none])
        : el("table", { class: "ui-table" }, [
            el("thead", {}, [
              el("tr", {}, [
                el("th", {}, [t.name]),
                el("th", {}, [t.at]),
                el("th", {}, [t.verdict]),
              ]),
            ]),
            el("tbody", {}, [...rows, ...skipped]),
          ]);

    const lines = diagnostics.map(
      ({ line, column, message }) => `${FILE}:${line}:${column} ${message}`,
    );
    const agrees =
      lines.length === current.expected.length &&
      lines.every((line, index) => line === current.expected[index]);
    const report =
      lines.length === 0
        ? el("p", { class: tw`text-muted` }, [t.clean])
        : el("pre", { class: `ui-code ${tw`whitespace-pre-wrap`}` }, [lines.join("\n")]);

    view.replaceChildren(
      code,
      el("h4", { class: HEADING }, [t.classes]),
      table,
      el("h4", { class: HEADING }, [t.diagnostics]),
      report,
      el("p", { class: tw`mt-3 flex flex-wrap items-center gap-2` }, [
        el("span", { class: agrees ? tw`font-semibold text-pass` : tw`font-semibold text-fail` }, [
          agrees ? `✓ ${t.agree}` : `✗ ${t.disagree}`,
        ]),
        el("span", { class: tw`text-muted` }, [`· ${t.expected}`]),
        ctx.cite(current.source),
      ]),
    );
  };

  for (const item of CASES) {
    const button = el("button", { type: "button", "data-case": item.id }, [t.cases[item.id]]);
    button.addEventListener("click", () => {
      current = item;
      render();
    });
    picker.append(button);
  }
  render();
}
