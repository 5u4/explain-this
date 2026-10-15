import type { Position } from "@explain/contract/page";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { compile } from "tailwindcss";
import type { Diagnostic } from "./types.ts";

export interface WidgetModule {
  readonly name: string;
  readonly text: string;
}

export interface WidgetStyles {
  readonly css: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

const twTemplatePattern = /(?<![\w$])tw`([^`]*)`/g;
const classPattern = /\S+/g;
const arbitraryPattern = /[[\]()]/;

const tailwindSheets = ["tailwindcss/theme.css", "tailwindcss/utilities.css"] as const;

const positionAt = (text: string, offset: number): Position => {
  const before = text.slice(0, offset);
  const lineStart = before.lastIndexOf("\n");
  return { line: before.split("\n").length, column: offset - lineStart };
};

const scanClasses = (file: string, text: string) => {
  const classes: Array<Position & { readonly name: string }> = [];
  const diagnostics: Array<Diagnostic> = [];
  for (const template of text.matchAll(twTemplatePattern)) {
    const body = template[1] ?? "";
    const bodyOffset = template.index + "tw`".length;
    const substitution = body.indexOf("${");
    if (substitution >= 0) {
      diagnostics.push({
        file,
        ...positionAt(text, bodyOffset + substitution),
        message: "tw`…` takes no substitutions; choose between whole tw`…` strings in JS",
      });
      continue;
    }
    for (const name of body.matchAll(classPattern)) {
      classes.push({ name: name[0], ...positionAt(text, bodyOffset + name.index) });
    }
  }
  return { classes, diagnostics };
};

export const buildWidgetStyles = Effect.fnUntraced(function* (
  modules: ReadonlyArray<WidgetModule>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entry = yield* path
    .fromFileUrl(new URL(import.meta.resolve("@explain/viewer/widgets.css")))
    .pipe(Effect.orDie);
  const sheets: Record<string, { path: string; base: string; content: string }> = {};
  for (const id of tailwindSheets) {
    const file = yield* path.fromFileUrl(new URL(import.meta.resolve(id))).pipe(Effect.orDie);
    sheets[id] = { path: file, base: path.dirname(file), content: yield* fs.readFileString(file) };
  }
  const entryCss = yield* fs.readFileString(entry);
  const compiler = yield* Effect.promise(() =>
    compile(entryCss, {
      base: path.dirname(entry),
      loadStylesheet: async (id) => {
        const sheet = sheets[id];
        if (sheet === undefined) throw new Error(`widgets.css imports ${id}`);
        return sheet;
      },
    }),
  );

  const scans = modules.map((module) => {
    const file = `widgets/${module.name}.js`;
    return { file, ...scanClasses(file, module.text) };
  });
  let css = compiler.build([]);
  const generated = new Set<string>();
  for (const { classes } of scans) {
    for (const { name } of classes) {
      if (generated.has(name) || arbitraryPattern.test(name)) continue;
      // build() returns the stylesheet for every candidate so far, so it grows only when name is a utility.
      const next = compiler.build([name]);
      if (next !== css) generated.add(name);
      css = next;
    }
  }

  const diagnostics = scans.flatMap(({ file, classes, diagnostics }) =>
    [
      ...diagnostics,
      ...classes.flatMap(({ name, line, column }) =>
        arbitraryPattern.test(name)
          ? [{ file, line, column, message: `"${name}" is an arbitrary value; use a theme class` }]
          : generated.has(name)
            ? []
            : [{ file, line, column, message: `"${name}" is not a class of the widget theme` }],
      ),
    ].sort((a, b) => a.line - b.line || a.column - b.column),
  );
  return { css, diagnostics } satisfies WidgetStyles;
});
