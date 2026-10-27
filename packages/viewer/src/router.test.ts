import { describe, expect, it } from "vitest";
import { pageHref, parseRoute } from "./router.ts";

const route = (href: string) => {
  const url = new URL(href, "http://host");
  return parseRoute(url.pathname, url.search);
};

describe("parseRoute", () => {
  it("reads the home and a page, with or without a trailing slash", () => {
    expect(route("/")).toEqual({ kind: "home" });
    expect(route("/overview")).toEqual({ kind: "page", id: "overview" });
    expect(route("/overview/")).toEqual({ kind: "page", id: "overview" });
  });

  it("reads a page back from the href the viewer links to", () => {
    expect(route(pageHref("数据 #?", "intro"))).toEqual({ kind: "page", id: "数据 #?" });
    expect(route("/source")).toEqual({ kind: "page", id: "source" });
  });

  it("treats deeper paths as unknown", () => {
    expect(route("/a/b?x")).toEqual({ kind: "unknown", path: "/a/b?x" });
  });
});
