import type { LanguageFn } from "highlight.js";
import hljs from "highlight.js/lib/core";

type Language = {
  readonly load: () => Promise<{ readonly default: LanguageFn }>;
  readonly extensions?: ReadonlyArray<string>;
  readonly fileNames?: ReadonlyArray<string>;
  readonly aliases?: ReadonlyArray<string>;
  readonly embeds?: ReadonlyArray<string>;
};

const languages: Readonly<Record<string, Language>> = {
  bash: {
    load: () => import("highlight.js/lib/languages/bash"),
    extensions: ["sh", "bash", "zsh"],
    fileNames: [".bashrc", ".bash_profile", ".zshrc", ".profile"],
    aliases: ["shell", "sh", "zsh", "console"],
  },
  c: {
    load: () => import("highlight.js/lib/languages/c"),
    extensions: ["c", "h"],
  },
  cmake: {
    load: () => import("highlight.js/lib/languages/cmake"),
    extensions: ["cmake"],
    fileNames: ["CMakeLists.txt"],
  },
  cpp: {
    load: () => import("highlight.js/lib/languages/cpp"),
    extensions: ["cpp", "cc", "cxx", "hpp", "hh", "hxx"],
    aliases: ["c++"],
  },
  csharp: {
    load: () => import("highlight.js/lib/languages/csharp"),
    extensions: ["cs"],
    aliases: ["c#", "cs"],
  },
  css: {
    load: () => import("highlight.js/lib/languages/css"),
    extensions: ["css"],
  },
  diff: {
    load: () => import("highlight.js/lib/languages/diff"),
    extensions: ["diff", "patch"],
    aliases: ["patch"],
  },
  dockerfile: {
    load: () => import("highlight.js/lib/languages/dockerfile"),
    embeds: ["bash"],
    extensions: ["dockerfile"],
    fileNames: ["Dockerfile", "Containerfile"],
    aliases: ["docker"],
  },
  go: {
    load: () => import("highlight.js/lib/languages/go"),
    extensions: ["go"],
    aliases: ["golang"],
  },
  graphql: {
    load: () => import("highlight.js/lib/languages/graphql"),
    extensions: ["graphql", "gql"],
    aliases: ["gql"],
  },
  ini: {
    load: () => import("highlight.js/lib/languages/ini"),
    extensions: ["ini", "toml", "cfg", "conf"],
    fileNames: [".editorconfig", ".gitconfig", ".npmrc"],
    aliases: ["toml"],
  },
  java: {
    load: () => import("highlight.js/lib/languages/java"),
    extensions: ["java"],
  },
  javascript: {
    load: () => import("highlight.js/lib/languages/javascript"),
    embeds: ["css", "xml"],
    extensions: ["js", "jsx", "mjs", "cjs"],
    aliases: ["js", "jsx"],
  },
  json: {
    load: () => import("highlight.js/lib/languages/json"),
    extensions: ["json", "jsonc"],
    aliases: ["jsonc"],
  },
  kotlin: {
    load: () => import("highlight.js/lib/languages/kotlin"),
    extensions: ["kt", "kts"],
    aliases: ["kt"],
  },
  less: {
    load: () => import("highlight.js/lib/languages/less"),
    extensions: ["less"],
  },
  lua: {
    load: () => import("highlight.js/lib/languages/lua"),
    extensions: ["lua"],
  },
  makefile: {
    load: () => import("highlight.js/lib/languages/makefile"),
    extensions: ["mk", "mak"],
    fileNames: ["Makefile", "makefile", "GNUmakefile"],
    aliases: ["make", "mk"],
  },
  markdown: {
    load: () => import("highlight.js/lib/languages/markdown"),
    embeds: ["xml"],
    extensions: ["md", "markdown", "mdx"],
    aliases: ["md"],
  },
  php: {
    load: () => import("highlight.js/lib/languages/php"),
    extensions: ["php"],
  },
  protobuf: {
    load: () => import("highlight.js/lib/languages/protobuf"),
    extensions: ["proto"],
    aliases: ["proto"],
  },
  python: {
    load: () => import("highlight.js/lib/languages/python"),
    extensions: ["py", "pyi"],
    aliases: ["py"],
  },
  ruby: {
    load: () => import("highlight.js/lib/languages/ruby"),
    extensions: ["rb", "rake", "gemspec"],
    fileNames: ["Gemfile", "Rakefile"],
    aliases: ["rb"],
  },
  rust: {
    load: () => import("highlight.js/lib/languages/rust"),
    extensions: ["rs"],
    aliases: ["rs"],
  },
  scss: {
    load: () => import("highlight.js/lib/languages/scss"),
    extensions: ["scss"],
  },
  sql: {
    load: () => import("highlight.js/lib/languages/sql"),
    extensions: ["sql"],
  },
  swift: {
    load: () => import("highlight.js/lib/languages/swift"),
    extensions: ["swift"],
  },
  typescript: {
    load: () => import("highlight.js/lib/languages/typescript"),
    embeds: ["css", "xml"],
    extensions: ["ts", "tsx", "mts", "cts"],
    aliases: ["ts", "tsx"],
  },
  xml: {
    load: () => import("highlight.js/lib/languages/xml"),
    embeds: ["css", "javascript"],
    extensions: ["xml", "html", "htm", "svg", "xhtml", "plist"],
    aliases: ["html", "svg"],
  },
  yaml: {
    load: () => import("highlight.js/lib/languages/yaml"),
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

const registered = new Map<string, Promise<boolean>>();

const register = (id: string, language: Language): Promise<boolean> => {
  const cached = registered.get(id);
  if (cached !== undefined) return cached;
  const loading = language.load().then(
    (module) => {
      hljs.registerLanguage(id, module.default);
      return true;
    },
    () => false,
  );
  registered.set(id, loading);
  return loading;
};

const withEmbeds = (id: string, found = new Map<string, Language>()): Map<string, Language> => {
  const language = languages[id];
  if (found.has(id) || language === undefined) return found;
  found.set(id, language);
  for (const embed of language.embeds ?? []) withEmbeds(embed, found);
  return found;
};

const loadLanguage = async (id: string): Promise<boolean> => {
  const [own = false] = await Promise.all(
    [...withEmbeds(id)].map(([each, language]) => register(each, language)),
  );
  return own;
};

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

export const plainLines = (lines: ReadonlyArray<string>): ReadonlyArray<string> =>
  lines.map((line) =>
    line.replace(/[&<>"]/g, (char) =>
      char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : "&quot;",
    ),
  );

export const highlightLines = async (
  lines: ReadonlyArray<string>,
  language: string | undefined,
): Promise<ReadonlyArray<string>> =>
  language !== undefined && (await loadLanguage(language))
    ? splitHighlighted(hljs.highlight(lines.join("\n"), { language, ignoreIllegals: true }).value)
    : plainLines(lines);
