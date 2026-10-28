import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export type DocPage = { id: string; file: string; markdown: string };

export type CodeFile = { key: string; path: string; file: string };

export type DocDir = { dir: string; name: string; pages: DocPage[]; codeFiles: CodeFile[] };

export const explainRoot = (home: string): string => join(home, ".explain");

function readCodeFiles(dir: string): CodeFile[] {
  const code = join(dir, "code");
  if (!existsSync(code)) return [];
  return readdirSync(code, { withFileTypes: true })
    .filter((key) => key.isDirectory())
    .flatMap((key) => {
      const root = join(code, key.name);
      return readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => !entry.isDirectory())
        .map((entry) => {
          const file = join(entry.parentPath, entry.name);
          return { key: key.name, path: relative(root, file), file };
        });
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

export function readDocDirs(home: string): DocDir[] {
  const root = explainRoot(home);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = join(root, entry.name);
      const pages = readdirSync(dir, { withFileTypes: true })
        .filter((page) => page.isFile() && page.name.endsWith(".md"))
        .map((page) => ({
          id: page.name.slice(0, -".md".length),
          file: page.name,
          markdown: readFileSync(join(dir, page.name), "utf8"),
        }))
        .sort((a, b) => a.file.localeCompare(b.file));
      return { dir, name: entry.name, pages, codeFiles: readCodeFiles(dir) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
