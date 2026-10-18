# Citations

*citation* 是 page 用来指向 code 的 string，例如 `explain:packages/contract/src/citation.ts:62-72`。
*doc root* 是存放 page 的 directory，它的 settings file 叫 `explain.json`。一个 citation 由三个 part 组成：
*repo key*，即 `explain.json` 给某个 checkout 下来的 repo 起的 name；repo 里的 path；可选的 *line range*，
即一段从 1 起数的 line number，两端都算在内。[`parseRef`](explain:packages/contract/src/citation.ts:62-72)
把这个 string 变成 *`Ref`*，即 parse 之后的 value `{ repo, path, ranges }`；遇到 failure 时，它给出一条
error message。它能成立，靠的是一个想法：`parseRef` 只查 syntax。它按 `:` 切开 string，用固定的 rule
检查每个 part，从不读 file。cited code 是否真的存在，之后由本项目负责加载 doc root 的 command-line tool，
即 `explain` CLI，来查（[check-page.ts](explain:packages/cli/src/doc-root/check-page.ts:58-70)）。

## 一个 link target 经过五步变成 `Ref`

本页只跟一个例子：*page parser*（把 page 的 Markdown 转成 structured block 的那段 code）在某个
paragraph 里遇到 link `[parseRef](explain:packages/contract/src/citation.ts:62-72)`，此时还没有任何 check
看过 repo 或 file 是否存在。

### scheme 不是 `http`、`https` 或 `mailto`，所以 page parser 把 target 交给 `parseRef`

link target 可能是 anchor（`#name`）、*page link*（`./other.md`，指向同一 doc root 里另一个 page 的 link）、web URL 或 citation。page parser
按 prefix 给它分类。anchor 和 page link 最先处理（[inline.ts](explain:packages/contract/src/parse-page/inline.ts:17-33)）。
下面的 excerpt 是接下来的部分：先读出 scheme；三个 web scheme 返回普通 link；其余 scheme 都交给 citation check。

```ts file=explain:packages/contract/src/parse-page/inline.ts:34,42-44
```

target `explain:packages/contract/src/citation.ts:62-72` 的 scheme 是 `explain`。于是 page parser 通过
[context.ts](explain:packages/contract/src/parse-page/context.ts:20-25) 里的一个小 helper 调用 `parseRef`。
target 以 `#` 或 `./` 开头时，这一步不会发生；scheme 是 `http`、`https` 或 `mailto` 时也不会。

### 按 `:` 切开后，正好得到 `parseRef` 接受的三个 part

citation 带三个 part。为了把它们分开，`parseRef` 按每个 `:` 切开 target，只接受两个或三个 part
（[citation.ts](explain:packages/contract/src/citation.ts:63-67)）。本例得到 `explain`、
`packages/contract/src/citation.ts` 和 `62-72`。`:` 是唯一的 separator，所以 path 里永远不能有 `:`。
少于两个或多于三个 part 时，`parseRef` 到此返回 failure，error message 是
`citation "…" must be <repo>:<path>[:<ranges>]`。

### repo key 和 path 只过 syntax check，不碰 disk

`parseRef` 先查 repo key，再查 path。最先发现的 problem 就成为 error
（[citation.ts](explain:packages/contract/src/citation.ts:68-69)）。负责 repo key 的
[`repoKeyProblem`](explain:packages/contract/src/citation.ts:24-28) 接受 `explain`：它以 lowercase letter
开头，后面只有 lowercase letter、digit 或 `-`。`http`、`https`、`mailto` 这三个 name 留给 web link，code 里叫
[reserved key](explain:packages/contract/src/citation.ts:16-20)；`explain` 不是其中之一。负责 path 的
[`pathProblem`](explain:packages/contract/src/citation.ts:30-41) 接受
`packages/contract/src/citation.ts`：它不是 empty string，是 relative path，用 `/` 作 separator，也没有
empty、`.` 或 `..` 的 segment。这些 rule 保证 repo key 是 doc root 能声明的 name，path 也爬不出所在的 repo。
任一 check 返回 message，`parseRef` 就到此返回 failure。

### string `62-72` 变成一个从 line 62 到 line 72 的 line range

有第三个 part 时，`parseRef` 把 `62-72` 交给 [`parseRanges`](explain:packages/contract/src/citation.ts:43-60)，
把 string 变成 number。它按 `,` 切开，切出的每一项都要匹配 [`rangePattern`](explain:packages/contract/src/citation.ts:22)
（`N` 或 `N-M`，不能是 0，也不能有 leading zero）。`62-72` 读成 line range `{ from: 62, to: 72 }`。
结尾早于开头的 line range 会被拒绝。没有从上一个 line range 结尾之后开始的 line range 也会被拒绝。
这样，每组 line range 都只有一种写法。citation 没有第三个 part 时，这一步不会发生：`parseRef` 直接返回
`ranges: []`，表示整个 file（[citation.ts](explain:packages/contract/src/citation.ts:70)）。
遇到第一个违反 rule 的 line range，这一步就提前结束。

### `Ref` 进入 page，或者 error 被记在 link 上

`parseRef` 把 line range 包进 `Ref`：
`{ repo: "explain", path: "packages/contract/src/citation.ts", ranges: [{ from: 62, to: 72 }] }`
（[citation.ts](explain:packages/contract/src/citation.ts:71)）。回到 helper 后，success 的 `Ref` 加入 page 的
`Ref` list（[context.ts](explain:packages/contract/src/parse-page/context.ts:23-24)），link 也在 page 里变成
citation（[inline.ts](explain:packages/contract/src/parse-page/inline.ts:44)）。遇到 failure 时，helper
跳过这两件事，改为记下一条 *diagnostic*：带着 link 所在 line 和 column 的 error message
（[context.ts](explain:packages/contract/src/parse-page/context.ts:22)）。负责检查 doc root 里 page 的
command `explain validate` 会报告它。

## 其他 citation 都在 line range 这一步离开主线

下面每个 variant 在第四步之前都和本例走同一条路。

| target | 分岔的地方 | 得到什么 |
|---|---|---|
| `explain:packages/contract/src/citation.ts` | 没有第三个 part，跳过第四步 | `ranges: []`，整个 file |
| `explain:packages/contract/src/citation.ts:3,62-72` | 第四步读到两个 line range | 两个 line range，按先后排列 |
| `explain:packages/contract/src/citation.ts:62-72,3` | 第四步发现 `3` 在 `72` 之前开始 | error `line ranges "62-72,3" must be ascending and non-overlapping` |

最后一个 variant 得到 error，而不是重新排好的 `Ref`：`parseRanges` 只检查先后，不替你调整。

## `mailto:` link 看起来像 citation，却仍是 web link

你可能以为，每个 `name:rest` 形式的 link target 都会被当成 citation。照这个想法，
`mailto:team@example.com` 会变成 repo key `mailto` 加 path `team@example.com`。它确实和整个 file 的
citation 一样切成两个 part，却根本到不了 `parseRef`。关键的 attribute 是：scheme 是不是 `http`、`https`、`mailto`
之一。page parser 在第一步就把这类 target 当作 web link 返回
（[inline.ts](explain:packages/contract/src/parse-page/inline.ts:9,42)）。出于同样的原因，`repoKeyProblem`
不接受这三个 name 作 repo key（[citation.ts](explain:packages/contract/src/citation.ts:16-20,26)）。
这样，任何 doc root 都无法声明一个会被读成 web link 的 repo key。

## 把 `Ref` 写回去，得到的正是 `parseRef` 接受的唯一写法

[`formatRef`](explain:packages/contract/src/citation.ts:77-80) 把 `Ref` 写回 citation。CLI 需要打印 citation
时会用到它。例如 `explain freshness check` 列出改动过的 cited file 时，就用它打印
（[check.ts](explain:packages/cli/src/commands/freshness/check.ts:15)）。`parseRef` 和 page parser 都不调用它，
只有打印 `Ref` 的 code 才会用它。只有一个 line 的 line range 写成 `N`，更长的写成 `N-M`
（[formatRange](explain:packages/contract/src/citation.ts:74-75)）。`ranges` 是 empty array 时，它省去第三个 part。
对本例的 `Ref`，它写出 `explain:packages/contract/src/citation.ts:62-72`，和 page 开头的 string 一模一样。
