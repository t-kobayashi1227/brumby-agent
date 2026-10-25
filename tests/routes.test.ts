import { describe, expect, it } from "vitest";
import { findPage, isNavActive } from "../app/_lib/routes";

describe("findPage", () => {
  it("一覧と入力の画面の見出しを返す", () => {
    expect(findPage("/strategy")?.title).toBe("販売戦略");
    expect(findPage("/properties/new")?.title).toBe("物件情報の入力");
  });

  it("/strategy/<id> は詳細の画面になる", () => {
    expect(findPage("/strategy/12")?.title).toBe("販売戦略の詳細");
  });

  it("知らない画面は undefined", () => {
    expect(findPage("/dashboard")).toBeUndefined();
  });
});

describe("isNavActive", () => {
  it("詳細の画面でも「販売戦略」を選択中にする", () => {
    expect(isNavActive("/strategy", "/strategy/12")).toBe(true);
    expect(isNavActive("/strategy", "/properties/new")).toBe(false);
  });
});
