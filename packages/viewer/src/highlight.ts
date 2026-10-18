import type {
  HighlighterCore,
  LanguageRegistration,
  ThemedToken,
  ThemeRegistration,
} from "shiki/core";

type Language = {
  readonly load: () => Promise<{ readonly default: Array<LanguageRegistration> }>;
  readonly extensions?: ReadonlyArray<string>;
  readonly fileNames?: ReadonlyArray<string>;
  readonly aliases?: ReadonlyArray<string>;
};

const languages: Readonly<Record<string, Language>> = {
  shellscript: {
    load: () => import("shiki/langs/shellscript.mjs"),
    extensions: ["sh", "bash", "zsh"],
    fileNames: [".bashrc", ".bash_profile", ".zshrc", ".profile"],
    aliases: ["bash", "shell", "sh", "zsh", "console"],
  },
  c: {
    load: () => import("shiki/langs/c.mjs"),
    extensions: ["c", "h"],
  },
  cmake: {
    load: () => import("shiki/langs/cmake.mjs"),
    extensions: ["cmake"],
    fileNames: ["CMakeLists.txt"],
  },
  cpp: {
    load: () => import("shiki/langs/cpp.mjs"),
    extensions: ["cpp", "cc", "cxx", "hpp", "hh", "hxx"],
    aliases: ["c++"],
  },
  csharp: {
    load: () => import("shiki/langs/csharp.mjs"),
    extensions: ["cs"],
    aliases: ["c#", "cs"],
  },
  css: {
    load: () => import("shiki/langs/css.mjs"),
    extensions: ["css"],
  },
  diff: {
    load: () => import("shiki/langs/diff.mjs"),
    extensions: ["diff", "patch"],
    aliases: ["patch"],
  },
  docker: {
    load: () => import("shiki/langs/docker.mjs"),
    extensions: ["dockerfile"],
    fileNames: ["Dockerfile", "Containerfile"],
    aliases: ["dockerfile"],
  },
  go: {
    load: () => import("shiki/langs/go.mjs"),
    extensions: ["go"],
    aliases: ["golang"],
  },
  graphql: {
    load: () => import("shiki/langs/graphql.mjs"),
    extensions: ["graphql", "gql"],
    aliases: ["gql"],
  },
  html: {
    load: () => import("shiki/langs/html.mjs"),
    extensions: ["html", "htm", "xhtml"],
  },
  ini: {
    load: () => import("shiki/langs/ini.mjs"),
    extensions: ["ini", "cfg", "conf"],
    fileNames: [".editorconfig", ".gitconfig", ".npmrc"],
  },
  java: {
    load: () => import("shiki/langs/java.mjs"),
    extensions: ["java"],
  },
  javascript: {
    load: () => import("shiki/langs/javascript.mjs"),
    extensions: ["js", "mjs", "cjs"],
    aliases: ["js"],
  },
  json: {
    load: () => import("shiki/langs/json.mjs"),
    extensions: ["json"],
  },
  jsonc: {
    load: () => import("shiki/langs/jsonc.mjs"),
    extensions: ["jsonc"],
  },
  jsx: {
    load: () => import("shiki/langs/jsx.mjs"),
    extensions: ["jsx"],
  },
  kotlin: {
    load: () => import("shiki/langs/kotlin.mjs"),
    extensions: ["kt", "kts"],
    aliases: ["kt"],
  },
  less: {
    load: () => import("shiki/langs/less.mjs"),
    extensions: ["less"],
  },
  lua: {
    load: () => import("shiki/langs/lua.mjs"),
    extensions: ["lua"],
  },
  make: {
    load: () => import("shiki/langs/make.mjs"),
    extensions: ["mk", "mak"],
    fileNames: ["Makefile", "makefile", "GNUmakefile"],
    aliases: ["makefile", "mk"],
  },
  markdown: {
    load: () => import("shiki/langs/markdown.mjs"),
    extensions: ["md", "markdown"],
    aliases: ["md"],
  },
  mdx: {
    load: () => import("shiki/langs/mdx.mjs"),
    extensions: ["mdx"],
  },
  php: {
    load: () => import("shiki/langs/php.mjs"),
    extensions: ["php"],
  },
  proto: {
    load: () => import("shiki/langs/proto.mjs"),
    extensions: ["proto"],
    aliases: ["protobuf"],
  },
  python: {
    load: () => import("shiki/langs/python.mjs"),
    extensions: ["py", "pyi"],
    aliases: ["py"],
  },
  ruby: {
    load: () => import("shiki/langs/ruby.mjs"),
    extensions: ["rb", "rake", "gemspec"],
    fileNames: ["Gemfile", "Rakefile"],
    aliases: ["rb"],
  },
  rust: {
    load: () => import("shiki/langs/rust.mjs"),
    extensions: ["rs"],
    aliases: ["rs"],
  },
  scss: {
    load: () => import("shiki/langs/scss.mjs"),
    extensions: ["scss"],
  },
  sql: {
    load: () => import("shiki/langs/sql.mjs"),
    extensions: ["sql"],
  },
  swift: {
    load: () => import("shiki/langs/swift.mjs"),
    extensions: ["swift"],
  },
  toml: {
    load: () => import("shiki/langs/toml.mjs"),
    extensions: ["toml"],
  },
  tsx: {
    load: () => import("shiki/langs/tsx.mjs"),
    extensions: ["tsx"],
  },
  typescript: {
    load: () => import("shiki/langs/typescript.mjs"),
    extensions: ["ts", "mts", "cts"],
    aliases: ["ts"],
  },
  xml: {
    load: () => import("shiki/langs/xml.mjs"),
    extensions: ["xml", "svg", "plist"],
    aliases: ["svg"],
  },
  yaml: {
    load: () => import("shiki/langs/yaml.mjs"),
    extensions: ["yml", "yaml"],
    aliases: ["yml"],
  },
};

const lookup = (field: "extensions" | "fileNames" | "aliases"): ReadonlyMap<string, string> =>
  new Map(
    Object.entries(languages).flatMap(([id, language]) =>
      (language[field] ?? []).map((key) => [key, id] as const),
    ),
  );

const byFileName = lookup("fileNames");
const byExtension = lookup("extensions");
const byAlias = new Map([
  ...Object.keys(languages).map((id) => [id, id] as const),
  ...lookup("aliases"),
]);

export const languageOf = (nameOrPath: string | null): string | undefined => {
  if (nameOrPath === null) return undefined;
  const name = nameOrPath.split("/").at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  return (
    byFileName.get(name) ??
    (dot >= 0 ? byExtension.get(name.slice(dot + 1).toLowerCase()) : undefined) ??
    byAlias.get(nameOrPath.toLowerCase())
  );
};

const plain = "var(--text-body)";
const themeName = "explain";

const role = (
  foreground: string | undefined,
  fontStyle: "italic" | "bold" | undefined,
  scope: ReadonlyArray<string>,
) => ({
  scope: [...scope],
  settings: {
    ...(foreground === undefined ? {} : { foreground }),
    ...(fontStyle === undefined ? {} : { fontStyle }),
  },
});

const theme: ThemeRegistration = {
  name: themeName,
  type: "dark",
  fg: plain,
  bg: "transparent",
  tokenColors: [
    role("var(--syn-comment)", "italic", [
      "comment",
      "punctuation.definition.comment",
      "markup.quote",
    ]),
    role("var(--syn-keyword)", undefined, [
      "keyword",
      "storage",
      "constant.language",
      "variable.language",
      "entity.name.tag",
      "punctuation.definition.list.begin",
      "meta.diff.range",
      "meta.diff.header",
    ]),
    role("var(--syn-punct)", undefined, ["punctuation", "keyword.operator", "meta.brace"]),
    role("var(--syn-string)", undefined, [
      "string",
      "punctuation.definition.string",
      "markup.inline.raw",
      "punctuation.definition.raw",
      "markup.fenced_code",
      "markup.raw",
    ]),
    role("var(--syn-func)", undefined, ["entity.name.function", "support.function"]),
    role("var(--syn-type)", undefined, [
      "entity.name.type",
      "entity.name.class",
      "entity.other.inherited-class",
      "entity.other.attribute-name",
      "support.type",
      "support.class",
      "variable.parameter",
      "markup.underline.link",
      "string.other.link",
    ]),
    role("var(--syn-number)", undefined, ["constant.numeric"]),
    role("var(--text-strong)", "bold", ["markup.heading", "entity.name.section", "markup.bold"]),
    role(undefined, "italic", ["markup.italic"]),
    role("var(--added)", undefined, ["markup.inserted", "punctuation.definition.inserted"]),
    role("var(--removed)", undefined, ["markup.deleted", "punctuation.definition.deleted"]),
  ],
};

let highlighter: Promise<HighlighterCore> | undefined;

const loaded = new Map<string, Promise<HighlighterCore | undefined>>();

const loadLanguage = (id: string): Promise<HighlighterCore | undefined> => {
  const cached = loaded.get(id);
  if (cached !== undefined) return cached;
  const language = languages[id];
  highlighter ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(
    ([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        themes: [theme],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      }),
  );
  const loading =
    language === undefined
      ? Promise.resolve(undefined)
      : highlighter
          .then(async (core) => {
            await core.loadLanguage(language.load);
            return core;
          })
          .catch(() => undefined);
  loaded.set(id, loading);
  return loading;
};

const escape = (text: string): string =>
  text.replace(/[&<>"]/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : "&quot;",
  );

// FontStyle bits from @shikijs/vscode-textmate, whose const enum is not exported.
const italicBit = 1;
const boldBit = 2;

const renderToken = (token: ThemedToken): string => {
  const fontStyle = token.fontStyle ?? 0;
  const style = [
    token.color === undefined || token.color === plain ? [] : [`color:${token.color}`],
    fontStyle & boldBit ? ["font-weight:600"] : [],
    fontStyle & italicBit ? ["font-style:italic"] : [],
  ]
    .flat()
    .join(";");
  const text = escape(token.content);
  return style === "" ? text : `<span style="${style}">${text}</span>`;
};

export const plainLines = (lines: ReadonlyArray<string>): ReadonlyArray<string> =>
  lines.map(escape);

export const highlightLines = async (
  lines: ReadonlyArray<string>,
  language: string | undefined,
): Promise<ReadonlyArray<string>> => {
  if (language === undefined) return plainLines(lines);
  const core = await loadLanguage(language);
  return core === undefined
    ? plainLines(lines)
    : core
        .codeToTokensBase(lines.join("\n"), { lang: language, theme: themeName })
        .map((line) => line.map(renderToken).join(""));
};
