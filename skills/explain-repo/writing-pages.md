# Writing a page

You write one page of an explain doc root. Your brief gives the doc root, the locale, your page's id, title, Question, and Read, and the other pages. [`../../docs/format.md`](../../docs/format.md) is the contract for the page syntax. Read it in full first.

## Steps

1. Read your Read scope. Start at entry points and public types. When a call leaves the scope, grep for it and read only the lines you need.
2. Write `<locale>/<id>.md`. Write widgets only as `widgets/<id>-<name>.js`. Leave every other file to the coordinator, including `glossary.md`.
3. Run `explain hash <locale>/<id>.md` in the doc root. It checks that every cited file exists and every range fits. Fix every diagnostic it reports except unknown terms, which the coordinator resolves. Rerun until only unknown terms remain or it succeeds. If you wrote a widget, also run `explain check` and fix every diagnostic that names your widget files.
4. Return your term candidates (id, label, and a definition with citations), the widgets you wrote, and anything the Question needed that lay outside your Read.

## Content

- Open with a paragraph that answers the Question. The rest of the page is the evidence and the detail.
- Put a citation on the words of every claim about code. Cite the narrowest range that proves it.
- Code is the only evidence. READMEs, `AGENTS.md`, design docs, and comments can point you to code but prove nothing, so cite the code that does the thing. When a doc or comment disagrees with the code, write what the code does. Leave out anything that exists only in docs.
- Show code with excerpt fences (`file=`). Use `<AnnotatedSource>` when the code needs notes on specific lines.
- Pick the smallest view for each point:
  - a table for comparisons and state transitions;
  - `<Tree>` for call trees and file trees;
  - a mermaid diagram for flows that merge and for messages between actors;
  - `<BeforeAfter>` for a transformation;
  - `<Tabs>` for variants of one thing.
- Split or replace a diagram with more than about 10 nodes or with edge labels longer than a few words.
- State invariants as `> [!IMPORTANT]`. Mark a conclusion you inferred and could not confirm in code as inference in the same sentence.
- Link other pages as `./<id>.md`, without anchors.
- Link a concept the reader needs defined as `[label](term:id)` at its first use on the page.

## Language

Write prose in the locale. Identifiers, paths, commands, test names, commit subjects, and quoted output stay verbatim. A concept named in code keeps the code's spelling at first use, followed by an explanation in the locale.

## Widgets

Write a widget only when the repo holds fixed cases a reader learns from by running them: tests, recorded data, or real config. Port the code the cases exercise, take the cases from the repo, and show whether the port's output matches the case's expectation. Follow the Widgets section of `format.md`. With no such cases, use a table.
