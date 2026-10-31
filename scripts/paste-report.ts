// npm run paste の答え（戦略.json・媒体.json・確認.json）を、レポート画面と同じ項目名で読みやすい HTML にする
// ブラウザで開いて読むだけのファイル（data/out/paste/ に置き、git に入れない）。事実IDには項目と値を並べて出す

import type { CheckIssue } from "../lib/agents/checks";
import type { MediaOutput, StrategyOutput } from "../lib/agents/schemas";
import type { simulate } from "../lib/calc/budget";
import type { Fact } from "../lib/facts/types";

export interface PasteReport {
  propertyId: number;
  factSheetDate: string;
  facts: Fact[];
  strategy: StrategyOutput;
  media: MediaOutput | null;
  mediaNames: Record<string, string>;
  budget: ReturnType<typeof simulate> | null;
  program: CheckIssue[] | null;
  ai: { target: string; location: string; check: number; problem: string }[] | null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TOPIC_ORDER = ["組み合わせ", "物件", "立地", "価格", "買い手", "その他"] as const;

export function reportHtml(r: PasteReport): string {
  const byId = new Map(r.facts.map((f) => [f.id, f]));
  const evidence = (ids: string[]) =>
    ids.length === 0
      ? `<div class="ev none">根拠の事実IDなし</div>`
      : `<ul class="ev">${ids
          .map((id) => {
            const f = byId.get(id);
            return `<li><b>${esc(id)}</b> ${f ? `${esc(f.項目)}：${esc(f.値 ?? "取得できず")}${f.状態 === "取得" ? "" : `（${esc(f.状態)}）`}` : "（事実シートにないID）"}</li>`;
          })
          .join("")}</ul>`;
  const block = (no: number | null, title: string, body: string) =>
    `<section><h2>${no === null ? "" : `<span class="no">${no}</span>`}${esc(title)}</h2>${body}</section>`;
  const s = r.strategy;
  const nameOf = (id: string, name: string) => r.mediaNames[id] ?? name;

  const strategyTab = [
    block(1, "総合評価", `<p>${esc(s.summary.text)}</p>${evidence(s.summary.evidence)}`),
    block(
      2,
      "狙う層",
      [...s.targets]
        .sort((a, b) => a.rank - b.rank)
        .map(
          (t) =>
            `<div class="item"><div class="head">第${t.rank}ターゲット：${esc(t.name)}${t.source === "エージェント提案" ? `<span class="muted">（AIが加えた候補）</span>` : ""}<span class="tag">確からしさ ${t.confidence}</span></div>${t.definition ? `<p class="muted">${esc(t.definition)}</p>` : ""}<p>${esc(t.reason)}</p>${evidence(t.evidence)}</div>`,
        )
        .join("") +
        (s.not_fit.length
          ? `<h3>合わない層</h3>${s.not_fit.map((n) => `<div class="item"><div class="head">${esc(n.name)}</div><p>${esc(n.reason)}</p>${evidence(n.evidence)}</div>`).join("")}`
          : ""),
    ),
    block(
      3,
      "訴求ポイント",
      [...s.appeals]
        .sort((a, b) => a.rank - b.rank)
        .map((a) => `<div class="item"><div class="head">${a.rank}. ${esc(a.text)}</div>${evidence(a.evidence)}</div>`)
        .join(""),
    ),
    block(
      4,
      "価格の見方",
      `<div class="head"><span class="tag">${s.price_view.position}</span><span class="tag">${s.price_view.sellability}</span></div><p>${esc(s.price_view.text)}</p>${evidence(s.price_view.evidence)}`,
    ),
    block(5, "懸念点", s.concerns.map((c) => `<div class="item"><div class="head">${esc(c.text)}</div><p>対策：${esc(c.action)}</p>${evidence(c.evidence)}</div>`).join("")),
    block(6, "販売の方向性", `<p>${esc(s.direction.text)}</p>${evidence(s.direction.evidence)}`),
    r.media
      ? block(
          7,
          "媒体と予算",
          `<table><thead><tr><th>媒体</th><th>目的</th><th>想定ターゲット</th><th class="num">配分</th></tr></thead><tbody>${r.media.media
            .map((m) => `<tr><td>${esc(nameOf(m.id, m.name))}</td><td>${esc(m.purpose)}</td><td>${esc(m.target)}</td><td class="num">${m.share}%</td></tr><tr class="sub"><td colspan="4">${esc(m.reason)}${evidence(m.evidence)}</td></tr>`)
            .join("")}</tbody></table>${
            r.media.cautions.length ? `<h3>注意点</h3>${r.media.cautions.map((c) => `<div class="item"><div class="head">${esc(c.text)}</div><p>対策：${esc(c.action)}</p>${evidence(c.evidence)}</div>`).join("")}` : ""
          }`,
        )
      : block(7, "媒体と予算", `<p class="muted">まだありません（媒体.json を保存して、もう一度 npm run paste を実行してください）</p>`),
    r.media && r.budget
      ? block(
          8,
          "予算シミュレーション",
          `<p class="accent">参考の配分を示した試算です。正式な費用・見積もりではありません。</p><table><thead><tr><th>媒体</th><th class="num">配分</th>${r.budget
            .map((b) => `<th class="num">${b.totalManYen}万円${b.isInput ? "（入力の総額）" : ""}</th>`)
            .join("")}</tr></thead><tbody>${r.media.media
            .map(
              (m) =>
                `<tr><td>${esc(nameOf(m.id, m.name))}</td><td class="num">${m.share}%</td>${r.budget!.map((b) => `<td class="num">${(b.rows.find((x) => x.id === m.id)?.amountManYen ?? 0).toFixed(1)}万円</td>`).join("")}</tr>`,
            )
            .join("")}</tbody></table>`,
        )
      : "",
  ].join("");

  const areaTab =
    TOPIC_ORDER.filter((t) => s.analysis.some((a) => a.topic === t))
      .map((topic) =>
        block(
          null,
          topic === "組み合わせ" ? "組み合わせた見立て" : topic,
          s.analysis
            .filter((a) => a.topic === topic)
            .map(
              (a) =>
                `<div class="item"><div class="head">${esc(a.fact)}<span class="tag">確からしさ ${a.confidence}</span></div><dl><dt>買い手にとっての意味</dt><dd>${esc(a.meaning)}</dd><dt>販売での使い方</dt><dd>${esc(a.use)}</dd></dl>${evidence(a.evidence)}</div>`,
            )
            .join(""),
        ),
      )
      .join("") + (s.unknown.length ? block(null, "使えなかった事実", `<ul>${s.unknown.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>`) : "");

  const issues = [
    ...(r.program ?? []).map((i) => ({ who: "プログラム", where: `${i.target} ${i.location}`, name: i.check_name, problem: i.problem, action: i.action })),
    ...(r.ai ?? []).map((i) => ({ who: "確認担当", where: `${i.target} ${i.location}`, name: `点検${i.check}`, problem: i.problem, action: "作り直し" })),
  ];
  const checkTab =
    r.program === null
      ? `<p class="muted">点検は、媒体.json を保存したあとに出ます。</p>`
      : `${r.ai === null ? `<p class="muted">確認担当の点検はまだです（確認.json を保存して、もう一度実行してください）。</p>` : ""}${
          issues.length
            ? `<table><thead><tr><th>点検した人</th><th>場所</th><th>項目</th><th>問題</th><th>扱い</th></tr></thead><tbody>${issues
                .map((i) => `<tr><td>${i.who}</td><td>${esc(i.where)}</td><td>${esc(i.name)}</td><td>${esc(i.problem)}</td><td>${esc(i.action)}</td></tr>`)
                .join("")}</tbody></table><p class="muted">「外す」の文は、この画面に出していません。作り直しはしていません。</p>`
            : `<p>見つかった問題はありません。</p>`
        }`;

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>物件${r.propertyId} 販売戦略（試し）</title>
<style>
body{margin:0;background:#f5f6f8;color:#1f2933;font:14px/1.7 system-ui,"Hiragino Sans","Yu Gothic UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:16px}
header{margin-bottom:8px}h1{font-size:18px;margin:8px 0 2px}.muted{color:#6b7480;font-size:12px}.accent{color:#b4540a;font-size:12px}
nav{display:flex;gap:4px;border-bottom:1px solid #d9dde3;margin:12px 0}
nav button{border:0;background:none;padding:8px 12px;font:inherit;color:#6b7480;cursor:pointer;border-bottom:2px solid transparent}
nav button.on{color:#1f2933;font-weight:bold;border-color:#2b6cb0}
section{background:#fff;border:1px solid #e3e6ea;border-radius:8px;padding:14px 16px;margin-bottom:12px}
h2{font-size:15px;margin:0 0 8px}h3{font-size:13px;color:#6b7480;margin:14px 0 6px}
.no{display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:#2b6cb0;color:#fff;font-size:12px;margin-right:8px}
.item{border-top:1px solid #eef0f3;padding:8px 0}.item:first-of-type{border-top:0}
.head{font-weight:bold}.tag{display:inline-block;font-size:11px;font-weight:normal;background:#eef2f7;border-radius:4px;padding:0 6px;margin-left:8px}
p{margin:4px 0}dl{margin:4px 0}dt{font-size:12px;color:#6b7480}dd{margin:0 0 4px}
.ev{list-style:none;padding:6px 8px;margin:6px 0 0;background:#f7f8fa;border-radius:4px;font-size:11.5px;color:#4a5560}.ev.none{color:#b4540a}
.ev b{color:#2b6cb0;margin-right:4px}
table{width:100%;border-collapse:collapse;font-size:12.5px}th{text-align:left;font-weight:normal;color:#6b7480;border-bottom:1px solid #d9dde3;padding:6px 4px}
td{border-bottom:1px solid #eef0f3;padding:6px 4px;vertical-align:top}.num{text-align:right;white-space:nowrap}tr.sub td{color:#4a5560;font-size:12px}
.tab{display:none}.tab.on{display:block}
</style></head><body><main>
<header><h1>物件${r.propertyId} 販売戦略（3回の形・claude.ai で試し）</h1>
<div class="muted">事実シート ${esc(r.factSheetDate)} 時点。AIが作った戦略です。距離はすべて直線距離です。</div></header>
<nav><button data-tab="strategy" class="on">販売戦略</button><button data-tab="area">エリア分析</button><button data-tab="check">点検の結果</button></nav>
<div class="tab on" id="strategy">${strategyTab}</div>
<div class="tab" id="area">${areaTab}</div>
<div class="tab" id="check">${checkTab}</div>
</main>
<script>
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("nav button, .tab").forEach((e) => e.classList.remove("on"));
  b.classList.add("on");
  document.getElementById(b.dataset.tab).classList.add("on");
}));
</script></body></html>
`;
}
