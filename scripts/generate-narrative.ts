// 物件の最新の分析結果から、AIの文章を作って保存する：npm run generate-narrative -- --property 1 [--run 24]
// 本番では画面の「分析する」の後に、同じ処理（lib/ai/generate.ts）を呼ぶ（設計書 6.2・6.3）
import { parseArgs } from "node:util";
import { getSql } from "../lib/db";
import { generateNarrative, MODEL } from "../lib/ai/generate";
import { describeMismatches } from "../lib/ai/validate";
import { PROMPT_VERSION } from "../lib/ai/prompt";
import { SECTION_TITLE, SENTENCE_KIND_LABEL, type SectionKey } from "../lib/ai/schema";

async function main() {
  const { values } = parseArgs({ options: { property: { type: "string" }, run: { type: "string" } } });
  if (!values.property && !values.run) throw new Error("--property または --run を指定してください");

  const sql = getSql();
  try {
    let runId: number;
    if (values.run) {
      runId = Number(values.run);
    } else {
      const [row] = await sql<{ id: number }[]>`
        select id from analysis_runs where property_id = ${Number(values.property)} and status = 'succeeded' order by id desc limit 1
      `;
      if (!row) throw new Error(`物件 ${values.property} に成功した分析がありません（先に npm run analyze を実行してください）`);
      runId = Number(row.id);
    }

    console.log(`実行 ${runId} の事実カード・判断カードから、AIの文章を作ります…`);
    const { content, validation, attempts, inputTokens, outputTokens, durationMs } = await generateNarrative(sql, runId);
    const status = validation.ok ? "ok" : "needs_review";

    await sql`
      insert into narratives (run_id, model, prompt_version, content, validation, status, attempts, input_tokens, output_tokens, duration_ms)
      values (${runId}, ${MODEL}, ${PROMPT_VERSION}, ${sql.json(content as never)}, ${sql.json(validation as never)}, ${status}, ${attempts},
              ${inputTokens}, ${outputTokens}, ${durationMs})
      on conflict (run_id) do update set
        model = excluded.model, prompt_version = excluded.prompt_version, content = excluded.content,
        validation = excluded.validation, status = excluded.status, attempts = excluded.attempts,
        input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens, duration_ms = excluded.duration_ms, created_at = now()
    `;

    console.log(`状態：${status}（${attempts}回で生成、入力 ${inputTokens}・出力 ${outputTokens} トークン、${(durationMs / 1000).toFixed(1)}秒）\n`);
    console.log(`# ${content.headline.text} [${content.headline.cites.map((c) => `F-${String(c).padStart(2, "0")}`).join(",")}]\n`);
    for (const section of content.sections) {
      console.log(`## ${SECTION_TITLE[section.key as SectionKey]}`);
      for (const paragraph of section.paragraphs) {
        for (const sentence of paragraph.sentences) {
          console.log(`（${SENTENCE_KIND_LABEL[sentence.kind]}）${sentence.text} [${sentence.cites.map((c) => `F-${String(c).padStart(2, "0")}`).join(",")}]`);
        }
      }
      console.log("");
    }

    if (!validation.ok) {
      console.log("要確認（検証に通らなかった文）：");
      console.log(describeMismatches(validation));
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
