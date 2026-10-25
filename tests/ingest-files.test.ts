import { describe, expect, it } from "vitest";
import { csvRecords, parseCsv, toHalfWidthDigits } from "../scripts/ingest/lib/files";
import { wardOf } from "../scripts/ingest/jobs/d39-towns";

describe("parseCsv", () => {
  it("カンマと改行で分ける（CRLF も）", () => {
    expect(parseCsv("a,b\r\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("\"\" で囲んだ値の中のカンマ・改行・\"\" を扱う", () => {
    expect(parseCsv('"新潟市,西区","1行目\n2行目","""引用"""\n')).toEqual([["新潟市,西区", "1行目\n2行目", '"引用"']]);
  });

  it("空の欄を残す", () => {
    expect(parseCsv(",,x")).toEqual([["", "", "x"]]);
  });
});

describe("csvRecords", () => {
  it("1件ずつに分ける。\"\" の中の改行では分けない", () => {
    expect([...csvRecords('"a","1行目\n2行目"\r\n"b","x"\n')]).toEqual(['"a","1行目\n2行目"', '"b","x"']);
  });
});

describe("toHalfWidthDigits", () => {
  it("全角の数字だけを半角にする", () => {
    expect(toHalfWidthDigits("総数１０〜１４歳")).toBe("総数10〜14歳");
  });
});

describe("wardOf", () => {
  it("政令市は区の名前にする", () => {
    expect(wardOf("新潟市西区")).toBe("西区");
    expect(wardOf("新潟市中央区")).toBe("中央区");
  });

  it("それ以外は市町村の名前のまま", () => {
    expect(wardOf("長岡市")).toBe("長岡市");
    expect(wardOf("北蒲原郡聖籠町")).toBe("北蒲原郡聖籠町");
  });
});
