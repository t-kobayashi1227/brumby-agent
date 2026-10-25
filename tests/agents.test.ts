import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkProgram, removeSentences, splitWhere } from "../lib/agents/checks";
import { costUsd } from "../lib/agents/cost";
import { agentPrompt, PROMPT_FILES, readPrompt, rebuildMessage } from "../lib/agents/prompts";
import type { MainOutput, MediaOutput } from "../lib/agents/schemas";
import { allocate, simulate } from "../lib/calc/budget";
import type { Fact } from "../lib/facts/types";

describe("指示文は設計まとめと一字一句同じ", () => {
  const doc = readFileSync("docs/設計まとめ.md", "utf8").replace(/\r\n/g, "\n");
  const section = doc.slice(doc.indexOf("## エージェントの指示文"), doc.indexOf("### 指示文の練り方"));
  const blocks = Object.fromEntries([...section.matchAll(/### (\S+)\n\n```text\n([\s\S]*?)\n```/g)].map((m) => [m[1], m[2]]));

  it("共通の指示と7つのエージェント", () => {
    expect(readPrompt("common.txt")).toBe(blocks["共通の指示"]);
    for (const [agent, file] of Object.entries(PROMPT_FILES)) expect(readPrompt(file), agent).toBe(blocks[agent]);
  });

  it("共通の指示と自分の指示をつなげて渡す", () => {
    const p = agentPrompt("立地");
    expect(p.system.startsWith(blocks["共通の指示"])).toBe(true);
    expect(p.system.endsWith(blocks["立地"])).toBe(true);
    expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("作り直しの依頼文に問題の一覧が入る", () => {
    expect(rebuildMessage(["appeals[1]：IDがありません"])).toContain("- appeals[1]：IDがありません");
  });
});

const fact = (id: string, 状態: Fact["状態"] = "取得"): Fact => ({ id, 項目: id, 値: 状態 === "取得できず" ? null : "x", 出典: "x", 時点: "x", 状態 });
const FACTS = [fact("P-02"), fact("L-04"), fact("T-03", "取得できず"), fact("S-02", "要確認"), fact("B-06")];
const MEDIA_IDS = Array.from({ length: 16 }, (_, i) => `C-${String(i + 1).padStart(2, "0")}`);

function main(overrides: Partial<MainOutput> = {}): MainOutput {
  return {
    summary: { text: "総合評価", evidence: ["P-02"] },
    targets: [{ rank: 1, name: "若い夫婦", source: "候補", definition: null, reason: "理由", evidence: ["B-06"], confidence: "中" }],
    not_fit: [],
    appeals: [
      { rank: 1, text: "公園が近い", evidence: ["L-04"] },
      { rank: 2, text: "IDなし", evidence: [] },
    ],
    price_view: { position: "相場なみ", sellability: "標準", text: "価格", evidence: ["P-02"] },
    concerns: [{ text: "駅の乗降客数", action: "説明する", evidence: ["T-03"] }],
    direction: { text: "方向性", evidence: ["S-02"] },
    ...overrides,
  };
}

function media(overrides: Partial<MediaOutput> = {}): MediaOutput {
  return {
    media: [
      { id: "C-01", name: "SUUMO", purpose: "問い合わせ", target: "第1ターゲット", share: 50, reason: "r", evidence: ["B-06"] },
      { id: "C-06", name: "Instagram広告", purpose: "認知", target: "第1ターゲット", share: 30, reason: "r", evidence: ["B-06"] },
      { id: "C-12", name: "ポスティング", purpose: "認知", target: "第2ターゲット", share: 20, reason: "r", evidence: ["X-99"] },
    ],
    cautions: [],
    ...overrides,
  };
}

describe("点検（プログラム）", () => {
  it("IDのない文は外し、知らないIDと「取得できず」は作り直し。要確認は使ってよい", () => {
    const issues = checkProgram(main(), media(), FACTS, MEDIA_IDS);
    expect(issues).toEqual([
      { target: "メイン", location: "appeals[1]", check_name: "IDのない文", problem: "根拠の事実IDがありません", action: "外す" },
      { target: "メイン", location: "concerns[0]", check_name: "取得できずの事実を根拠にしている", problem: "「取得できず」の事実です：T-03", action: "作り直し" },
      { target: "媒体", location: "media[2]", check_name: "IDが事実シートにない", problem: "事実シートにないIDです：X-99", action: "作り直し" },
    ]);
  });

  it("1つしかない文（総合評価など）にIDがなければ、外せないので作り直し", () => {
    const issues = checkProgram(main({ summary: { text: "x", evidence: [" "] } }), media(), FACTS, MEDIA_IDS);
    expect(issues[0]).toMatchObject({ location: "summary", action: "作り直し" });
  });

  it("媒体は一覧の中から3〜6件、重ならず、配分の合計100", () => {
    const two = media({ media: media().media.slice(0, 2) });
    const problems = checkProgram(main(), two, FACTS, MEDIA_IDS).filter((i) => i.location === "media").map((i) => i.problem);
    expect(problems).toEqual(["媒体が2件です（3〜6件にする）", "配分の合計が80%です（100%にする）"]);
    const bad = media({ media: [...media().media.slice(0, 2), { ...media().media[0], id: "C-99", share: 20 }] });
    expect(checkProgram(main(), bad, FACTS, MEDIA_IDS).map((i) => i.problem)).toContain("媒体一覧にない媒体です：C-99");
  });

  it("「外す」の文だけ取り除く", () => {
    const issues = checkProgram(main(), media(), FACTS, MEDIA_IDS);
    const r = removeSentences(main(), media(), issues);
    expect(r.main.appeals.map((a) => a.text)).toEqual(["公園が近い"]);
    expect(r.main.concerns).toHaveLength(1);
    expect(r.media.media).toHaveLength(3);
  });

  it("確認エージェントの場所を、メインか媒体かに分ける", () => {
    expect(splitWhere("appeals[1]")).toEqual({ target: "メイン", location: "appeals[1]" });
    expect(splitWhere("media[0]")).toEqual({ target: "媒体", location: "media[0]" });
    expect(splitWhere("cautions[0]")).toEqual({ target: "媒体", location: "cautions[0]" });
    expect(splitWhere("媒体.media[2]")).toEqual({ target: "媒体", location: "media[2]" });
    expect(splitWhere("メイン.summary")).toEqual({ target: "メイン", location: "summary" });
  });
});

describe("配分から金額（予算シミュレーション）", () => {
  const shares = [
    { id: "C-01", share: 40 },
    { id: "C-06", share: 30 },
    { id: "C-12", share: 20 },
    { id: "C-14", share: 10 },
  ];

  it("設計まとめの例：40・30・20・10%", () => {
    expect(allocate(shares, 10).map((a) => a.amountManYen)).toEqual([4, 3, 2, 1]);
    expect(allocate(shares, 30).map((a) => a.amountManYen)).toEqual([12, 9, 6, 3]);
  });

  it("0.1万円単位で丸め、合計のずれは配分の最も大きい媒体で合わせる", () => {
    const thirds = [
      { id: "a", share: 33 },
      { id: "b", share: 34 },
      { id: "c", share: 33 },
    ];
    const r = allocate(thirds, 10);
    expect(r.map((a) => a.amountManYen)).toEqual([3.3, 3.4, 3.3]);
    const odd = allocate(
      [
        { id: "a", share: 45 },
        { id: "b", share: 55 },
      ],
      0.3,
    );
    // 0.135→0.1、0.165→0.2：合計 0.3 で合う
    expect(odd.reduce((s, a) => s + a.amountManYen, 0)).toBeCloseTo(0.3, 6);
  });

  it("①の総額があれば一番左の列に足す", () => {
    expect(simulate(shares, 50).map((c) => [c.totalManYen, c.isInput])).toEqual([
      [50, true],
      [10, false],
      [20, false],
      [30, false],
    ]);
    expect(simulate(shares, null).map((c) => c.totalManYen)).toEqual([10, 20, 30]);
  });
});

describe("費用（claude-haiku-5-5）", () => {
  it("100K トークン以下は入力 $0.10・出力 $0.50（1M トークンあたり）", () => {
    expect(costUsd({ input_tokens: 20_000, output_tokens: 2_000 })).toBeCloseTo(0.003, 9);
  });

  it("キャッシュの書き込みは1.25倍、読み込みは0.1倍", () => {
    expect(costUsd({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 10_000, cache_read_input_tokens: 10_000 })).toBeCloseTo(0.00135, 9);
  });

  it("100K トークンを超えると高い料金表", () => {
    expect(costUsd({ input_tokens: 200_000, output_tokens: 1_000 })).toBeCloseTo(0.1025, 9);
  });
});
