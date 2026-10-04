// 仮のルールを rules に入れる：npm run seed-rules
// すでにある番号のルールは上書きしない（Supabase の画面で直した内容を消さないため）
// 出発点はプロトタイプ（app/_lib/data.ts の targetList・mediaDefs・budgetRules）。数値はすべて仮
import { getSql } from "../lib/db";
import type { Condition, Effect, Rule } from "../lib/rules/engine";

type Seed = Pick<Rule, "id" | "kind" | "note"> & { condition: Condition; effect: Effect };

const more = (fact: string, delta = 0): Condition => ({ fact, op: ">", than: "comparison", delta });

const RULES: Seed[] = [
  // 総予算（物件の価格で決める）
  { id: "R-01", kind: "total_budget", condition: { fact: "property.price_man_yen", op: "<", than: 2000 }, effect: { total_man_yen: 10 }, note: "仮：2,000万円未満の物件は総予算10万円" },
  { id: "R-02", kind: "total_budget", condition: { all: [{ fact: "property.price_man_yen", op: ">=", than: 2000 }, { fact: "property.price_man_yen", op: "<", than: 3500 }] }, effect: { total_man_yen: 20 }, note: "仮：2,000〜3,500万円の物件は総予算20万円" },
  { id: "R-03", kind: "total_budget", condition: { fact: "property.price_man_yen", op: ">=", than: 3500 }, effect: { total_man_yen: 30 }, note: "仮：3,500万円以上の物件は総予算30万円" },

  // 媒体の重みの出発点（プロトタイプの配分表で、総予算30万円のときの 12・7・5・6万円）
  { id: "R-11", kind: "media_weight", condition: { always: true }, effect: { media: "sns", weight: 12 }, note: "仮：プロトタイプの配分表（30万円のとき12万円）" },
  { id: "R-12", kind: "media_weight", condition: { always: true }, effect: { media: "posting", weight: 7 }, note: "仮：プロトタイプの配分表（30万円のとき7万円）" },
  { id: "R-13", kind: "media_weight", condition: { always: true }, effect: { media: "flyer", weight: 5 }, note: "仮：プロトタイプの配分表（30万円のとき5万円）" },
  { id: "R-14", kind: "media_weight", condition: { always: true }, effect: { media: "lp", weight: 6 }, note: "仮：プロトタイプの配分表（30万円のとき6万円）" },

  // 媒体の重みを変える
  { id: "R-21", kind: "media_weight", condition: more("target.households_with_under18_ratio", 0.03), effect: { media: "sns", multiply: 1.5 }, note: "仮：子育て世帯が区・市より3ポイント以上多い地域は、SNS広告で子育て世帯に届けやすい" },
  { id: "R-22", kind: "media_weight", condition: more("target.age_30_49_ratio", 0.03), effect: { media: "sns", multiply: 1.2 }, note: "仮：30〜49歳が区・市より3ポイント以上多い地域は、SNS広告を厚くする" },
  { id: "R-23", kind: "media_weight", condition: more("target.detached_ratio"), effect: { media: "posting", multiply: 1.3 }, note: "仮：一戸建が区・市より多い地域は、ポスティングで住み替え層に届けやすい" },

  // 固定額・最低額
  { id: "R-31", kind: "min_spend", condition: { fact: "decision.total_budget", op: "<=", than: 10 }, effect: { media: "lp", fixed_man_yen: 0 }, note: "仮：総予算10万円以下では物件専用LPを作らず、既存の物件ページを使う（プロトタイプの配分表）" },
  { id: "R-32", kind: "min_spend", condition: { always: true }, effect: { media: "flyer", min_man_yen: 2 }, note: "仮：チラシは印刷の最低ロットがあるので2万円以上" },

  // 狙う層の点数
  { id: "R-41", kind: "target_score", condition: more("target.households_with_under18_ratio", 0.03), effect: { target: "family", score: 2 }, note: "仮：18歳未満のいる世帯が区・市より3ポイント以上多い" },
  { id: "R-42", kind: "target_score", condition: more("target.couple_children_ratio"), effect: { target: "family", score: 1 }, note: "仮：夫婦と子供の世帯が区・市より多い" },
  { id: "R-43", kind: "target_score", condition: { fact: "facility.elementary_nearest", op: "<=", than: 800 }, effect: { target: "family", score: 1 }, note: "仮：最寄りの小学校が直線800m以内（徒歩約13分以内）" },
  { id: "R-44", kind: "target_score", condition: more("target.private_rented_ratio"), effect: { target: "family", score: 1 }, note: "仮：民営借家が区・市より多い（賃貸からの住み替え）" },
  { id: "R-45", kind: "target_score", condition: more("target.private_rented_ratio"), effect: { target: "dinks", score: 1 }, note: "仮：民営借家が区・市より多い（賃貸に住む共働き夫婦）" },
  { id: "R-46", kind: "target_score", condition: { fact: "facility.station_nearest", op: "<=", than: 1000 }, effect: { target: "dinks", score: 2 }, note: "仮：最寄りの駅が直線1km以内（通勤の利便性）" },
  { id: "R-47", kind: "target_score", condition: more("target.detached_ratio"), effect: { target: "relocation", score: 1 }, note: "仮：一戸建が区・市より多い（周辺からの住み替え）" },
  { id: "R-48", kind: "target_score", condition: { fact: "facility.station_nearest", op: ">", than: 1000 }, effect: { target: "relocation", score: 1 }, note: "仮：最寄りの駅が直線1kmより遠い（車中心の暮らしに慣れた周辺の住民）" },
];

async function main() {
  const sql = getSql();
  try {
    let added = 0;
    for (const r of RULES) {
      const rows = await sql`
        insert into rules (id, kind, condition, effect, note, updated_by)
        values (${r.id}, ${r.kind}, ${sql.json(r.condition as never)}, ${sql.json(r.effect as never)}, ${r.note}, 'seed-rules')
        on conflict (id) do nothing
        returning id
      `;
      added += rows.length;
    }
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from rules`;
    console.log(`仮のルール：${added}件を追加（すでにあった ${RULES.length - added}件は上書きしない）。rules は全部で ${n}件`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
