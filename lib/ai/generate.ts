import Anthropic, { type AutoParseableOutputFormat, type ParsedMessage } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Sql } from "../db";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { NarrativeContentSchema, type NarrativeContent } from "./schema";
import type { FactRow, PropertySummary, ValidationResult } from "./types";
import { describeMismatches, validateNarrative } from "./validate";

// AIの文章の生成（設計書 6.2・6.3）：生成 → 検証 → ずれていたら1回だけ作り直し → それでもずれていたら要確認のまま返す

export const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 12000;

export interface GenerateResult {
  content: NarrativeContent;
  validation: ValidationResult;
  attempts: number;
}

async function loadFacts(sql: Sql, runId: number): Promise<FactRow[]> {
  const rows = await sql<
    { seq: number; key: string; kind: "fact" | "decision"; value: number | null; value_text: string | null; unit: string | null; comparison: number | null; status: FactRow["status"]; attribution: string | null }[]
  >`
    select seq, key, kind, value, value_text, unit, comparison, status, attribution
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
    attribution: r.attribution,
  }));
}

async function loadPropertySummary(sql: Sql, runId: number): Promise<PropertySummary> {
  const [row] = await sql<
    { name: string; property_type: string; price_man_yen: number | null; address: string; layout: string | null; land_sqm: string | null; building_sqm: string | null; access: string | null; features: string | null }[]
  >`
    select p.name, p.property_type, p.price_man_yen, p.address, p.layout, p.land_sqm, p.building_sqm, p.access, p.features
    from properties p join analysis_runs r on r.property_id = p.id
    where r.id = ${runId}
  `;
  if (!row) throw new Error(`実行 ${runId} に対応する物件がありません`);
  return {
    name: row.name,
    propertyType: row.property_type,
    priceManYen: row.price_man_yen,
    address: row.address,
    layout: row.layout,
    landSqm: row.land_sqm === null ? null : Number(row.land_sqm),
    buildingSqm: row.building_sqm === null ? null : Number(row.building_sqm),
    access: row.access,
    features: row.features,
  };
}

function extractParsed(message: ParsedMessage<NarrativeContent>): NarrativeContent {
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
      return await client.messages.parse({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages, output_config: { format: outputFormat } });
    } catch (error) {
      if (i >= retries) throw error;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

export async function generateNarrative(sql: Sql, runId: number): Promise<GenerateResult> {
  const [property, facts] = await Promise.all([loadPropertySummary(sql, runId), loadFacts(sql, runId)]);
  if (facts.length === 0) throw new Error(`実行 ${runId} にカードがありません（先に分析を実行してください）`);

  const client = new Anthropic();
  const outputFormat = zodOutputFormat(NarrativeContentSchema);
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: buildUserPrompt(property, facts) }];

  let response = await callClaude(client, outputFormat, messages);
  let content = extractParsed(response);
  let validation = validateNarrative(content, facts);
  let attempts = 1;

  if (!validation.ok) {
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [
        "次の文で、数字がカードの値と一致していません。該当する文だけを、カードの数字どおりに書き直してください（他の文は変えないでください）。",
        describeMismatches(validation),
        "JSON全体（headline・4セクション分）を、指定した形式でもう一度出力してください。",
      ].join("\n\n"),
    });

    response = await callClaude(client, outputFormat, messages);
    content = extractParsed(response);
    validation = validateNarrative(content, facts);
    attempts = 2;
  }

  return { content, validation, attempts };
}
