// 3回の形（docs/戦略の質を上げる修正案.md）を、API を使わず claude.ai に貼り付けて試すための文を作る：npm run paste -- <物件の番号>
// 何度でも実行してよい。data/out/paste/<物件の番号>/ にある答えを見て、次に貼る文を作る
//   1. 1_戦略.txt を作る → claude.ai に貼り、返った JSON を 戦略.json に保存
//   2. もう一度実行 → 答えの形を確かめ、2_媒体.txt を作る → 返った JSON を 媒体.json に保存
//   3. もう一度実行 → プログラムの点検（禁止語・ID・媒体の件数と配分）と金額の計算をして、3_確認.txt を作る → 返った JSON を 確認.json に保存
//   4. もう一度実行 → 点検の結果を 点検.json にまとめる
// 戦略.json を保存した後は、毎回 戦略.html（レポート画面と同じ項目名の読みやすい形）も作る。ブラウザで開いて読む
// AI は呼ばない（費用はかからない）。事実シートは最新のものを使い、無ければ作って保存する（住所の緯度経度は登録時に取得済み）
// 画面には件数とファイルの場所だけを出す（テスト物件は秘密保持契約の対象のため、中身は出さない）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z, type ZodType } from "zod/v4";
import { checkProgram, removeSentences, splitWhere } from "../lib/agents/checks";
import { agentPrompt } from "../lib/agents/prompts";
import { factsOf } from "../lib/agents/run";
import { checkSchema, mainPart, mediaSchema, strategySchema, type MediaOutput, type StrategyOutput } from "../lib/agents/schemas";
import { simulate } from "../lib/calc/budget";
import { getSql } from "../lib/db";
import { createFactSheet } from "../lib/facts";
import type { FactSheet } from "../lib/facts/types";
import { reportHtml, type PasteReport } from "./paste-report";

/** API では system に入れる指示文と、structured outputs で決める答えの形を、1つの文にまとめる */
function pasteText(agent: "戦略" | "媒体" | "確認", schema: ZodType, input: unknown): string {
  return [
    "【指示】",
    agentPrompt(agent).system,
    "",
    "【答えの形】次の JSON Schema に合う JSON だけを返してください。説明や前置きは書かないでください。",
    JSON.stringify(z.toJSONSchema(schema), null, 1),
    "",
    "【入力】",
    JSON.stringify(input, null, 1),
  ].join("\n");
}

/**
 * 保存された答えを読む。```json の囲みと、先頭の BOM は外す。形が合わなければ、どこが違うかを出して止める
 * コピーの途中で " が “ ” に変わることがあるので、そのままで読めなければ " に戻して読み直す
 */
function readAnswer<S extends ZodType>(file: string, schema: S): z.infer<S> | null {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8").replace(/^﻿/, "").trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    try {
      json = JSON.parse(text.replace(/[“”„″]/g, '"'));
      console.log(`  ${path.basename(file)}：“ ” を " に直して読みました`);
    } catch (e) {
      throw new Error(`${file} を JSON として読めません（${e instanceof Error ? e.message : e}）。claude.ai の答えの JSON だけを保存してください`);
    }
  }
  // claude.ai では答えの形を強制できず、順位（rank）が抜けることがある。順位は並びの順なので、抜けていれば並びの順で補う
  for (const key of ["targets", "appeals"]) {
    const items = (json as Record<string, unknown> | null)?.[key];
    if (!Array.isArray(items)) continue;
    items.forEach((it: Record<string, unknown>, i) => {
      if (it && typeof it === "object" && typeof it.rank !== "number") {
        it.rank = i + 1;
        console.log(`  ${path.basename(file)}：${key}[${i}] の順位が無いので、並びの順（${i + 1}）にしました`);
      }
    });
  }
  const r = schema.safeParse(json);
  if (!r.success) throw new Error(`${file} の形が違います：\n${z.prettifyError(r.error)}`);
  return r.data;
}

async function main() {
  const propertyId = Number(process.argv[2]);
  if (!Number.isInteger(propertyId) || propertyId <= 0) throw new Error("物件の番号を指定してください（例：npm run paste -- 1）");
  const sql = getSql();
  const dir = path.join("data", "out", "paste", String(propertyId));
  mkdirSync(dir, { recursive: true });
  const at = (name: string) => path.join(dir, name);

  const [latest] = await sql<{ id: string; content: FactSheet }[]>`
    select id, content from fact_sheets where property_id = ${propertyId} order by created_at desc limit 1
  `;
  const { id: factSheetId, sheet } = latest ? { id: Number(latest.id), sheet: latest.content } : await createFactSheet(sql, propertyId);
  console.log(`物件 ${propertyId}：事実シート id ${factSheetId}（${sheet.作成日時} 時点、事実 ${sheet.事実.length}件）`);

  // 読みやすい HTML（戦略.html）。ここまでにある答えで、毎回作り直す
  const mediaRows = await sql<{ id: string; name: string }[]>`select id, name from media order by sort`;
  const html = (report: Pick<PasteReport, "strategy"> & Partial<PasteReport>) =>
    writeFileSync(
      at("戦略.html"),
      reportHtml({
        propertyId,
        factSheetDate: sheet.作成日時,
        facts: sheet.事実,
        mediaNames: Object.fromEntries(mediaRows.map((m) => [m.id, m.name])),
        media: null,
        budget: null,
        program: null,
        ai: null,
        ...report,
      }),
    );

  // 1. 戦略
  writeFileSync(at("1_戦略.txt"), pasteText("戦略", strategySchema, { 事実シート: sheet }));
  const strategy = readAnswer(at("戦略.json"), strategySchema);
  if (!strategy) return next(at("1_戦略.txt"), at("戦略.json"));
  console.log(`  戦略.json：分析 ${strategy.analysis.length}件（組み合わせ ${strategy.analysis.filter((a) => a.topic === "組み合わせ").length}件）・ターゲット ${strategy.targets.length}件`);
  html({ strategy });

  // 2. 媒体（メインの答えの部分だけを渡す）
  const mediaInput = { 距離の種類: sheet.距離の種類, 事実: factsOf(sheet, ["P", "B", "C"]), メインの答え: mainPart(strategy) };
  writeFileSync(at("2_媒体.txt"), pasteText("媒体", mediaSchema, mediaInput));
  const media = readAnswer(at("媒体.json"), mediaSchema);
  if (!media) return next(at("2_媒体.txt"), at("媒体.json"), at("戦略.html"));

  // 3. プログラムの点検 → IDのない文を外す → 確認
  const mediaIds = mediaRows.map((m) => m.id);
  const [{ ad_budget_man_yen: adBudget }] = await sql<{ ad_budget_man_yen: number | null }[]>`select ad_budget_man_yen from properties where id = ${propertyId}`;
  const program = checkProgram(strategy, media, sheet.事実, mediaIds);
  const kept: { main: StrategyOutput; media: MediaOutput } = removeSentences(strategy, media, program);
  const budget = simulate(
    kept.media.media.map((m) => ({ id: m.id, share: m.share })),
    adBudget,
  );
  console.log(`  プログラムの点検：${program.length}件（${count(program.map((i) => i.check_name))}）`);
  writeFileSync(at("3_確認.txt"), pasteText("確認", checkSchema, { 事実シート: sheet, 点検する文章: { 戦略: kept.main, 媒体: kept.media } }));

  const check = readAnswer(at("確認.json"), checkSchema);
  const ai = (check?.issues ?? []).map((i) => ({ ...splitWhere(i.where), check: i.check, problem: i.problem }));
  writeFileSync(
    at("点検.json"),
    JSON.stringify({ factSheetId, プログラム: program, 確認担当: check ? ai : "まだ（確認.json がありません）", 戦略: kept.main, 媒体: kept.media, 予算シミュレーション: budget }, null, 2),
  );
  html({ strategy: kept.main, media: kept.media, budget, program, ai: check ? ai : null });
  if (!check) return next(at("3_確認.txt"), at("確認.json"), at("点検.json"), at("戦略.html"));
  console.log(`  確認担当の指摘：${ai.length}件（点検の番号ごと：${count(ai.map((i) => String(i.check)))}）`);
  console.log(`完了：点検の結果と、IDのない文を外した戦略・媒体・金額を ${at("点検.json")} にまとめました`);
  console.log(`  読みやすい形：${at("戦略.html")}（ブラウザで開く）`);
}

function count(names: string[]): string {
  const m = new Map<string, number>();
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
  return [...m].map(([k, v]) => `${k} ${v}`).join("、") || "なし";
}

function next(paste: string, save: string, ...also: string[]) {
  console.log(`次：${paste} の中身を claude.ai に貼り、返った JSON を ${save} に保存して、もう一度実行してください`);
  for (const f of also) console.log(`  （途中の結果：${f}）`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getSql().end());
