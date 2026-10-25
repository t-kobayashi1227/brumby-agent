import { normalizeWidth, parseLotText, parseTownCell } from "../../../lib/school-zones/parse";
import { fetchText, sleep } from "../lib/http";
import { insertRows, type IngestJob } from "../lib/runner";

// 新潟市の通学区域（町名・地番等 → 小学校・中学校）
// npm run ingest -- niigata-school-zones
//
// 国土数値情報の小学校区・中学校区（XKT004・005）に新潟市が入っていないため、市のページから取る
// CSV などはなく HTML だけ。行政区の一覧（8区）→ 学校ごとのページ（約110）の順にたどる
// 学校ページは「小学校／中学校」の組み合わせ1つにつき1ページで、表は「町名」「地番等」の2列

const BASE = "https://www.city.niigata.lg.jp";
const ROOT = "/kosodate/gakko/sho_chu_school/tsugakukuiki/sub02";
const INDEX_ROOT = "/kosodate/gakko/sho_chu_school/tsugakukuiki/sub022"; // 町名別の五十音索引
const INDEX_PAGES = ["a", "k", "s", "t", "n", "h", "m"];
const WARDS: Record<string, string> = {
  "01kita_ku": "北区",
  "02higashi_ku": "東区",
  "03chuo_ku": "中央区",
  "04konan_ku": "江南区",
  "05akiha_ku": "秋葉区",
  "06minami_ku": "南区",
  "07nishi_ku": "西区",
  "08nishikan_ku": "西蒲区",
};
const WAIT_MS = 300; // 市のサーバーに負担をかけないよう、1ページごとに空ける

function decode(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[\s　]+/g, " ")
    .trim();
}

/** 表の見出し「青山小学校／関屋中学校（中央区）」「沼垂小学校（中央区・一部東区）東新潟中学校」から学校名を取る */
export function schoolsFromCaption(caption: string): { elementary: string; juniorHigh: string } | null {
  const text = decode(caption).replace(/（[^（）]*）/g, "").replace(/一覧表$/, "").replace(/\s/g, "");
  const m = /^(.+?小学校)／?(.+?中学校)$/.exec(text);
  return m ? { elementary: m[1], juniorHigh: m[2] } : null;
}

async function get(url: string): Promise<string> {
  const html = await fetchText(url);
  if (html === null) throw new Error(`ページが見つかりません：${url}`);
  await sleep(WAIT_MS);
  return html;
}

export const niigataSchoolZones: IngestJob = {
  source: "niigata_city",
  dataset: "tsugakukuiki",
  table: "school_zones",
  attribution: "出典：新潟市「小・中学校の通学区域」(https://www.city.niigata.lg.jp/kosodate/gakko/sho_chu_school/tsugakukuiki/) をもとに作成",
  options: [],

  describe() {
    return { coverage: "city:15100" };
  },

  async load({ sql, versionId, saveRaw, log, setPublishedOn }) {
    // 1. 行政区ごとの一覧から、学校ページのリンクを集める（同じ小学校が2つの中学校区に分かれると2ページある）
    // 一覧の区は学校のある区。ページのファイルは別の区のフォルダにあることがある（青山小／関屋中は中央区の一覧、西区のフォルダ）
    const wardOfPage = new Map<string, string>();
    for (const [dir, ward] of Object.entries(WARDS)) {
      const html = await get(`${BASE}${ROOT}/${dir}/index.html`);
      const links = new Set(
        [...html.matchAll(new RegExp(`href="(${ROOT}/[^"/]+/[^"/]+\\.html)"`, "g"))]
          .map((m) => m[1])
          .filter((href) => !href.endsWith("/index.html")),
      );
      for (const href of links) if (!wardOfPage.has(href)) wardOfPage.set(href, ward);
      log(`${ward}：学校ページ ${links.size}件`);
    }
    const pages = [...wardOfPage].map(([href, ward]) => ({ url: `${BASE}${href}`, ward }));
    if (pages.length < 80) throw new Error(`学校ページが${pages.length}件しかありません。市のページの作りが変わった可能性があります`);

    // 2. 町名別の索引で「秋葉1～3（秋葉区）」「秋葉1（東区）」のように区を付けて書かれる町名＝複数の区にある町名を集める
    // 学校ページの区は学校のある区で、町の区とは限らない（関屋中のページに西区の青山がある）。
    // そのため、ページの区を町の区として使うのは、区で分けないと別の町が混ざる町名だけにする
    const multiWardTowns = new Set<string>();
    for (const letter of INDEX_PAGES) {
      const text = normalizeWidth(decode(await get(`${BASE}${INDEX_ROOT}/sub022${letter}.html`)));
      for (const m of text.matchAll(/([^\s・（）]+?)[\d～・、]*（[^（）]*?区）・/g)) multiWardTowns.add(m[1]);
    }
    log(`複数の区にある町名：${multiWardTowns.size}件（${[...multiWardTowns].slice(0, 8).join("、")} など）`);
    if (multiWardTowns.size < 10) throw new Error("町名別の索引から、区の付いた町名を読み取れません。市のページの作りが変わった可能性があります");

    // 3. 学校ページを読み、表の1行（町名の丁目ごと）を1行にする
    const rows: Record<string, unknown>[] = [];
    let unparsedLots = 0;
    for (const page of pages) {
      const html = await get(page.url);
      await saveRaw(page.url.slice(page.url.indexOf(ROOT) + ROOT.length + 1).replace("/", "__"), html, "text/html");

      const updated = /最終更新日：(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(html);
      if (updated) setPublishedOn(`${updated[1]}-${updated[2].padStart(2, "0")}-${updated[3].padStart(2, "0")}`);

      const tables = html.match(/<table[\s\S]*?<\/table>/g) ?? [];
      if (tables.length !== 1) throw new Error(`表が${tables.length}個あります（1個のはず）：${page.url}`);
      const caption = /<caption>([\s\S]*?)<\/caption>/.exec(tables[0])?.[1] ?? "";
      const schools = schoolsFromCaption(caption);
      if (!schools) throw new Error(`表の見出しから学校名を読めません：「${decode(caption)}」${page.url}`);

      let count = 0;
      for (const tr of tables[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
        const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => decode(m[1]));
        if (cells.length === 0) continue; // 見出しの行
        if (cells.length !== 2 || !cells[0]) throw new Error(`2列でない行があります：${cells.join(" | ")}（${page.url}）`);
        const [townText, lotText] = cells;
        const lot = parseLotText(lotText);
        if (lot.scope === "partial" && lot.ranges === null) unparsedLots++;
        for (const t of parseTownCell(townText)) {
          rows.push({
            dataset_version_id: versionId,
            city_code: "15100",
            ward: t.ward ?? (multiWardTowns.has(t.town) ? page.ward : null),
            town: t.town,
            chome: t.chome,
            town_text: townText,
            lot_scope: lot.scope,
            lot_text: lotText,
            lot_ranges: lot.ranges === null ? null : sql.json(lot.ranges as never),
            elementary_school: schools.elementary,
            junior_high_school: schools.juniorHigh,
            source_url: page.url,
          });
          count++;
        }
      }
      if (count === 0) throw new Error(`町名の行がありません：${page.url}`);
    }

    log(`${pages.length}ページから${rows.length}行を読み取りました（地番の範囲を読み取れなかった行：${unparsedLots}）`);
    await insertRows(sql, "school_zones", rows);
  },
};
