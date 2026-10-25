// 仮のルールを rules に入れる：npm run seed-rules
// すでにある番号のルールは上書きしない（Supabase の画面で直した内容を消さないため）
// あわせて、狙う層の候補（target_candidates）と訴求の素材（appeal_items）の最初の行も入れる（すでにある id は上書きしない）
// 出発点はプロトタイプ（app/_lib/data.ts の mediaDefs・budgetRules）、狙う層の設計.md、設計書 6.4。数値はすべて仮
import { getSql } from "../lib/db";
import type { AppealDef, CandidateDef } from "../lib/rules/catalog";
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

  // 狙う層の点数（狙う層の設計.md 3章。個数方式：指標ごとに1点。閾値は仮）
  { id: "R-T01", kind: "target_score", condition: more("target.age_30_49_ratio"), effect: { candidate: "family", score: 1 }, note: "仮：30〜49歳の割合が区・市より高いエリアは、子育て世帯の需要が見込める" },
  { id: "R-T02", kind: "target_score", condition: more("target.households_with_under18_ratio"), effect: { candidate: "family", score: 1 }, note: "仮：18歳未満のいる世帯が区・市より多い" },
  { id: "R-T03", kind: "target_score", condition: more("target.couple_children_ratio"), effect: { candidate: "family", score: 1 }, note: "仮：夫婦と子供の世帯が区・市より多い" },
  { id: "R-T04", kind: "target_score", condition: more("target.private_rented_ratio"), effect: { candidate: "family", score: 1 }, note: "仮：民営借家が区・市より多い（賃貸からの住み替え元がいる）" },
  { id: "R-T05", kind: "target_score", condition: more("target.age_20_39_ratio"), effect: { candidate: "dual_income", score: 1 }, note: "仮：20〜39歳の割合が区・市より高い（共働き夫婦が多い可能性。年齢帯で代用、D21）" },
  { id: "R-T06", kind: "target_score", condition: more("target.private_rented_ratio"), effect: { candidate: "dual_income", score: 1 }, note: "仮：民営借家が区・市より多い（賃貸に住む若い世帯）" },
  { id: "R-T07", kind: "target_score", condition: { fact: "facility.station_nearest", op: "<=", than: 800 }, effect: { candidate: "dual_income", score: 1 }, note: "仮：最寄りの駅が直線800m以内（通勤の利便性）" },
  { id: "R-T08", kind: "target_score", condition: more("target.detached_ratio"), effect: { candidate: "replacement", score: 1 }, note: "仮：一戸建が区・市より多い（近隣からの住み替え）" },
  { id: "R-T09", kind: "target_score", condition: more("target.age_65plus_ratio"), effect: { candidate: "replacement", score: 1 }, note: "仮：65歳以上が区・市より多い（築年の古い住宅が多い目安）" },
  { id: "R-T10", kind: "target_score", condition: { fact: "future.population_change", op: ">", than: -0.05 }, effect: { candidate: "replacement", score: 1 }, note: "仮：2035年までの人口の減りが5%未満" },
  { id: "R-T11", kind: "target_score", condition: more("target.age_65plus_ratio"), effect: { candidate: "senior", score: 1 }, note: "仮：65歳以上が区・市より多い" },
  { id: "R-T12", kind: "target_score", condition: { fact: "facility.station_nearest", op: "<=", than: 1000 }, effect: { candidate: "senior", score: 1 }, note: "仮：最寄りの駅が直線1km以内（車に頼らない暮らし）" },
  { id: "R-T13", kind: "target_score", condition: { fact: "target.couple_children_ratio", op: "<", than: "comparison" }, effect: { candidate: "senior", score: 1 }, note: "仮：夫婦と子供の世帯が区・市より少ない（子育てを終えた世帯の目安。代用なので聞き取りで外してよい）" },
  { id: "R-T14", kind: "target_score", condition: more("target.age_30_49_ratio"), effect: { candidate: "land_buyer", score: 1 }, note: "仮：30〜49歳の割合が区・市より高い（注文住宅を建てる世代）" },
  { id: "R-T15", kind: "target_score", condition: { fact: "market.unit_price_median", op: ">=", than: "comparison" }, effect: { candidate: "land_buyer", score: 1 }, note: "仮：土地の1㎡あたりの取引価格の中央値が、物件の1㎡あたりの価格以上（相場より割安）" },
  { id: "R-T16", kind: "target_score", condition: { fact: "area.zoning", op: "contains", than: "住居" }, effect: { candidate: "land_buyer", score: 1 }, note: "仮：住居系の用途地域" },

  // 訴求の点数（設計書 6.4。素材ごとに1点。閾値は仮）
  { id: "R-A01", kind: "appeal_score", condition: { fact: "facility.elementary_nearest", op: "<=", than: 800 }, effect: { appeal: "school_near", score: 1 }, note: "仮：最寄りの小学校が直線800m以内（徒歩約13分以内）" },
  { id: "R-A02", kind: "appeal_score", condition: { fact: "facility.nursery_count", op: ">=", than: 5 }, effect: { appeal: "nursery_many", score: 1 }, note: "仮：半径の中に保育園・幼稚園等が5か所以上" },
  { id: "R-A03", kind: "appeal_score", condition: { fact: "facility.station_nearest", op: "<=", than: 1000 }, effect: { appeal: "station_near", score: 1 }, note: "仮：最寄りの駅が直線1km以内" },
  { id: "R-A04", kind: "appeal_score", condition: { fact: "area.zoning", op: "contains", than: "住居" }, effect: { appeal: "quiet_residential", score: 1 }, note: "仮：住居系の用途地域" },
  { id: "R-A05", kind: "appeal_score", condition: { fact: "market.price_gap", op: "<", than: 0 }, effect: { appeal: "below_market", score: 1 }, note: "仮：物件の価格が取引価格の中央値より低い" },
  { id: "R-A06", kind: "appeal_score", condition: { fact: "land.trend_5y", op: ">", than: 0 }, effect: { appeal: "land_rising", score: 1 }, note: "仮：近くの住宅地の地価が5年間で上がっている" },
  { id: "R-A07", kind: "appeal_score", condition: more("target.households_with_under18_ratio"), effect: { appeal: "family_area", score: 1 }, note: "仮：18歳未満のいる世帯が区・市より多い" },
  { id: "R-A08", kind: "appeal_score", condition: { fact: "competitor.land_area_gap", op: ">", than: 0 }, effect: { appeal: "land_wider", score: 1 }, note: "仮：土地が競合の平均より広い" },
  { id: "R-A09", kind: "appeal_score", condition: { always: true }, effect: { appeal: "spec", score: 1 }, note: "仮：物件の特徴が入力されていれば候補にする（必要なカード：物件の特徴）" },
];

const HOUSE = ["新築戸建", "中古戸建"];

/** 狙う層の候補（狙う層の設計.md 3章、D21） */
const CANDIDATES: Omit<CandidateDef, "enabled">[] = [
  { id: "family", label: "30〜40代の子育てファミリー", description: "賃貸からの住み替え層。学校・駐車場・広さに関心", property_types: HOUSE, sort_order: 1, confidence: "normal" },
  { id: "dual_income", label: "20〜30代の共働き夫婦", description: "利便性の高いエリアでの購入を検討。駅までの距離・通勤を重視。共働きは20〜39歳の割合で代用した仮説で、断定しない", property_types: HOUSE, sort_order: 2, confidence: "normal" },
  { id: "replacement", label: "近隣からの住み替え層", description: "今の住まいが手狭・古くなった周辺の世帯。住み替え元の築年は公開データでは分からないため仮説", property_types: HOUSE, sort_order: 3, confidence: "low" },
  { id: "senior", label: "子育て後のコンパクトな住み替え", description: "子育てを終えた世帯の、平屋・小さめの家や土地への住み替え", property_types: [...HOUSE, "土地"], sort_order: 4, confidence: "normal" },
  { id: "land_buyer", label: "土地購入の注文住宅層", description: "土地を買って注文住宅を建てたい30〜40代。相場との比較と住環境を重視", property_types: ["土地"], sort_order: 5, confidence: "normal" },
];

/** 訴求の素材（設計書 6.4、D23） */
const APPEALS: Omit<AppealDef, "enabled">[] = [
  { id: "school_near", label: "小・中学校が近い", description: "最寄りの小・中学校までの距離", needs_facts: ["facility.elementary_nearest"], property_types: null, sort_order: 1 },
  { id: "nursery_many", label: "保育園・幼稚園が多い", description: "周りの保育園・幼稚園等の数", needs_facts: ["facility.nursery_count"], property_types: null, sort_order: 2 },
  { id: "station_near", label: "駅が近い", description: "最寄りの駅までの距離", needs_facts: ["facility.station_nearest"], property_types: null, sort_order: 3 },
  { id: "quiet_residential", label: "住居系の用途地域で落ち着いた環境", description: "用途地域", needs_facts: ["area.zoning"], property_types: null, sort_order: 4 },
  { id: "below_market", label: "相場より割安", description: "物件の価格と周りの取引価格の中央値の差", needs_facts: ["market.price_gap"], property_types: null, sort_order: 5 },
  { id: "land_rising", label: "地価が上昇しているエリア", description: "近くの住宅地の地価の5年間の変化", needs_facts: ["land.trend_5y"], property_types: null, sort_order: 6 },
  { id: "family_area", label: "周辺の子育て世帯が多い", description: "18歳未満のいる世帯の割合", needs_facts: ["target.households_with_under18_ratio"], property_types: null, sort_order: 7 },
  { id: "land_wider", label: "競合より土地が広い", description: "土地の面積と競合の平均の差", needs_facts: ["competitor.land_area_gap"], property_types: null, sort_order: 8 },
  { id: "spec", label: "物件の仕様（ZEHなど）", description: "物件の登録で入力した特徴", needs_facts: ["property.features"], property_types: null, sort_order: 9 },
];

/** 2026-10-06より前の狙う層のルール（候補 dinks・relocation など、今はない候補を指す）。seed-rules が入れたまま直していなければ止める */
const LEGACY_TARGET_RULES = ["R-41", "R-42", "R-43", "R-44", "R-45", "R-46", "R-47", "R-48"];

async function main() {
  const sql = getSql();
  try {
    let candidatesAdded = 0;
    for (const c of CANDIDATES) {
      const rows = await sql`
        insert into target_candidates (id, label, description, property_types, sort_order, confidence, updated_by)
        values (${c.id}, ${c.label}, ${c.description}, ${c.property_types}, ${c.sort_order}, ${c.confidence}, 'seed-rules')
        on conflict (id) do nothing
        returning id
      `;
      candidatesAdded += rows.length;
    }
    let appealsAdded = 0;
    for (const a of APPEALS) {
      const rows = await sql`
        insert into appeal_items (id, label, description, needs_facts, property_types, sort_order, updated_by)
        values (${a.id}, ${a.label}, ${a.description}, ${a.needs_facts}, ${a.property_types}, ${a.sort_order}, 'seed-rules')
        on conflict (id) do nothing
        returning id
      `;
      appealsAdded += rows.length;
    }
    console.log(`狙う層の候補：${candidatesAdded}件を追加 ／ 訴求の素材：${appealsAdded}件を追加（すでにある id は上書きしない）`);

    const stopped = await sql<{ id: string }[]>`
      update rules set enabled = false, updated_by = 'seed-rules（旧い狙う層のルールを止めた）'
      where id = any(${LEGACY_TARGET_RULES}) and kind = 'target_score' and enabled and updated_by = 'seed-rules' and effect ? 'target'
      returning id
    `;
    if (stopped.length) console.log(`旧い狙う層のルールを止めました：${stopped.map((r) => r.id).join("、")}（削除はしない）`);
    const left = await sql<{ id: string }[]>`
      select id from rules where kind = 'target_score' and enabled and effect ? 'target'
    `;
    if (left.length) console.log(`注意：旧い形の狙う層のルールが使う設定のまま残っています（人が直したもの）。/rules で候補を選び直すか、止めてください：${left.map((r) => r.id).join("、")}`);

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
