# Widgets

A widget is an interactive view on a page:

```md
<Widget name="parse-ref" title="Parse a citation" source="explain:packages/contract/src/citation.ts:62-72 explain:packages/contract/src/citation.test.ts">

One paragraph that says what the widget shows.

</Widget>
```

- `name` is the module `widgets/<name>.js`.
- `title` heads the frame.
- `source` lists, space-separated, the citations of the code the widget ports or reads; the page goes
  stale when they change.
- Any other attribute reaches the module as a string prop.

The viewer draws the frame: the title, the tag body as description, and the `source` citations. The
module fills the body.

## Module

```ts
export function mount(root: HTMLElement, ctx: WidgetContext): void | (() => void)

type WidgetContext = {
  props: Readonly<Record<string, string>>   // tag attributes other than name, title, source
  locale: string
  cite(ref: string, label?: string): HTMLElement   // a citation element wired to the source pane
  readSource(ref: string): Promise<string>         // file text for a citation
}
```

- Show only cases the cited code or its tests contain; the reader chooses among those fixed cases.
- Style with the widget theme's Tailwind classes and the base classes `ui-button`, `ui-select`,
  `ui-segmented`, `ui-table`, `ui-code`, `ui-tag`.
- UI strings live in the module, keyed by locale, with an `en` fallback.

## Classes

Write every Tailwind class inside a `tw` tagged template, with `const tw = String.raw;` at the top of
the module. Text inside `tw` templates is the only text read as classes; a class written anywhere
else gets no CSS.

```js
const tw = String.raw;
const ROW = tw`flex items-center gap-2 rounded-small bg-raised`;
el("li", { class: dropped ? tw`opacity-60 line-through decoration-removed` : ROW });
el("select", { class: `ui-select ${tw`min-w-0 max-sm:w-full`}` });
```

- Vary classes by choosing between whole `tw` strings in JS, or by toggling a boolean `data-*`
  attribute styled with a `data-name:` variant.
- Base classes (`ui-select`, …) are plain strings outside `tw`.

Utilities are `!important`, so they win over the viewer's CSS; properties a widget leaves unset
inherit from the page, such as the prose margins on `p`, `ol`, and `li`.

## Theme

The widget theme replaces Tailwind's colors, fonts, font sizes, and radii with the viewer's tokens.
Font weights, letter spacing, line heights, breakpoints (`sm` is 40rem), transitions, and variants
keep Tailwind's defaults.

| Utility family | Classes | Token |
|---|---|---|
| Color (`bg-`, `text-`, `border-`, `inset-ring-`, `decoration-`, `fill-`, `stroke-`, …) | `page`, `raised`, `inset` | `--surface-page`, `--surface-raised`, `--surface-inset` |
| | `border`, `border-strong` | `--border`, `--border-strong` |
| | `strong`, `body`, `muted`, `faint` | `--text-strong`, `--text-body`, `--text-muted`, `--text-faint` |
| | `mark`, `removed`, `added`, `fresh`, `stale`, `note`, `important`, `warning`, `focus`, `pass`, `pass-wash`, `fail`, `fail-wash` | the token of the same name |
| Font family | `font-body`, `font-display`, `font-mono` | `--font-body`, `--font-display`, `--font-mono` |
| Font size | `text-step--1`, `text-step-0`, `text-step-1`, `text-step-2` | `--step--1` … `--step-2` |
| Radius | `rounded-small`, `rounded-medium` | `--radius-s`, `--radius-m` |
| Spacing (`p-`, `m-`, `gap-`, `w-`, `min-w-`, `leading-`, …) | `N` in steps of 0.25, such as `min-w-24.5` | `N × --space-1` (4px) |

Every token in the table, plus `--space-1` … `--space-8`, is a CSS custom property on `:root`.

A meaning color means one thing across the site: `mark` ties prose to source, `removed` with
strike-through is removed or folded away, `fresh` and `stale` are page freshness, and `pass` and
`fail` say whether a port agrees with the test it reproduces; pair `pass` and `fail` with ✓ and ✗. A
value that is neither good nor bad, such as which branch a function returned, uses the text colors.
