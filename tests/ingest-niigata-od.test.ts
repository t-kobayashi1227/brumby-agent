import { describe, expect, it } from "vitest";
import { toCount } from "../scripts/ingest/jobs/niigata-od";

describe("toCount", () => {
  it("桁区切りのカンマを外して数にする", () => {
    expect(toCount("1,079")).toBe(1079);
    expect(toCount("320")).toBe(320);
  });

  it("秘匿の x と空欄は null", () => {
    expect(toCount("x")).toBeNull();
    expect(toCount("")).toBeNull();
    expect(toCount(undefined)).toBeNull();
  });
});
