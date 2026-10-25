import { basename } from "node:path";
import { getSql } from "../lib/db";
import { parseScoringWorkbook } from "./scoring/parse";

// Excel「採点ルール表」を DB の採点の設定（personas・scoring_rules など）に取り込む（設計書 D35）
// 使い方：npm run import-scoring -- "<採点ルール表.xlsx のパス>" [--dry-run]
// 同じ ID の行は上書きする（Excel にない行は消さない。消すときは /rules の画面で）
// 取り込みも変更履歴（scoring_revisions）に「Excel取り込み」として残る
// Excel は BRUMBY様との共有資料なので Git には入れない

async function main() {
  const args = process.argv.slice(2);
  const path = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  if (!path) throw new Error('使い方：npm run import-scoring -- "<採点ルール表.xlsx のパス>" [--dry-run]');

  const wb = parseScoringWorkbook(path);
  const c = wb.config;
  console.log(`ペルソナ ${c.personas.length}・項目 ${c.items.length}・ルール ${c.rules.length}・数値の設定 ${wb.params.length}・競合の項目 ${c.competitorItems.length}`);
  console.log(`相場 ${c.market.length}・エリア人気 ${c.popularity.length}・媒体 ${c.media.length}・利用率 ${c.usage.length}・反響の記録 ${wb.mediaResults.length}・変更履歴 ${wb.history.length}`);
  for (const w of wb.warnings) console.warn(`注意：${w}`);
  if (dryRun) {
    console.log("--dry-run のため、DB には書き込みません");
    return;
  }

  const sql = getSql();
  const reason = `Excel取り込み（${basename(path)}）`;
  await sql.begin(async (tx) => {
    await tx`select set_config('brumby.change_reason', ${reason}, true), set_config('brumby.changed_by', 'import', true)`;

    for (const p of c.personas) {
      const row = {
        id: p.id, label: p.label, description: p.description, rep_age: p.repAge, down_payment_rate: p.downPaymentRate, purchase_method: p.purchaseMethod,
        income_dist: tx.json(p.incomeDist), savings_dist: tx.json(p.savingsDist), age_mix: tx.json(p.ageMix), buyer_share_new: p.buyerShareNew, buyer_share_used: p.buyerShareUsed,
        notes: tx.json(wb.personaNotes[p.id] as unknown as Record<string, string>), sort_order: p.sortOrder, enabled: p.enabled, updated_by: "import",
      };
      await tx`
        insert into personas ${tx(row)}
        on conflict (id) do update set label = excluded.label, description = excluded.description, rep_age = excluded.rep_age, down_payment_rate = excluded.down_payment_rate,
          purchase_method = excluded.purchase_method, income_dist = excluded.income_dist, savings_dist = excluded.savings_dist, age_mix = excluded.age_mix,
          buyer_share_new = excluded.buyer_share_new, buyer_share_used = excluded.buyer_share_used, notes = excluded.notes, sort_order = excluded.sort_order, updated_by = excluded.updated_by
      `;
    }

    for (const [i, item] of c.items.entries()) {
      await tx`
        insert into scoring_items ${tx({ key: item.key, layer: item.layer, importance: tx.json(item.importance), note: wb.itemNotes[item.key] ?? "", sort_order: i + 1, updated_by: "import" })}
        on conflict (key) do update set layer = excluded.layer, importance = excluded.importance, note = excluded.note, sort_order = excluded.sort_order, updated_by = excluded.updated_by
      `;
    }

    for (const r of c.rules) {
      const extra = wb.ruleExtras[r.id];
      const row = {
        id: r.id, layer: r.layer, item_key: r.itemKey, lower_bound: r.lower, upper_bound: r.upper, reason: r.reason, source: extra.source, fit: tx.json(r.fit),
        basis_class: r.basisClass, basis_note: extra.basisNote, exclusive_group: r.exclusiveGroup, sort_order: extra.sortOrder, enabled: r.enabled, updated_by: "import",
      };
      await tx`
        insert into scoring_rules ${tx(row)}
        on conflict (id) do update set layer = excluded.layer, item_key = excluded.item_key, lower_bound = excluded.lower_bound, upper_bound = excluded.upper_bound,
          reason = excluded.reason, source = excluded.source, fit = excluded.fit, basis_class = excluded.basis_class, basis_note = excluded.basis_note,
          exclusive_group = excluded.exclusive_group, sort_order = excluded.sort_order, updated_by = excluded.updated_by
      `;
    }

    for (const p of wb.params) {
      await tx`
        insert into scoring_params ${tx({ key: p.key, category: p.category, label: p.label, value: p.value, note: p.note, sort_order: p.sortOrder, updated_by: "import" })}
        on conflict (key) do update set category = excluded.category, label = excluded.label, value = excluded.value, note = excluded.note, sort_order = excluded.sort_order, updated_by = excluded.updated_by
      `;
    }

    for (const [i, ci] of c.competitorItems.entries()) {
      const row = { key: ci.key, label: ci.label, direction: ci.direction, importance: tx.json(ci.importance), tie_margin: ci.tieMargin, note: wb.competitorNotes[ci.key] ?? "", sort_order: i + 1, updated_by: "import" };
      await tx`
        insert into competitor_items ${tx(row)}
        on conflict (key) do update set label = excluded.label, direction = excluded.direction, importance = excluded.importance, tie_margin = excluded.tie_margin,
          note = excluded.note, sort_order = excluded.sort_order, updated_by = excluded.updated_by
      `;
    }

    for (const m of c.market) {
      const row = { ward: m.ward, age_class: m.ageClass, price_man_yen: m.priceManYen, building_sqm: m.buildingSqm, land_sqm: m.landSqm, age_years: m.ageYears, n: m.n, updated_by: "import" };
      await tx`
        insert into market_reference ${tx(row)}
        on conflict (ward, age_class) do update set price_man_yen = excluded.price_man_yen, building_sqm = excluded.building_sqm, land_sqm = excluded.land_sqm,
          age_years = excluded.age_years, n = excluded.n, updated_by = excluded.updated_by
      `;
    }

    // エリア人気は行が多いので、変わった行だけを書く（履歴を増やしすぎない）
    for (const a of c.popularity) {
      await tx`
        insert into area_popularity ${tx({ ward: a.ward, town: a.town, score: a.score, city_rank: wb.areaRanks[`${a.ward}/${a.town}`] ?? null, updated_by: "import" })}
        on conflict (ward, town) do update set score = excluded.score, city_rank = excluded.city_rank, updated_by = excluded.updated_by
        where area_popularity.score is distinct from excluded.score or area_popularity.city_rank is distinct from excluded.city_rank
      `;
    }

    for (const m of c.media) {
      const row = { id: m.id, label: m.label, stat_name: m.statName, flat_reach: m.flatReach, enabled: m.enabled, format_example: m.formatExample, source: wb.mediaExtras[m.id]?.source ?? "", sort_order: m.sortOrder, updated_by: "import" };
      await tx`
        insert into media_channels ${tx(row)}
        on conflict (id) do update set label = excluded.label, stat_name = excluded.stat_name, flat_reach = excluded.flat_reach, enabled = excluded.enabled,
          format_example = excluded.format_example, source = excluded.source, sort_order = excluded.sort_order, updated_by = excluded.updated_by
      `;
    }

    for (const u of c.usage) {
      await tx`
        insert into media_usage_rates ${tx({ stat_name: u.statName, rates: tx.json(u.rates), all_ages: u.allAges, metric: wb.usageMetric[u.statName] ?? "利用率", updated_by: "import" })}
        on conflict (stat_name) do update set rates = excluded.rates, all_ages = excluded.all_ages, metric = excluded.metric, updated_by = excluded.updated_by
      `;
    }

    // 反響の記録：同じ媒体・開始日・費用の行があれば二重に入れない
    let added = 0;
    for (const r of wb.mediaResults) {
      const media = c.media.find((m) => m.label === r.mediaLabel);
      if (!media) {
        console.warn(`注意：反響の記録の媒体「${r.mediaLabel}」が媒体の一覧にないため、取り込みませんでした`);
        continue;
      }
      const memo = [r.propertyRef ? `物件ID ${r.propertyRef}` : null, r.memo].filter(Boolean).join("：") || null;
      const [dup] = await tx`select 1 from media_results where media_id = ${media.id} and started_on is not distinct from ${r.startedOn} and cost_yen = ${r.costYen} and memo is not distinct from ${memo}`;
      if (dup) continue;
      await tx`
        insert into media_results ${tx({ media_id: media.id, started_on: r.startedOn, cost_yen: r.costYen, inquiries: r.inquiries, visits: r.visits, contracts: r.contracts, memo, entered_by: "import" })}
      `;
      added++;
    }
    if (wb.mediaResults.length) console.log(`反響の記録：${added}件を追加`);

    // Excel の変更履歴は、まだ取り込んでいない行だけを履歴に写す（table_name = 'excel'）
    for (const h of wb.history) {
      const after = { sheet: h.sheet, target: h.target, value: h.after };
      const [dup] = await tx`select 1 from scoring_revisions where table_name = 'excel' and row_key = ${h.target ?? ""} and after = ${tx.json(after)}`;
      if (dup) continue;
      await tx`
        insert into scoring_revisions (table_name, row_key, operation, before, after, reason, related_property, changed_by, changed_at)
        values ('excel', ${h.target ?? ""}, 'update', ${tx.json({ sheet: h.sheet, target: h.target, value: h.before })}, ${tx.json(after)}, ${h.reason}, ${h.relatedProperty}, ${h.changedBy},
          ${h.date ? `${h.date}T00:00:00+09:00` : new Date().toISOString()})
      `;
    }
  });

  const [v] = await sql<{ v: string | null }[]>`select max(id) as v from scoring_revisions`;
  console.log(`取り込みました（設定の版 ${v?.v ?? "—"}）`);
  await sql.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
