import { describe, expect, it } from "vitest";
import { parseQuarter, toNumber, toYear } from "../scripts/ingest/jobs/d01-transactions";
import { latToTileY, lonToTileX, tileBbox, tilesInBbox } from "../scripts/ingest/lib/reinfolib";

describe("XIT001 の値の読み取り", () => {
  it("カンマ付きの数字を読む。数字でない表記は null", () => {
    expect(toNumber("24,800,000")).toBe(24800000);
    expect(toNumber("2000㎡以上")).toBeNull();
    expect(toNumber("")).toBeNull();
  });

  it("建築年は「1995年」だけを読む", () => {
    expect(toYear("1995年")).toBe(1995);
    expect(toYear("戦前")).toBeNull();
  });

  it("四半期の指定を読む", () => {
    expect(parseQuarter("2015Q1")).toEqual({ year: 2015, quarter: 1 });
    expect(() => parseQuarter("2015-1")).toThrow();
  });
});

describe("地図タイル", () => {
  it("タイルの範囲に、そのタイルを出した点が入る", () => {
    const [lon, lat, z] = [139.0614, 37.9124, 15];
    const tile = { z, x: lonToTileX(lon, z), y: latToTileY(lat, z) };
    const [w, s, e, n] = tileBbox(tile);
    expect(w).toBeLessThanOrEqual(lon);
    expect(e).toBeGreaterThan(lon);
    expect(s).toBeLessThan(lat);
    expect(n).toBeGreaterThanOrEqual(lat);
  });

  it("範囲を覆うタイルは、ズームが2つ上がると約16倍になる", () => {
    const bbox = [138.78, 37.68, 139.27, 38.03];
    const z11 = tilesInBbox(bbox, 11).length;
    const z13 = tilesInBbox(bbox, 13).length;
    expect(z13 / z11).toBeGreaterThan(5);
    expect(z13 / z11).toBeLessThan(20);
  });
});
