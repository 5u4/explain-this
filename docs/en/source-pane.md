# Source pane

The source pane is the column to the right of the prose that shows the code a page cites. As you
read, it follows the citation nearest your eye; hovering a citation previews it; clicking pins it. A
curved "leader" line connects the citation in the prose to the highlighted lines in the pane. On a
narrow screen the same pane becomes a bottom sheet.

All of it is one controller class, a two-state mode machine, and two React components that render
whatever the controller says is shown. The rest of the shell (where the pane is mounted, the rail,
routing) is on [viewer shell](./viewer-shell.md); the blocks that put citations on the page are on
[blocks](./blocks.md).

<Tree>

- packages/viewer/src/pane
  - [model.ts](explain:packages/viewer/src/pane/model.ts) — `Anchor`, `PaneMode`, `PaneEvent`, the pure `transition`, `PaneState`
  - [controller.ts](explain:packages/viewer/src/pane/controller.ts) — `PaneController`: owns all mutable state, emits `PaneState`
  - [anchors.ts](explain:packages/viewer/src/pane/anchors.ts) — finds `[data-ref]` elements in the prose
  - [input.ts](explain:packages/viewer/src/pane/input.ts) — mouse, focus, click, key, scroll, resize listeners
  - [geometry.ts](explain:packages/viewer/src/pane/geometry.ts) — the split breakpoint, the reading line, visibility
  - [leader.ts](explain:packages/viewer/src/pane/leader.ts) — draws the SVG leader curve
  - [sheet-drag.ts](explain:packages/viewer/src/pane/sheet-drag.ts) — touch drag on the bottom sheet head
  - [source-pane.tsx](explain:packages/viewer/src/pane/source-pane.tsx) — the `<aside class="pane">` chrome
  - [source-view.tsx](explain:packages/viewer/src/pane/source-view.tsx) — one file's highlighted code with range bands

</Tree>

## Who creates it

The shell creates one `PaneController` per page view, bound to the `<main>` prose column, and only
when the route says there is a pane: the page route passes
[`pane={parsed !== null}`](explain:packages/viewer/src/routes/page-route.tsx:52), so a page that
failed to parse gets no pane.

```tsx file=explain:packages/viewer/src/shell/shell.tsx:72-81
```

`start()` hooks a `MutationObserver` and the input listeners onto `<main>`;
[`attach()`](explain:packages/viewer/src/pane/controller.ts:90-104) is called later by
`SourcePane` once its `<aside>` and leader `<svg>` exist. The controller is an external store: React
reads it with
[`useSyncExternalStore(controller.subscribe, controller.getState)`](explain:packages/viewer/src/pane/source-pane.tsx:20),
and nothing about which citation is shown lives in React state.

## Anchors: what the pane can point at

The controller does not know about blocks. It scans the prose for any element with a `data-ref`
attribute, parses the value as a citation, and wraps it in an `Anchor`:

```ts file=explain:packages/viewer/src/pane/anchors.ts:11-31
```

Two attributes shape an anchor. `data-kind` is one of `cite`, `file`, `excerpt`, `note` (absent
means `cite`). `follow` decides whether scrolling can select it: whole-file citations (`kind
"file"`) never follow, and any element can opt out with `data-follow="0"`. The blocks set these as
follows:

| Emitted by | `data-kind` | follows? |
|---|---|---|
| inline citation link with ranges | [`cite`](explain:packages/viewer/src/blocks/inlines.tsx:46-51) | yes |
| inline citation of a whole file | [`file`](explain:packages/viewer/src/blocks/inlines.tsx:46-51) | no |
| excerpt `<figure>` | [`excerpt`](explain:packages/viewer/src/blocks/code.tsx:148) | yes |
| path link in an excerpt's header | [`cite`, `data-follow="0"`](explain:packages/viewer/src/blocks/code.tsx:150-156) | no |
| `<AnnotatedSource>` note button | [`note`](explain:packages/viewer/src/blocks/annotated-source.tsx:23-29) | yes |
| side header link in a `<Diff>` | [`cite` (attribute absent)](explain:packages/viewer/src/blocks/diff.tsx:77-81) | yes |
| line-number link in a `<Diff>` | [`cite`, `data-follow="0"`](explain:packages/viewer/src/blocks/diff.tsx:89-95) | no |

The excerpt opts its own header link out so the same code is not followed twice in a row
(inference: the code does not say why, but the figure and the link carry the same `data-ref`).
Hovering or clicking an opted-out link still works; `follow` only affects scroll-following and the
`[`/`]` stepping list.

Discovery reruns whenever the prose changes. The observer watches `childList` plus the attributes
[`hidden`, `open` and `data-ref`](explain:packages/viewer/src/pane/controller.ts:57-63), because
those are what hide or reveal anchors: a `<Tabs>` panel toggles
[`hidden`](explain:packages/viewer/src/blocks/tabs.tsx:72), and `<details>` and `<Tree>` toggle
`open`. Anchors are cached by element in a `WeakMap`, so a re-scan reuses the same `Anchor` object
as long as its `data-ref` did not change. Identity matters: the controller compares anchors with
`===` everywhere.

## State model

The mode machine in `model.ts` is deliberately tiny and pure:

```ts file=explain:packages/viewer/src/pane/model.ts:19-41
```

| Mode | Event | Next mode |
|---|---|---|
| `follow` | `toggle(a)` | `pinned(a)` |
| `follow` | `pin(a)` | `pinned(a)` |
| `follow` | `resume` | `follow` |
| `pinned(a)` | `toggle(a)`, same element | `follow` |
| `pinned(a)` | `toggle(b)`, other element | `pinned(b)` |
| `pinned(a)` | `pin(b)` | `pinned(b)` |
| `pinned(a)` | `resume` | `follow` |

Where the events come from:

| Event | Source |
|---|---|
| `toggle` | a click on an anchor in the split layout ([input.ts](explain:packages/viewer/src/pane/input.ts:61-64)) |
| `pin` | a click on an anchor in the narrow layout ([input.ts](explain:packages/viewer/src/pane/input.ts:65-66)); a note marker in the pane ([`activateNote`](explain:packages/viewer/src/pane/controller.ts:122-128)); a pinned anchor re-rendered under the same key ([`#refresh`](explain:packages/viewer/src/pane/controller.ts:173-179)) |
| `resume` | `Escape` while pinned ([input.ts](explain:packages/viewer/src/pane/input.ts:80-82)); the "Resume following" button ([`resume()`](explain:packages/viewer/src/pane/controller.ts:130-132)); `[` / `]` ([`step`](explain:packages/viewer/src/pane/controller.ts:106-120)); a pinned anchor that left the page ([`#refresh`](explain:packages/viewer/src/pane/controller.ts:173-179)) |

The mode is only part of the story. The controller keeps three more candidate anchors, and
[`#render`](explain:packages/viewer/src/pane/controller.ts:224-245) picks the one to show by a fixed
precedence:

```ts file=explain:packages/viewer/src/pane/controller.ts:228
```

1. `#preview`: the anchor under the mouse or keyboard focus, split layout only.
2. the pinned anchor, if the mode is `pinned`.
3. `#followed`: the anchor at the reading line.
4. whatever was shown before, if it is still in the DOM, so the pane never goes blank between anchors.

> [!IMPORTANT]
> Preview is not a mode. Hovering never changes `PaneMode`; it only sets `#preview`, which outranks
> the pin while it lasts. Every dispatched event clears `#preview`
> ([`#dispatch`](explain:packages/viewer/src/pane/controller.ts:212-222)). The pane's label reads
> `preview` / `pinned` / `follow` from
> [`state.preview ? "preview" : state.mode.kind`](explain:packages/viewer/src/pane/source-pane.tsx:73).

The result is published as a `PaneState`:

```ts file=explain:packages/viewer/src/pane/model.ts:43-51
```

[`#emit`](explain:packages/viewer/src/pane/controller.ts:247-267) skips the update when every field
is identical, moves the `is-shown` class from the old anchor element to the new one (that class is
how the prose highlights the citation being shown), notifies React, and schedules a leader redraw.

## Following the reading line

In `follow` mode the pane shows the last followable, visible anchor whose top edge is above 40% of
the viewport height:

```ts file=explain:packages/viewer/src/pane/geometry.ts:16-24
```

Recomputing on every scroll event would make the pane flicker through each citation that scrolls
past (inference: that is the evident purpose). Instead a scroll only *arms* a 150 ms timer; while it is armed,
[`#update`](explain:packages/viewer/src/pane/controller.ts:191-210) returns early, and when the
timer fires (`#settle`) the reading anchor is computed once. Hover previews are ignored while the
timer is armed, too ([`#enter`](explain:packages/viewer/src/pane/controller.ts:269-274)), so a
mouse resting still while citations scroll under it does not steal the pane (inference).

`[` and `]` (and the arrows in the pane footer) call
[`step`](explain:packages/viewer/src/pane/controller.ts:106-120). It resumes following, picks the
neighbouring followable anchor, scrolls the page so that anchor's top sits 4px above the reading line, and
stores it in `#hold`. When the scroll settles, [`#rest`](explain:packages/viewer/src/pane/controller.ts:201-204)
takes `#hold` before asking `readingAnchor`, so the anchor you stepped to wins even if a smooth
scroll stopped a few pixels off. The footer's "Citation 3 / 12" is `position` and `total` from the
same followable list.

## Input

[`bindInput`](explain:packages/viewer/src/pane/input.ts:27-116) attaches pointer and focus listeners
to `<main>` and key, scroll and resize listeners to `window`. Every handler finds its anchor with
`target.closest("[data-ref]")` and the `WeakMap`, so nested markup inside a citation still counts.

| Input | Split (≥ 1080px) | Narrow (< 1080px) |
|---|---|---|
| mouse over an anchor | preview it | nothing (`#enter` requires split) |
| mouse out / focus out | clear preview after 160 ms | same |
| keyboard focus (`:focus-visible`) on an anchor | preview it | nothing |
| plain left click on an anchor | `toggle` | `pin`, then open the sheet |
| click with ⌘ / Ctrl / Shift, or another button | browser default (follows the `href`) | same |
| `Escape` | `resume` if pinned | close the sheet if open; otherwise `resume` if pinned |
| `[` / `]` | step to previous / next citation | same |
| scroll | arm the settle timer, redraw leader | same |
| resize | recompute; close the sheet if the window became split | same |

Keys are ignored inside `input`, `textarea`, `select` and `dialog`, and `Escape` only resumes when
`<main>` is not `inert` (the nav drawer or the sheet makes it inert), so `Escape` closes the
topmost thing first. The 160 ms delay on leave lets the pointer cross the gap between two adjacent
citations without the pane snapping back in between
([`#leave`](explain:packages/viewer/src/pane/controller.ts:276-282)).

Clicking an anchor calls `preventDefault()`, so the `href` on a citation link (a link to the source
route) only matters to a click with ⌘, Ctrl, or Shift held, or a non-primary button
([`onClick`](explain:packages/viewer/src/pane/input.ts:56-67)). An Alt-click is intercepted like a
plain click.

## Rendering the source

`SourcePane` renders the chrome: repo, path, range label, the recorded hash and a "changed" /
"missing" flag from the page's [sources](./sources.md) entry, the mode label with a
"Resume following" button when pinned, a copy button, and the footer counter. The body is a stack of
`SourceView`s, one per file ever shown on this page:

```tsx file=explain:packages/viewer/src/pane/source-pane.tsx:151-169
```

Files are appended to `files` and never removed, so switching back to a file you already looked at
reuses its mounted, highlighted view; only the active one gets `.view.on` and is visible
([pane-view.css](explain:packages/viewer/src/styles/viewer/pane-view.css:1-17)). The others get
`focus={null}` and empty notes, and `SourceView` is `memo`ized, so they do not re-render.

Inside a view, each cited range gets an absolutely positioned `.band`, and lines outside every range
are dimmed to 38% opacity ([pane-view.css](explain:packages/viewer/src/styles/viewer/pane-view.css:58-80)).
Placing the bands and scrolling to them happens in a layout effect:

<AnnotatedSource file="explain:packages/viewer/src/pane/source-view.tsx:34-56">
<Note lines="37">Runs only for the active view, and only after the file's lines have loaded.</Note>
<Note lines="39">`placeBands` measures the first and last `.ln` row of each range and moves one band per range with `transform` and `height`; it also positions note markers.</Note>
<Note lines="42-47">If the range is no taller than the viewport minus 64px, the scroll puts 42% of the leftover space (viewport height minus range height) above it; a taller range starts 32px from the top so its first line is visible.</Note>
<Note lines="49">The band just moved, so the leader must follow it.</Note>
<Note lines="50-54">Wrapping lines change row heights when the pane resizes or the sheet opens; the observer re-places the bands.</Note>
<Note lines="56">`sheetOpen` is a dependency because the bottom sheet changes the scroller height.</Note>
</AnnotatedSource>

When the shown anchor is an `<AnnotatedSource>` note, `#render` also collects every note of the same
`.annotated` group with [`noteMarkers`](explain:packages/viewer/src/pane/anchors.ts:33-39). The view
draws them as numbered buttons in the gutter; clicking one calls `activateNote`, which pins that note
and scrolls the prose to it. The footer's previous/next buttons also start in the pane and move the
page: they call `controller.step`, which scrolls the prose to the next followable anchor
([source-pane.tsx](explain:packages/viewer/src/pane/source-pane.tsx:177-192),
[controller.ts](explain:packages/viewer/src/pane/controller.ts:106-120)).

## The leader line

The leader is a fixed, full-viewport `<svg>` with one path and two dots. It is redrawn in an
animation-frame loop that [`schedule`](explain:packages/viewer/src/pane/controller.ts:151-160)
keeps alive for 700 ms after each request, long enough to track smooth scrolls of both the page and
the pane without a permanent rAF loop.

<AnnotatedSource file="explain:packages/viewer/src/pane/leader.ts:11-60">
<Note lines="15">No leader in the narrow layout, and none when the anchor is hidden.</Note>
<Note lines="16">The far end is the first band of the visible view: the leader always lands on the highlighted range.</Note>
<Note lines="22-26">An inline citation is joined at its first line box's middle; an excerpt figure is joined near its top, clamped inside the figure.</Note>
<Note lines="27">If the citation is scrolled off screen, hide instead of drawing to a point outside the viewport.</Note>
<Note lines="31-36">From 14px right of the prose column to the pane body's left edge; the pane end aims at the band's center, capped at 60px down for tall bands, clamped inside the pane body.</Note>
<Note lines="37-42">A horizontal-tangent cubic Bézier, so the curve leaves the prose and enters the pane flat.</Note>
<Note lines="48">`data-mode` lets CSS dash the line while previewing.</Note>
<Note lines="49-59">Only a newly shown anchor animates the stroke in, and never for previews or with reduced motion.</Note>
</AnnotatedSource>

The preview dash is pure CSS ([pane-view.css](explain:packages/viewer/src/styles/viewer/pane-view.css:219-221)),
and the mode dot in the pane head uses the same `data-mode` on `.pane`
([pane.css](explain:packages/viewer/src/styles/viewer/pane.css:92-102)).

## Desktop pane vs bottom sheet

The breakpoint is one constant, [`splitQuery = "(min-width: 1080px)"`](explain:packages/viewer/src/pane/geometry.ts:3),
mirrored by the `@media (max-width: 1079px)` block in
[bottom-sheet.css](explain:packages/viewer/src/styles/viewer/bottom-sheet.css:1). The controller does
not swap components between the two: it is the same `<aside class="pane">`, restyled.

<Tabs>
<Tab label="Split (≥ 1080px)">

The pane is a grid column beside the prose. Hover previews, click toggles a pin, the leader is
drawn. `sheetOpen` stays `false`: [`setSheet(true)`](explain:packages/viewer/src/pane/controller.ts:134-149)
returns early when split, and a resize into the split layout closes an open sheet.

</Tab>
<Tab label="Narrow (< 1080px)">

The pane is fixed to the bottom and translated down so that only `--peek` (104px plus the safe-area
inset) shows: the head and a one-line `.pane-peek` with the first cited line. The body and footer
are `visibility: hidden` until the sheet opens, and the leader is `display: none`
([bottom-sheet.css](explain:packages/viewer/src/styles/viewer/bottom-sheet.css:23-61)).

Following still works while you scroll, so the peek line updates under your thumb. Tapping a
citation pins it and opens the sheet; tapping the peek line, the title, or the handle opens it too.
`setSheet(true)` adds `body.sheet-open`, makes `<main>` and the top bar `inert`, focuses the close
button, and remembers the element to return focus to; closing restores that focus.

Dragging the head ([sheet-drag.ts](explain:packages/viewer/src/pane/sheet-drag.ts:16-22)) moves the
sheet with the finger through the `--drag` custom property; letting go more than 80px down closes
it, and more than 30px up from the peek opens it.

</Tab>
</Tabs>

<details>
<summary>Why `inert` instead of a modal dialog</summary>

The sheet is the same element as the desktop pane, so it cannot be a `<dialog>` without
re-parenting it at the breakpoint. Making the prose and the top bar `inert` gives much of the same
effect: they cannot be clicked or focused while the sheet is up, `Escape` closes it, and the
triggering citation gets focus back (inference: the code shows the mechanism, not the reasoning).

</details>
