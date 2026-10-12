import { describe, expect, it } from "vitest";
import { hasInternalMedicine } from "./medical";

// 医療機関の診療科目から、内科があるかを判定する（実データの書き方：病院は略称、診療所は正式名）

describe("内科のある医療機関の判定", () => {
  it("病院の略称（内）と診療所の正式名（内科・○○内科）を内科として数える", () => {
    expect(hasInternalMedicine("内　整　リハ　形　脳外　歯　歯外")).toBe(true);
    expect(hasInternalMedicine("内科　循環器内科　アレルギー科")).toBe(true);
    expect(hasInternalMedicine("消化器内科")).toBe(true);
    expect(hasInternalMedicine("消内　外")).toBe(true);
  });

  it("皮膚科・眼科・小児科だけの診療所や、心療内科・美容内科は数えない", () => {
    expect(hasInternalMedicine("皮膚科")).toBe(false);
    expect(hasInternalMedicine("皮膚科　アレルギー科　眼科")).toBe(false);
    expect(hasInternalMedicine("アレルギー科　小児科")).toBe(false);
    expect(hasInternalMedicine("心療内科　精神科")).toBe(false);
    expect(hasInternalMedicine("美容内科")).toBe(false);
    expect(hasInternalMedicine(null)).toBe(false);
  });
});
