import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

const languageByName: Readonly<Record<string, string>> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  typescript: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  javascript: "javascript",
  json: "json",
  jsonc: "json",
  sh: "bash",
  bash: "bash",
  shell: "bash",
  zsh: "bash",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  css: "css",
  html: "xml",
  xml: "xml",
  svg: "xml",
  diff: "diff",
  patch: "diff",
};

export const languageOf = (nameOrPath: string | null): string | undefined =>
  nameOrPath === null ? undefined : languageByName[nameOrPath.split(".").at(-1) ?? ""];

const splitHighlighted = (html: string): Array<string> => {
  const lines: Array<string> = [];
  const open: Array<string> = [];
  let current = "";
  for (const match of html.matchAll(/(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+)/g)) {
    if (match[1] !== undefined) {
      open.push(match[1]);
      current += match[1];
    } else if (match[2] !== undefined) {
      open.pop();
      current += match[2];
    } else if (match[3] !== undefined) {
      lines.push(current + "</span>".repeat(open.length));
      current = open.join("");
    } else current += match[4];
  }
  lines.push(current);
  return lines;
};

export const highlightLines = (
  lines: ReadonlyArray<string>,
  language: string | undefined,
): ReadonlyArray<string> =>
  language === undefined
    ? lines.map((line) =>
        line.replace(/[&<>"]/g, (char) =>
          char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : "&quot;",
        ),
      )
    : splitHighlighted(hljs.highlight(lines.join("\n"), { language, ignoreIllegals: true }).value);
