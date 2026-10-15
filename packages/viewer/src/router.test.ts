import { describe, expect, it } from "vitest";
import { parseRoute, sourceRouteHref } from "./router.ts";

const route = (href: string) => {
  const url = new URL(href, "http://host");
  return parseRoute(url.pathname, url.search);
};

describe("parseRoute", () => {
  it("reads a source route back from the href the viewer links to", () => {
    const href = sourceRouteHref("zh-CN", "fold", "src/web/index.html");
    expect(href).toBe("/zh-CN/source?fold/src/web/index.html");
    expect(route(href)).toEqual({
      kind: "source",
      locale: "zh-CN",
      repo: "fold",
      path: "src/web/index.html",
    });
    expect(route(`${sourceRouteHref("zh-CN", "fold", "src/数据 #?.ts")}#L3`)).toEqual({
      kind: "source",
      locale: "zh-CN",
      repo: "fold",
      path: "src/数据 #?.ts",
    });
  });

  it("keeps the source route when a host adds a trailing slash", () => {
    expect(route("/zh-CN/source/?fold/README.md")).toEqual({
      kind: "source",
      locale: "zh-CN",
      repo: "fold",
      path: "README.md",
    });
  });

  it("refuses a source route without a file and the old path form", () => {
    expect(route("/zh-CN/source")).toEqual({ kind: "unknown", path: "/zh-CN/source" });
    expect(route("/zh-CN/source?fold")).toEqual({ kind: "unknown", path: "/zh-CN/source?fold" });
    expect(route("/zh-CN/source/fold/README.md")).toEqual({
      kind: "unknown",
      path: "/zh-CN/source/fold/README.md",
    });
  });

  it("reads pages and locale homes", () => {
    expect(route("/zh-CN/index/")).toEqual({ kind: "page", locale: "zh-CN", id: "index" });
    expect(route("/zh-CN")).toEqual({ kind: "home", locale: "zh-CN" });
    expect(route("/")).toEqual({ kind: "home", locale: null });
  });
});
