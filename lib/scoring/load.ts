import type { Sql } from "../db";
import type { AgeClass, CompetitorItem, Mark, Persona, RuleLayer, ScoringConfig } from "./types";

// 採点ルール表の設定を DB から読む（設計書 D35）

const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function loadScoringConfig(sql: Sql): Promise<ScoringConfig> {
  const [personas, items, rules, params, competitorItems, market, popularity, media, usage, results, version] = await Promise.all([
    sql<{ id: string; label: string; description: string; rep_age: number; down_payment_rate: string; purchase_method: "loan" | "cash"; income_dist: unknown; savings_dist: unknown; age_mix: unknown; buyer_share_new: string | null; buyer_share_used: string | null; enabled: boolean; sort_order: number }[]>`
      select id, label, description, rep_age, down_payment_rate, purchase_method, income_dist, savings_dist, age_mix, buyer_share_new, buyer_share_used, enabled, sort_order from personas order by sort_order, id
    `,
    sql<{ key: string; layer: RuleLayer; importance: Record<string, number>; note: string }[]>`select key, layer, importance, note from scoring_items order by sort_order, key`,
    sql<{ id: string; layer: RuleLayer; item_key: string; lower_bound: string | null; upper_bound: string | null; reason: string; source: string | null; fit: Record<string, Mark>; basis_class: string | null; basis_note: string; exclusive_group: string | null; enabled: boolean }[]>`
      select id, layer, item_key, lower_bound, upper_bound, reason, source, fit, basis_class, basis_note, exclusive_group, enabled from scoring_rules order by sort_order, id
    `,
    sql<{ key: string; value: string }[]>`select key, value from scoring_params`,
    sql<{ key: string; label: string; direction: number; importance: Record<string, number>; tie_margin: string }[]>`select key, label, direction, importance, tie_margin from competitor_items order by sort_order, key`,
    sql<{ ward: string; age_class: AgeClass; price_man_yen: string; building_sqm: string | null; land_sqm: string | null; age_years: string | null; n: number | null }[]>`select ward, age_class, price_man_yen, building_sqm, land_sqm, age_years, n from market_reference`,
    sql<{ ward: string; town: string; score: string }[]>`select ward, town, score from area_popularity`,
    sql<{ id: string; label: string; stat_name: string | null; flat_reach: string | null; enabled: boolean; format_example: string; sort_order: number }[]>`select id, label, stat_name, flat_reach, enabled, format_example, sort_order from media_channels order by sort_order, id`,
    sql<{ stat_name: string; rates: Record<string, number>; all_ages: string }[]>`select stat_name, rates, all_ages from media_usage_rates`,
    sql<{ media_id: string; cost_yen: number; inquiries: number }[]>`select media_id, cost_yen, inquiries from media_results`,
    sql<{ v: string | null }[]>`select max(id) as v from scoring_revisions`,
  ]);
  return {
    personas: personas.map(
      (p): Persona => ({
        id: p.id,
        label: p.label,
        description: p.description,
        repAge: p.rep_age,
        downPaymentRate: Number(p.down_payment_rate),
        purchaseMethod: p.purchase_method,
        incomeDist: Array.isArray(p.income_dist) ? p.income_dist.map(Number) : [],
        savingsDist: Array.isArray(p.savings_dist) ? p.savings_dist.map(Number) : [],
        ageMix: (p.age_mix ?? {}) as Persona["ageMix"],
        buyerShareNew: n(p.buyer_share_new),
        buyerShareUsed: n(p.buyer_share_used),
        enabled: p.enabled,
        sortOrder: p.sort_order,
      }),
    ),
    items: items.map((i) => ({ key: i.key, layer: i.layer, importance: i.importance ?? {}, note: i.note })),
    rules: rules.map((r) => ({
      id: r.id,
      layer: r.layer,
      itemKey: r.item_key,
      lower: n(r.lower_bound),
      upper: n(r.upper_bound),
      reason: r.reason,
      source: r.source,
      fit: r.fit ?? {},
      basisClass: r.basis_class,
      basisNote: r.basis_note,
      exclusiveGroup: r.exclusive_group,
      enabled: r.enabled,
    })),
    params: Object.fromEntries(params.map((p) => [p.key, Number(p.value)])),
    competitorItems: competitorItems.map((c): CompetitorItem => ({ key: c.key, label: c.label, direction: c.direction === -1 ? -1 : 1, importance: c.importance ?? {}, tieMargin: Number(c.tie_margin) })),
    market: market.map((m) => ({ ward: m.ward, ageClass: m.age_class, priceManYen: Number(m.price_man_yen), buildingSqm: n(m.building_sqm), landSqm: n(m.land_sqm), ageYears: n(m.age_years), n: m.n })),
    popularity: popularity.map((a) => ({ ward: a.ward, town: a.town, score: Number(a.score) })),
    media: media.map((m) => ({ id: m.id, label: m.label, statName: m.stat_name, flatReach: n(m.flat_reach), enabled: m.enabled, formatExample: m.format_example, sortOrder: m.sort_order })),
    usage: usage.map((u) => ({ statName: u.stat_name, rates: u.rates ?? {}, allAges: Number(u.all_ages) })),
    results: results.map((r) => ({ mediaId: r.media_id, costYen: r.cost_yen, inquiries: r.inquiries })),
    version: n(version[0]?.v),
  };
}
