import { describe, expect, it } from "vitest";
import { parseLayout, parsePropertyId } from "../lib/property";

describe("parseLayout", () => {
  it("居室と納戸（S）の数に分ける", () => {
    expect(parseLayout("4LDK+S")).toEqual({ rooms: 4, storerooms: 1 });
    expect(parseLayout("3LDK+2S")).toEqual({ rooms: 3, storerooms: 2 });
    expect(parseLayout("4SLDK")).toEqual({ rooms: 4, storerooms: 1 });
    expect(parseLayout("3LDK")).toEqual({ rooms: 3, storerooms: 0 });
    expect(parseLayout("1R")).toEqual({ rooms: 1, storerooms: 0 });
  });

  it("全角や小文字、空白があっても読む", () => {
    expect(parseLayout("４ＬＤＫ＋Ｓ")).toEqual({ rooms: 4, storerooms: 1 });
    expect(parseLayout("4ldk + s")).toEqual({ rooms: 4, storerooms: 1 });
  });

  it("読めない書き方は null", () => {
    expect(parseLayout("4LDK+書斎")).toBeNull();
    expect(parseLayout("")).toBeNull();
  });
});

describe("parsePropertyId", () => {
  it("正の整数だけを番号として読む", () => {
    expect(parsePropertyId("12")).toBe(12);
    expect(parsePropertyId(3)).toBe(3);
    expect(parsePropertyId("0")).toBeNull();
    expect(parsePropertyId("-1")).toBeNull();
    expect(parsePropertyId("1.5")).toBeNull();
    expect(parsePropertyId("abc")).toBeNull();
  });
});
