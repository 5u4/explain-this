# 源码面板

源码面板是正文右侧那一栏，显示页面所引用的代码。它有三种行为：滚动阅读时，它自动跟随离视线最近的引用；鼠标悬停在某个引用上时，它临时预览；点击则把它固定住。一条弯曲的“引线”（leader）把正文里的引用和面板里高亮的行连起来。窄屏下，同一个面板会变成底部抽屉（bottom sheet）。

实现上只有一个控制器类、一个两态的模式机，以及两个只负责“把控制器说要显示的东西画出来”的 React 组件。面板挂在外壳的哪里、侧栏和路由怎么工作，见 [viewer 外壳](./viewer-shell.md)；在页面上产生引用的各个块，见 [blocks](./blocks.md)。

<Tree>

- packages/viewer/src/pane
  - [model.ts](explain:packages/viewer/src/pane/model.ts)：`Anchor`、`PaneMode`、`PaneEvent`、纯函数 `transition`、`PaneState`
  - [controller.ts](explain:packages/viewer/src/pane/controller.ts)：`PaneController`，持有全部可变状态并发布 `PaneState`
  - [anchors.ts](explain:packages/viewer/src/pane/anchors.ts)：在正文中查找 `[data-ref]` 元素
  - [input.ts](explain:packages/viewer/src/pane/input.ts)：鼠标、焦点、点击、按键、滚动、窗口尺寸的监听
  - [geometry.ts](explain:packages/viewer/src/pane/geometry.ts)：分栏断点、阅读线、可见性判断
  - [leader.ts](explain:packages/viewer/src/pane/leader.ts)：绘制 SVG 引线
  - [sheet-drag.ts](explain:packages/viewer/src/pane/sheet-drag.ts)：底部抽屉头部的触摸拖拽
  - [source-pane.tsx](explain:packages/viewer/src/pane/source-pane.tsx)：`<aside class="pane">` 的外框
  - [source-view.tsx](explain:packages/viewer/src/pane/source-view.tsx)：单个文件的高亮代码和区间色带

</Tree>

## 谁创建了它

外壳为每次页面渲染创建一个 `PaneController`，绑定到正文所在的 `<main>`。前提是路由声明需要面板：页面路由传入 [`pane={parsed !== null}`](explain:packages/viewer/src/routes/page-route.tsx:52)，所以解析失败的页面没有面板。

```tsx file=explain:packages/viewer/src/shell/shell.tsx:72-81
```

`start()` 在 `<main>` 上挂 `MutationObserver` 和输入监听；`SourcePane` 渲染出 `<aside>` 和引线 `<svg>` 之后，再调用 [`attach()`](explain:packages/viewer/src/pane/controller.ts:90-104) 把它们交给控制器。控制器是一个外部 store，React 通过 [`useSyncExternalStore(controller.subscribe, controller.getState)`](explain:packages/viewer/src/pane/source-pane.tsx:20) 读取它；“当前显示哪个引用”这件事不存放在 React state 里。

## 锚点：面板能指向什么

控制器不认识任何块。它只在正文里找带 `data-ref` 属性的元素，把属性值解析成引用，包装成一个 `Anchor`：

```ts file=explain:packages/viewer/src/pane/anchors.ts:11-31
```

有两个属性决定锚点的性质。`data-kind` 取 `cite`、`file`、`excerpt`、`note` 之一，缺省为 `cite`。`follow` 决定滚动时能否选中它：整文件引用（`kind` 为 `"file"`）从不参与跟随，任何元素也可以用 `data-follow="0"` 主动退出。各个块的设置如下：

| 产生者 | `data-kind` | 参与跟随 |
|---|---|---|
| 带行号区间的行内引用链接 | [`cite`](explain:packages/viewer/src/blocks/inlines.tsx:46-51) | 是 |
| 整文件的行内引用 | [`file`](explain:packages/viewer/src/blocks/inlines.tsx:46-51) | 否 |
| 摘录的 `<figure>` | [`excerpt`](explain:packages/viewer/src/blocks/code.tsx:160) | 是 |
| 摘录标题栏里的路径链接 | [`cite`，`data-follow="0"`](explain:packages/viewer/src/blocks/code.tsx:162-168) | 否 |
| `<AnnotatedSource>` 的注释按钮 | [`note`](explain:packages/viewer/src/blocks/annotated-source.tsx:23-29) | 是 |
| `<Diff>` 两侧标题里的链接 | [`cite`（未写属性）](explain:packages/viewer/src/blocks/diff.tsx:77-81) | 是 |
| `<Diff>` 行号链接 | [`cite`，`data-follow="0"`](explain:packages/viewer/src/blocks/diff.tsx:89-95) | 否 |

摘录让自己标题栏里的链接退出跟随，这样同一段代码不会被连续跟随两次（推断：代码里没写原因，但 figure 和链接带的是同一个 `data-ref`）。退出跟随的链接仍然可以悬停预览、点击固定；`follow` 只影响滚动跟随和 `[` / `]` 的步进列表。

正文一变，锚点就重新扫描一遍。观察器监听 `childList`，以及 [`hidden`、`open`、`data-ref`](explain:packages/viewer/src/pane/controller.ts:57-63) 三个属性，因为正是它们让锚点出现或消失：`<Tabs>` 的面板切换 [`hidden`](explain:packages/viewer/src/blocks/tabs.tsx:72)，`<details>` 和 `<Tree>` 切换 `open`。锚点按元素缓存在 `WeakMap` 里，只要 `data-ref` 没变，重新扫描拿到的还是同一个 `Anchor` 对象。这一点很重要，因为控制器到处用 `===` 比较锚点。

## 状态模型

`model.ts` 里的模式机刻意做得很小，而且是纯函数：

```ts file=explain:packages/viewer/src/pane/model.ts:19-41
```

| 当前模式 | 事件 | 下一个模式 |
|---|---|---|
| `follow` | `toggle(a)` | `pinned(a)` |
| `follow` | `pin(a)` | `pinned(a)` |
| `follow` | `resume` | `follow` |
| `pinned(a)` | `toggle(a)`，同一个元素 | `follow` |
| `pinned(a)` | `toggle(b)`，另一个元素 | `pinned(b)` |
| `pinned(a)` | `pin(b)` | `pinned(b)` |
| `pinned(a)` | `resume` | `follow` |

事件的来源：

| 事件 | 来源 |
|---|---|
| `toggle` | 分栏布局下点击锚点（[input.ts](explain:packages/viewer/src/pane/input.ts:61-64)） |
| `pin` | 窄屏下点击锚点（[input.ts](explain:packages/viewer/src/pane/input.ts:65-66)）；点击面板里的注释标记（[`activateNote`](explain:packages/viewer/src/pane/controller.ts:122-128)）；已固定的锚点被重新渲染、换了元素但 key 不变（[`#refresh`](explain:packages/viewer/src/pane/controller.ts:173-179)） |
| `resume` | 固定状态下按 `Escape`（[input.ts](explain:packages/viewer/src/pane/input.ts:80-82)）；“恢复跟随”按钮（[`resume()`](explain:packages/viewer/src/pane/controller.ts:130-132)）；`[` / `]`（[`step`](explain:packages/viewer/src/pane/controller.ts:106-120)）；已固定的锚点从页面上消失（[`#refresh`](explain:packages/viewer/src/pane/controller.ts:173-179)） |

模式只是一部分。控制器另外还记着几个候选锚点，[`#render`](explain:packages/viewer/src/pane/controller.ts:224-245) 按固定优先级挑出要显示的那个：

```ts file=explain:packages/viewer/src/pane/controller.ts:228
```

1. `#preview`：鼠标或键盘焦点所在的锚点，仅分栏布局。
2. 模式为 `pinned` 时的固定锚点。
3. `#followed`：阅读线上的锚点。
4. 上一次显示的锚点（只要还在 DOM 里），这样两个锚点之间面板不会变空。

> [!IMPORTANT]
> 预览不是一种模式。悬停永远不改 `PaneMode`，只设置 `#preview`，它在持续期间优先于固定锚点。每次派发事件都会清掉 `#preview`（[`#dispatch`](explain:packages/viewer/src/pane/controller.ts:212-222)）。面板上的状态文字来自 [`state.preview ? "preview" : state.mode.kind`](explain:packages/viewer/src/pane/source-pane.tsx:73)。

结果以 `PaneState` 发布：

```ts file=explain:packages/viewer/src/pane/model.ts:43-51
```

[`#emit`](explain:packages/viewer/src/pane/controller.ts:247-267) 在所有字段都没变时直接返回；否则把 `is-shown` 类从旧锚点元素移到新锚点元素上（正文就是靠这个类高亮“面板正在显示的那个引用”），通知 React，并安排一次引线重绘。

## 跟随阅读线

`follow` 模式下，面板显示“顶边位于视口高度 40% 以上的最后一个可跟随、可见锚点”：

```ts file=explain:packages/viewer/src/pane/geometry.ts:16-24
```

滚动时并不每次都重算。滚动事件只是*启动*一个 150 ms 的计时器；计时器未到期时 [`#update`](explain:packages/viewer/src/pane/controller.ts:191-210) 直接返回，到期（`#settle`）后才算一次阅读锚点。这样面板不会随着滚过的每个引用来回闪（推断：这是代码明显的意图）。计时器期间悬停预览也被忽略（[`#enter`](explain:packages/viewer/src/pane/controller.ts:269-274)），鼠标停着不动、引用从它下面滚过时，不会把面板抢走（推断）。

`[`、`]` 以及面板底部的两个箭头按钮调用 [`step`](explain:packages/viewer/src/pane/controller.ts:106-120)：恢复跟随，选出相邻的可跟随锚点，把页面滚到该锚点顶边位于阅读线上方 4px 处，并把它存进 `#hold`。滚动停下后，[`#rest`](explain:packages/viewer/src/pane/controller.ts:201-204) 先取 `#hold`，再考虑 `readingAnchor`，所以即使平滑滚动停偏了几个像素，显示的仍是你跳到的那个。底部的“引用 3 / 12”就是同一个可跟随列表上的 `position` 和 `total`。

## 输入

[`bindInput`](explain:packages/viewer/src/pane/input.ts:27-116) 把指针和焦点监听挂在 `<main>` 上，把按键、滚动、尺寸监听挂在 `window` 上。每个处理函数都用 `target.closest("[data-ref]")` 加 `WeakMap` 找锚点，所以引用内部嵌套的元素也算数。

| 输入 | 分栏（≥ 1080px） | 窄屏（< 1080px） |
|---|---|---|
| 鼠标移入锚点 | 预览 | 无（`#enter` 要求分栏） |
| 鼠标移出 / 失去焦点 | 160 ms 后清除预览 | 同左 |
| 键盘焦点（`:focus-visible`）落到锚点 | 预览 | 无 |
| 不带修饰键的左键点击 | `toggle` | `pin`，然后打开抽屉 |
| 带 ⌘ / Ctrl / Shift，或非左键点击 | 浏览器默认行为（打开 `href`） | 同左 |
| `Escape` | 已固定则 `resume` | 抽屉开着就关抽屉；否则已固定则 `resume` |
| `[` / `]` | 上一个 / 下一个引用 | 同左 |
| 滚动 | 启动计时器，重绘引线 | 同左 |
| 窗口尺寸变化 | 重算；如果变成分栏就关掉抽屉 | 同左 |

焦点在 `input`、`textarea`、`select`、`dialog` 内时按键被忽略；`Escape` 只有在 `<main>` 不是 `inert` 时才恢复跟随（导航抽屉或底部抽屉打开时 `<main>` 是 `inert`），所以 `Escape` 总是先关最上层的东西。移出后延迟 160 ms（[`#leave`](explain:packages/viewer/src/pane/controller.ts:276-282)），指针在两个相邻引用之间穿过时，面板不会中途跳回去。

点击锚点会调用 `preventDefault()`，所以引用链接上的 `href`（指向源码路由）只在按住 ⌘、Ctrl 或 Shift 点击，或用非主键点击时才生效（[`onClick`](explain:packages/viewer/src/pane/input.ts:56-67)）。按住 Alt 点击和普通点击一样被拦下。

## 渲染源码

`SourcePane` 画外框：仓库、路径、区间标签，来自页面 [sources](./sources.md) 记录的哈希和“已变更 / 已缺失”标记，模式文字（固定时附“恢复跟随”按钮），复制按钮，以及底部计数。主体是一叠 `SourceView`，本页显示过的每个文件一个：

```tsx file=explain:packages/viewer/src/pane/source-pane.tsx:151-169
```

文件只往 `files` 里追加、从不删除，所以切回看过的文件时直接复用已挂载、已高亮的视图；只有当前那个带 `.view.on` 并可见（[pane-view.css](explain:packages/viewer/src/styles/viewer/pane-view.css:1-17)）。其余视图拿到 `focus={null}` 和空注释列表，而 `SourceView` 用了 `memo`，所以它们不会重渲染。

视图内部，每个引用区间对应一条绝对定位的 `.band` 色带，不在任何区间内的行降到 38% 不透明度（[pane-view.css](explain:packages/viewer/src/styles/viewer/pane-view.css:58-80)）。放置色带并滚动过去的逻辑在一个 layout effect 里：

<AnnotatedSource file="explain:packages/viewer/src/pane/source-view.tsx:34-56">
<Note lines="37">只对当前视图生效，并且要等文件行加载完。</Note>
<Note lines="39">`placeBands` 量出每个区间首行和末行 `.ln` 的位置，用 `transform` 和 `height` 摆好对应色带，同时摆放注释标记。</Note>
<Note lines="42-47">区间高度不超过视口高度减 64px 时，滚动后区间上方留出剩余空间（视口高度减区间高度）的 42%；更高的区间则让首行距顶部 32px，保证第一行可见。</Note>
<Note lines="49">色带刚移动过，引线要跟上。</Note>
<Note lines="50-54">面板尺寸变化或抽屉打开会让折行改变行高，观察器负责重新摆放色带。</Note>
<Note lines="56">依赖里有 `sheetOpen`，因为底部抽屉开合会改变滚动容器的高度。</Note>
</AnnotatedSource>

如果显示的是 `<AnnotatedSource>` 的注释，`#render` 还会用 [`noteMarkers`](explain:packages/viewer/src/pane/anchors.ts:33-39) 收集同一个 `.annotated` 组里的全部注释。视图在行号槽里把它们画成带编号的按钮；点击按钮调用 `activateNote`，固定那条注释并把正文滚到它。面板底栏的上一个/下一个按钮同样从面板发起、移动正文：它们调用 `controller.step`，把正文滚到相邻的可跟随锚点（[source-pane.tsx](explain:packages/viewer/src/pane/source-pane.tsx:177-192)、[controller.ts](explain:packages/viewer/src/pane/controller.ts:106-120)）。

## 引线

引线是一个铺满视口的 fixed `<svg>`，里面一条路径、两个圆点。重绘在动画帧循环里进行，[`schedule`](explain:packages/viewer/src/pane/controller.ts:151-160) 每被调用一次就把循环延长到 700 ms 之后，足以跟上正文和面板的平滑滚动，又不必常驻一个 rAF 循环。

<AnnotatedSource file="explain:packages/viewer/src/pane/leader.ts:11-60">
<Note lines="15">窄屏不画引线；锚点不可见时也不画。</Note>
<Note lines="16">面板一端取当前视图的第一条色带，所以引线总是落在高亮区间上。</Note>
<Note lines="22-26">行内引用取第一行框的垂直中点；摘录取靠近顶部的位置，并夹在 figure 范围内。</Note>
<Note lines="27">引用滚出屏幕时直接隐藏，而不是画到视口外的点。</Note>
<Note lines="31-36">从正文栏右侧 14px 画到面板主体左边缘；面板端瞄准色带中点，但对很高的色带最多下移 60px，并夹在面板主体内。</Note>
<Note lines="37-42">两端切线水平的三次贝塞尔曲线，离开正文和进入面板时都是平的。</Note>
<Note lines="48">`data-mode` 让 CSS 在预览时把线画成虚线。</Note>
<Note lines="49-59">只有新显示的锚点才播放描线动画；预览和减少动效模式下不播放。</Note>
</AnnotatedSource>

预览虚线纯由 CSS 实现（[pane-view.css](explain:packages/viewer/src/styles/viewer/pane-view.css:219-221)），面板头部的模式圆点用的也是 `.pane` 上同一个 `data-mode`（[pane.css](explain:packages/viewer/src/styles/viewer/pane.css:92-102)）。

## 桌面面板与底部抽屉

断点只有一个常量 [`splitQuery = "(min-width: 1080px)"`](explain:packages/viewer/src/pane/geometry.ts:3)，与 [bottom-sheet.css](explain:packages/viewer/src/styles/viewer/bottom-sheet.css:1) 里的 `@media (max-width: 1079px)` 对应。两种布局之间不换组件，始终是同一个 `<aside class="pane">`，只是样式不同。

<Tabs>
<Tab label="分栏（≥ 1080px）">

面板是正文旁边的一列网格。悬停预览，点击切换固定，画引线。`sheetOpen` 始终为 `false`：分栏时 [`setSheet(true)`](explain:packages/viewer/src/pane/controller.ts:134-149) 直接返回；窗口从窄屏拉宽到分栏时，已打开的抽屉会被关掉。

宽度不低于 1360px 时外壳分为留白和三列：侧栏、宽 `--prose-w` 的正文、至少 `--pane-min`（440px）宽并一直延伸到窗口右边缘的面板。窗口宽度超过侧栏、正文和 `--pane-max` 之和以前，留白为 0；超过之后留白取多出宽度的一半，侧栏和正文因此落在居中布局的位置，剩下的都归面板（[shell.css](explain:packages/viewer/src/styles/viewer/shell.css:1-7)）。1080px 到 1359px 之间侧栏收进抽屉，面板占剩下的 `1fr`，不设上限（[drawer.css](explain:packages/viewer/src/styles/viewer/drawer.css:1-6)）。正文宽度和留白出现的门槛都由字号推出（[tokens.css](explain:packages/viewer/src/styles/tokens.css:58-59,133-136)）：`--size-prose` 是一个随视口宽度从 1rem 涨到 1.1765rem 的 `clamp`，作用在正文列上（[shell.css](explain:packages/viewer/src/styles/viewer/shell.css:22-28)）；面板里的代码用 `--size-code`，即它的 0.796875 倍（[pane-view.css](explain:packages/viewer/src/styles/viewer/pane-view.css:26-32)）。`--prose-w` 等于 `--size-prose` 的 34 倍加 126px，`--pane-max` 等于 `60 * --size-code + 100px`，所以屏幕越宽，正文、代码和留白出现的门槛一起变大。把 `60` 理解为 100 列、每列 0.6em 的等宽字符是推断，代码里没有写明。

</Tab>
<Tab label="窄屏（< 1080px）">

面板固定在底部，并向下平移到只露出 `--peek`（104px 加安全区）：头部，加一行 `.pane-peek` 显示首个被引用的行。抽屉打开之前主体和底栏是 `visibility: hidden`，引线是 `display: none`（[bottom-sheet.css](explain:packages/viewer/src/styles/viewer/bottom-sheet.css:23-61)）。

滚动时跟随照常工作，所以那一行预览会随着阅读更新。点击引用会固定它并打开抽屉；点预览行、标题或把手也能打开。`setSheet(true)` 给 `body` 加 `sheet-open`，把 `<main>` 和顶栏设为 `inert`，聚焦关闭按钮，并记住稍后要还焦点的元素；关闭时把焦点还回去。

拖动头部（[sheet-drag.ts](explain:packages/viewer/src/pane/sheet-drag.ts:12-22)）时，只有抽屉已打开时才通过 `--drag` 自定义属性跟手移动，而且只跟随向下的拖动（向上的位移按 0 计）；松手时向下超过 80px 就关闭。从露出状态拖动时抽屉不跟手，向上超过 30px 后松手才打开。

</Tab>
</Tabs>

<details>
<summary>为什么用 `inert` 而不是模态对话框</summary>

抽屉和桌面面板是同一个元素，想做成 `<dialog>` 就得在断点处把它挪到别的父节点下。把正文和顶栏设为 `inert` 可以得到相近的效果：抽屉打开时它们无法点击或聚焦，`Escape` 关闭抽屉，触发它的引用会拿回焦点（推断：代码只体现了做法，没写理由）。

</details>
