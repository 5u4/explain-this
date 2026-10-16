# 引用：`repo:path:ranges`

explain 页面里的每一条论断都要指向代码，指向的方式是一个引用字符串，例如
`explain:packages/contract/src/citation.ts:62-72`。这个字符串的语法只由 contract 包里的一个小模块负责：
它定义了 [`Ref`](explain:packages/contract/src/citation.ts:3-12) 值，用 `parseRef` 把文本解析成
`Ref`，再用 `formatRef` 写回文本。

谁在调用它：

- 页面解析器遇到既不是页面链接、也不是网页地址的链接目标时，就交给 `parseRef`
  （[context.ts](explain:packages/contract/src/parse-page/context.ts:20-25)）。
- CLI 的 API 处理函数 `handleExplainRequest`（`explain dev` 和 `explain build` 共用）在响应源码请求前，用它检查请求里的 `repo/path` 是否合法
  （[api.ts](explain:packages/cli/src/site/api.ts:64-65)）。

## 数据结构

```ts file=explain:packages/contract/src/citation.ts:3-12
```

`Ref` 由三部分组成：repo key、repo 内的路径、零个或多个行区间。`ranges` 为空数组表示引用整个文件。
单独一行 `N` 也存成 `{ from: N, to: N }`，所以使用方只需要处理区间这一种形态。

## 三段语法

| 部分 | 规则 | 代码 |
|---|---|---|
| `repo` | 小写字母开头，之后只能是小写字母、数字、`-`；不能是 `http`、`https`、`mailto` | [repoKeyProblem](explain:packages/contract/src/citation.ts:14-28) |
| `path` | 非空、相对路径、用 `/` 分隔，不能有空段、`.` 段或 `..` 段 | [pathProblem](explain:packages/contract/src/citation.ts:30-41) |
| `ranges` | 可省略；逗号分隔的 `N` 或 `N-M`，从 1 开始，不带前导零，升序且互不重叠 | [parseRanges](explain:packages/contract/src/citation.ts:43-60) |

`parseRef` 的流程如下：

<AnnotatedSource file="explain:packages/contract/src/citation.ts:62-72">
<Note lines="63-67">按每个 `:` 切分，只接受两段或三段。因此路径里永远不能出现冒号，没有冒号的字符串也不算引用。</Note>
<Note lines="68-69">先查 repo key，再查路径，只报告遇到的第一个问题。</Note>
<Note lines="70">没有第三段就是整文件引用，`ranges` 为空数组。</Note>
<Note lines="71">repo 和路径都合法之后才解析行区间。</Note>
</AnnotatedSource>

失败时它不抛异常，而是返回 Effect 的 `Result`，失败值就是一条给人看的消息。页面解析器把这条消息原样变成
链接位置上的诊断（[context.ts](explain:packages/contract/src/parse-page/context.ts:15-24)）。这也是为什么
`repoKeyProblem`、`pathProblem` 都返回 `string | undefined`：错误本身就是那句消息。

## 行区间的规则

```ts file=explain:packages/contract/src/citation.ts:43-60
```

逗号分隔后的每一段都要匹配 [`rangePattern`](explain:packages/contract/src/citation.ts:22)：
`0`、`01`、`1-` 这种开口区间、带空格的写法都会被拒绝。接着检查两件事：区间不能倒着写（`5-3`），
每个区间必须从上一个区间结束之后开始（`10,4` 和 `1-5,5-9` 都不行）。

> [!IMPORTANT]
> 解析出来的 `Ref`，其 `ranges` 一定严格升序、互不重叠，每个区间满足 `from <= to`，行号从 1 开始。
> 下游会直接把 `ranges[0]` 当成第一处被引用的行，例如 viewer 生成源码链接时跳到 `#L${first.from}`
> （[ref.ts](explain:packages/viewer/src/ref.ts:40-43)）。

顺序是被校验的，而不是被自动排序的：`fold:fold.ts:10,4` 会报错，而不是悄悄变成 `4,10`。这样一个引用只有一种写法，
正好就是 [`formatRef`](explain:packages/contract/src/citation.ts:74-80) 写出来的那种。

## 为什么保留 `http`、`https`、`mailto`

页面解析器靠前缀判断一个 Markdown 链接是什么：`#` 开头是锚点，`./` 开头是页面链接，scheme 为
`http`、`https`、`mailto` 的是外部链接，其余任何 `xxx:` 开头的都当作引用。

```ts file=explain:packages/contract/src/parse-page/inline.ts:7-9,34-44
```

如果允许一个叫 `http` 的 repo，`http:foo` 就有两种读法。所以
[`reservedRepoKeys`](explain:packages/contract/src/citation.ts:16-20) 恰好禁掉这三个外部 scheme。
`explain.json` 的 schema 也复用同一个 `repoKeyProblem` 去检查 `repos` 的 key
（[config.ts](explain:packages/contract/src/config.ts:28-35)），所以配置里根本声明不出页面无法引用的 key。
配置的其他规则见 [config](./config.md)。

## `parseRef` 不检查什么

`parseRef` 只管语法，不读磁盘，也不知道有哪些 repo。repo 是否存在、文件是否存在、行号是否超出文件末尾，
都是 CLI 加载文档根目录之后才检查的：

```ts file=explain:packages/cli/src/doc-root/resolve-source.ts:74-92
```

这一步的细节见 [resolve-source](./resolve-source.md)。把语法和磁盘检查分开，contract 包就不需要任何文件系统能力
（推断：contract 的 [package.json](explain:packages/contract/package.json:13-21) 里没有文件系统相关依赖，
真正读文件的 `FileSystem` 只出现在 CLI 里）。

## 测试用例

两个测试规定了能解析的形式：整文件引用得到空的 `ranges`，单行和跨行区间混排时按原顺序返回。

```ts file=explain:packages/contract/src/citation.test.ts:6-24
```

测试里那张拒绝表是这套语法最直接的说明，每一行都写明了它违反的规则：

```ts file=explain:packages/contract/src/citation.test.ts:26-48
```

## 写回字符串

`formatRef` 是 `parseRef` 的逆操作：单行区间写成 `N`，跨行写成 `N-M`，整文件引用没有第三段。CLI 打印过期来源时就用它
（[check.ts](explain:packages/cli/src/commands/freshness/check.ts:12)）。

```ts file=explain:packages/contract/src/citation.ts:74-80
```

<details>
<summary>viewer 里还有一份自己的实现</summary>

viewer 在 [ref.ts](explain:packages/viewer/src/ref.ts:5-30) 里另写了 `formatRef` 和一个更宽松的
`parseRef`，从 contract 只导入类型（[ref.ts](explain:packages/viewer/src/ref.ts:1)）。viewer 只把
`@explain/contract` 列为 devDependency（[package.json](explain:packages/viewer/package.json:10-20)），
这样浏览器端不会打包进 `effect`（推断）。

它的 `parseRef` 失败时返回 `undefined`，也不检查 repo、路径和区间顺序。它只读回
viewer 自己从 CLI 校验过的 ref 写进 `data-ref` 属性的值（[anchors.ts](explain:packages/viewer/src/pane/anchors.ts:19-21)）。

</details>
