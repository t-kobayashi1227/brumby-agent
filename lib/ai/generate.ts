import Anthropic, { type AutoParseableOutputFormat, type ParsedMessage } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Sql } from "../db";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { NarrativeContentSchema, type NarrativeContent } from "./schema";
import type { FactRow, PropertySummary, ValidationResult } from "./types";
import { describeMismatches, validateNarrative } from "./validate";
import { scoringSchemaReady } from "../scoring/schema-check";

// AIの文章の生成（設計書 6.2・6.3）：下書き（段階「AI」）→ 検証・不合格なら1回だけ作り直し（段階「検証」）→ それでも不合格なら要確認のまま返す
// AIに送るのは物件の最小限の情報とカードだけ（D28）。物件名・詳しい住所は送らない。ログにも物件の本文や住所を出さない

/**
 * モデル。.env.local（Vercel では環境変数）の ANTHROPIC_MODEL で変えられる
 * PoC の開発テストでは安い Claude Haiku 5.5 を既定にする（2026-10-12）。文章の質が足りなければ claude-sonnet-5 などと比べる（設計書 6.2）
 */
export const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-5-5";
/** 出力の上限。考える分（thinking）も含む。12000 では根拠が増えた分だけ考えて上限に達し、本文が出なかった（2026-10-12） */
const MAX_TOKENS = 16000;

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
/**
 * 考える深さ。ANTHROPIC_EFFORT で変えられる（low / medium / high / xhigh / max）
 * 決まった判断を言い換える仕事なので low を既定にする（Sonnet 5 の high では考える分だけで 12000 を超えた）
 */
const EFFORT: (typeof EFFORTS)[number] = (EFFORTS as readonly string[]).includes(process.env.ANTHROPIC_EFFORT?.trim() ?? "")
  ? (process.env.ANTHROPIC_EFFORT!.trim() as (typeof EFFORTS)[number])
  : "low";

/**
 * Claude API のクライアント。workspace に紐づかないキー（sk-ant-usr… など）は、どの workspace で使うかを
 * ヘッダー anthropic-workspace-id で伝える必要がある。ANTHROPIC_WORKSPACE_ID があれば付ける
 */
function createClient(): Anthropic {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {});
}

export interface GenerateResult {
  content: NarrativeContent;
  validation: ValidationResult;
  attempts: number;
  /** 作り直しを含めた合計（D17。P7 の性能・費用の材料） */
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

async function loadFacts(sql: Sql, runId: number): Promise<FactRow[]> {
  const rows = await sql<
    { seq: number; key: string; kind: "fact" | "decision"; value: number | null; value_text: string | null; unit: string | null; comparison: number | null; status: FactRow["status"]; basis: Record<string, unknown> | null; attribution: string | null }[]
  >`
    select seq, key, kind, value, value_text, unit, comparison, status, basis, attribution
    from facts where run_id = ${runId} order by seq
  `;
  return rows.map((r) => ({
    seq: r.seq,
    key: r.key,
    kind: r.kind,
    value: r.value === null ? null : Number(r.value),
    valueText: r.value_text,
    unit: r.unit,
    comparison: r.comparison === null ? null : Number(r.comparison),
    status: r.status,
    basis: r.basis,
    attribution: r.attribution,
  }));
}

/** 住所を町丁目までに丸める：物件の地点を含む町丁目の名前（国勢調査の境界）。取れなければ、住所の最初の数字より前まで */
export function roundAddress(address: string, areaName: string | null): string {
  if (areaName) return areaName;
  return address.replace(/[0-9０-９一二三四五六七八九十]+(丁目|番|-|－|ー).*$/, "").replace(/[0-9０-９].*$/, "").trim();
}

async function loadPropertySummary(sql: Sql, runId: number): Promise<PropertySummary> {
  const [row] = await sql<
    { id: number; property_type: string; price_man_yen: number | null; address: string; area_name: string | null; layout: string | null; land_sqm: string | null; building_sqm: string | null; parking: number | null; access: string | null; features: string | null; age_years: number | null; is_hiraya: boolean | null; has_garden: boolean | null; competitors: number }[]
  >`
    select p.id, p.property_type, p.price_man_yen, p.address, p.layout, p.land_sqm, p.building_sqm, p.parking, p.access, p.features,
      ${(await scoringSchemaReady(sql)) ? sql`p.age_years, p.is_hiraya, p.has_garden,` : sql`null::smallint as age_years, null::boolean as is_hiraya, null::boolean as has_garden,`}
      (select a.city_name || coalesce(a.name, '') from areas a join dataset_versions v on v.id = a.dataset_version_id
        where v.status = 'active' and p.geom is not null and extensions.st_intersects(a.geom, p.geom) limit 1) as area_name,
      (select count(*)::int from competitors c where c.property_id = p.id) as competitors
    from properties p join analysis_runs r on r.property_id = p.id
    where r.id = ${runId}
  `;
  if (!row) throw new Error(`実行 ${runId} に対応する物件がありません`);
  return {
    ref: `物件${row.id}`,
    propertyType: row.property_type,
    priceManYen: row.price_man_yen,
    area: roundAddress(row.address, row.area_name),
    layout: row.layout,
    landSqm: row.land_sqm === null ? null : Number(row.land_sqm),
    buildingSqm: row.building_sqm === null ? null : Number(row.building_sqm),
    parking: row.parking,
    access: row.access,
    features: row.features,
    ageYears: row.age_years,
    isHiraya: row.is_hiraya,
    hasGarden: row.has_garden,
    competitorCount: row.competitors,
  };
}

/** 検証で「入力にない設備」を見分けるための、物件の入力をつないだ文 */
function propertyText(p: PropertySummary): string {
  return [p.layout, p.access, p.features, p.parking ? `駐車場${p.parking}台` : null, p.isHiraya ? "平屋" : null, p.hasGarden ? "庭あり" : null].filter(Boolean).join(" ");
}

function extractParsed(message: ParsedMessage<NarrativeContent>): NarrativeContent {
  if (message.stop_reason === "refusal") {
    throw new Error(`AIが生成を断りました（${message.stop_details?.category ?? "理由の分類なし"}）`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error(`AIの出力が上限（${MAX_TOKENS}トークン、うち考える分 ${message.usage.output_tokens_details?.thinking_tokens ?? "不明"}）に達して途中で止まりました`);
  }
  if (!message.parsed_output) {
    const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    throw new Error(`AIの出力をJSONとして解釈できませんでした：${text.slice(0, 300)}`);
  }
  return message.parsed_output;
}

/** APIの取得に失敗したら、間隔を空けて数回やり直す（設計書8） */
async function callClaude(client: Anthropic, outputFormat: AutoParseableOutputFormat<NarrativeContent>, messages: Anthropic.Messages.MessageParam[], retries = 2): Promise<ParsedMessage<NarrativeContent>> {
  for (let i = 0; ; i++) {
    try {
      return await client.messages.parse({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages, output_config: { effort: EFFORT, format: outputFormat } });
    } catch (error) {
      if (i >= retries) throw error;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

interface Usage {
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

/** 1回呼んで、使ったトークン数と時間を usage に足す */
async function callAndCount(client: Anthropic, messages: Anthropic.Messages.MessageParam[], usage: Usage): Promise<NarrativeContent> {
  const started = Date.now();
  const response = await callClaude(client, zodOutputFormat(NarrativeContentSchema), messages);
  usage.durationMs += Date.now() - started;
  const u = response.usage;
  usage.inputTokens += u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  usage.outputTokens += u.output_tokens;
  return extractParsed(response);
}

async function loadContext(sql: Sql, runId: number) {
  const [property, facts] = await Promise.all([loadPropertySummary(sql, runId), loadFacts(sql, runId)]);
  if (facts.length === 0) throw new Error(`実行 ${runId} にカードがありません（先に分析を実行してください）`);
  return { property, facts, prompt: buildUserPrompt(property, facts), ctx: { propertyText: propertyText(property), competitorCount: property.competitorCount } };
}

/** 段階「AI」（D34）：文章の下書きを1回だけ作る。検証と作り直しは次の段階 */
export async function draftNarrative(sql: Sql, runId: number): Promise<{ content: NarrativeContent } & Usage> {
  const { prompt } = await loadContext(sql, runId);
  const usage: Usage = { inputTokens: 0, outputTokens: 0, durationMs: 0 };
  const content = await callAndCount(createClient(), [{ role: "user", content: prompt }], usage);
  return { content, ...usage };
}

/**
 * 段階「検証」（D34）：下書きを検証し、不合格なら理由を伝えて1回だけ作り直させる（設計書 6.3）
 * usage には下書きの分を渡し、作り直しの分を足して返す
 */
export async function verifyNarrative(sql: Sql, runId: number, draft: NarrativeContent, usage: Usage = { inputTokens: 0, outputTokens: 0, durationMs: 0 }): Promise<GenerateResult> {
  const { facts, prompt, ctx } = await loadContext(sql, runId);
  const total = { ...usage };
  let content = draft;
  let validation = validateNarrative(content, facts, ctx);
  let attempts = 1;

  if (!validation.ok) {
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: prompt },
      { role: "assistant", content: JSON.stringify(draft) },
      {
        role: "user",
        content: [
          "次の文が検証に通りませんでした。該当する文だけを、理由に合わせて書き直してください（他の文は変えないでください）。",
          describeMismatches(validation),
          `JSON全体（headline・${content.sections.length}セクション分）を、指定した形式でもう一度出力してください。`,
        ].join("\n\n"),
      },
    ];
    content = await callAndCount(createClient(), messages, total);
    validation = validateNarrative(content, facts, ctx);
    attempts = 2;
  }

  return { content, validation, attempts, ...total };
}

/** 下書きから検証・作り直しまでを続けて行う（npm run generate-narrative 用） */
export async function generateNarrative(sql: Sql, runId: number): Promise<GenerateResult> {
  const { content, ...usage } = await draftNarrative(sql, runId);
  return verifyNarrative(sql, runId, content, usage);
}
