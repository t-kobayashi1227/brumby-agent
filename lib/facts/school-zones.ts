// 通学区域（市の「町名・地番等 → 小学校・中学校」の一覧表）の読み取りと、物件の住所との突き合わせ
// 取り込み（scripts/ingest/jobs/d14-school-zones.ts）と事実シートの作成（段階3）で共通に使う。前の設計（legacy/lib/school-zones/parse.ts）から移した

/** 地番の範囲。ban は番（番地）の範囲、go は号の範囲（なければ番の全部） */
export interface LotRange {
  ban: [number, number];
  go?: [number, number][];
}

export interface TownCell {
  town: string;
  chome: number | null;
  /** 「（東区）」のように町の区が書かれていれば、その区。「（一部江南区）」は区をまたぐので null */
  ward: string | null;
}

/** 全角の数字・記号を半角にそろえる */
export function normalizeWidth(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[~〜]/g, "～")
    .replace(/[－‐−―ｰ]/g, "-")
    .replace(/[\s　]+/g, " ")
    .trim();
}

const KANJI_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 「七」「十二」「二十」→ 数字。99まで */
function kanjiToNumber(text: string): number | null {
  const m = /^([一二三四五六七八九])?(十)?([一二三四五六七八九])?$/.exec(text);
  if (!m || text === "") return null;
  if (!m[2]) return m[1] && !m[3] ? KANJI_DIGITS[m[1]] : null;
  return (m[1] ? KANJI_DIGITS[m[1]] : 1) * 10 + (m[3] ? KANJI_DIGITS[m[3]] : 0);
}

/** 「1～4」「5・6」「1、2」→ [1,2,3,4] など */
function expandNumbers(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(/[・、]/)) {
    const m = /^(\d+)(?:～(\d+))?$/.exec(part);
    if (!m) return [];
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (to < from || to - from > 50) return [];
    for (let n = from; n <= to; n++) out.push(n);
  }
  return out;
}

/**
 * 町名欄を、町名と丁目に分ける。「5・6丁目」「2～4丁目」は1丁目ずつに分ける
 * 番町（古町通7番町）・ノ町（下大川前通3ノ町）も丁目と同じに扱う。「五十嵐1の町」はそれで1つの町名
 */
export function parseTownCell(raw: string): TownCell[] {
  const text = normalizeWidth(raw);
  const wardNote = /（(一部)?([^（）]+?区)[^（）]*）/.exec(text);
  const ward = wardNote && !wardNote[1] ? wardNote[2] : null;
  // 読み仮名「美善（みよし）」、区の注記、「※」を外す
  const name = text.replace(/（[^（）]*）/g, "").replace(/※/g, "").replace(/\s/g, "");
  const m = /^(.+?)(\d+(?:[・、～]\d+)*)(丁目|番町|ノ町)$/.exec(name);
  if (!m) return [{ town: name, chome: null, ward }];
  const numbers = expandNumbers(m[2]);
  if (numbers.length === 0) return [{ town: name, chome: null, ward }];
  return numbers.map((chome) => ({ town: m[1], chome, ward }));
}

/**
 * 地番等を読み取る。「全部」は scope 全部。読み取れるのは住居表示の「N番」「N番～N番」「N番N号～N号」と、
 * 「N番地」「N番地～N番地」だけ。枝番や甲乙のある複雑な書き方は ranges を null にする（元の文字列は残す）
 */
export function parseLotText(raw: string): { scope: "全部" | "一部"; ranges: LotRange[] | null } {
  const text = normalizeWidth(raw).replace(/\s/g, "");
  if (text === "全部") return { scope: "全部", ranges: null };
  const ranges: LotRange[] = [];
  for (const segment of text.split("／")) {
    const banOnly = /^(\d+)番(?:地)?(?:～(\d+)番(?:地)?)?$/.exec(segment);
    if (banOnly) {
      const from = Number(banOnly[1]);
      const to = banOnly[2] ? Number(banOnly[2]) : from;
      if (to < from) return { scope: "一部", ranges: null };
      ranges.push({ ban: [from, to] });
      continue;
    }
    const withGo = /^(\d+)番(\d+号(?:～\d+号)?(?:、\d+号(?:～\d+号)?)*)$/.exec(segment);
    if (withGo) {
      const go: [number, number][] = [];
      for (const part of withGo[2].split("、")) {
        const g = /^(\d+)号(?:～(\d+)号)?$/.exec(part)!;
        const from = Number(g[1]);
        const to = g[2] ? Number(g[2]) : from;
        if (to < from) return { scope: "一部", ranges: null };
        go.push([from, to]);
      }
      const ban = Number(withGo[1]);
      ranges.push({ ban: [ban, ban], go });
      continue;
    }
    return { scope: "一部", ranges: null };
  }
  return { scope: "一部", ranges: ranges.length ? ranges : null };
}

export interface ParsedAddress {
  cityCode: string;
  ward: string | null;
  /** 市・区のあとの部分（町名から） */
  rest: string;
}

const CITIES: Record<string, string> = { 新潟市: "15100", 長岡市: "15202" };

/** 「新潟県新潟市西区青山7丁目2番5号」→ 市コード・区・残り。通学区域のデータがない市は null */
export function parseAddress(address: string): ParsedAddress | null {
  const text = normalizeWidth(address).replace(/\s/g, "").replace(/^新潟県/, "");
  for (const [city, cityCode] of Object.entries(CITIES)) {
    if (!text.startsWith(city)) continue;
    const after = text.slice(city.length);
    const ward = cityCode === "15100" ? /^(.+?区)/.exec(after)?.[1] ?? null : null;
    return { cityCode, ward, rest: ward ? after.slice(ward.length) : after };
  }
  return null;
}

export interface AddressDetail {
  chome: number | null;
  ban: number | null;
  go: number | null;
}

/**
 * 町名のあと（「7丁目2番5号」「7-2-5」「123番地4」）から丁目・番・号を取る
 * hasChome：その町に丁目の行があるか。hasChomeless：丁目のない行（大字の残りの土地など。紫竹と紫竹1～7丁目）もあるか
 * 丁目のない行もある町では、「123」「123-4」は番地と読む（丁目と読むのは「N丁目」と「N-N-N」だけ）
 */
export function parseAddressDetail(afterTown: string, hasChome: boolean, hasChomeless = false): AddressDetail {
  let text = afterTown;
  let chome: number | null = null;
  if (hasChome) {
    const named = /^(\d+|[一二三四五六七八九十]+)(?:丁目|番町|ノ町)/.exec(text);
    const dashed = (hasChomeless ? /^(\d+)-(?=\d+-\d)/ : /^(\d+)-/).exec(text);
    if (named) {
      chome = /^\d+$/.test(named[1]) ? Number(named[1]) : kanjiToNumber(named[1]);
      text = text.slice(named[0].length);
    } else if (dashed) {
      chome = Number(dashed[1]);
      text = text.slice(dashed[0].length);
    } else if (/^\d+$/.test(text) && !hasChomeless) {
      return { chome: Number(text), ban: null, go: null };
    }
  }
  const lot = /^(\d+)(?:番地?|-)?(?:(\d+)号?)?/.exec(text);
  return { chome, ban: lot ? Number(lot[1]) : null, go: lot?.[2] ? Number(lot[2]) : null };
}

/** 町名のあとに続いてよい文字（数字・漢数字・ハイフン・終わり）。「青山」が「青山新町」に当たらないようにする */
export function townMatches(rest: string, town: string): boolean {
  return rest.startsWith(town) && /^($|[\d一二三四五六七八九十-])/.test(rest.slice(town.length));
}

const URL_WARDS: Record<string, string> = {
  kita_ku: "北区",
  higashi_ku: "東区",
  chuo_ku: "中央区",
  konan_ku: "江南区",
  akiha_ku: "秋葉区",
  minami_ku: "南区",
  nishi_ku: "西区",
  nishikan_ku: "西蒲区",
};

/**
 * 市の通学区域のページの URL から区を出す（…/gakukuiki/sub02/03chuo_ku/21chuo_ku.html → 中央区）
 * 表に区の書かれていない行は、そのページの区の町として扱う。同じ町名が別の区にもある（中央区と秋葉区の「天神」など）ため
 */
export function wardFromSourceUrl(url: string): string | null {
  const m = /\/sub02\/\d*([a-z_]+?)\//.exec(url);
  return m ? (URL_WARDS[m[1]] ?? null) : null;
}

export interface ZoneRow {
  ward: string | null;
  town: string;
  chome: number | null;
  lot_scope: "全部" | "一部";
  lot_text: string;
  lot_ranges: LotRange[] | null;
  elementary_school: string;
  junior_high_school: string;
}

type Match = "yes" | "maybe" | "no";

function matchRow(row: ZoneRow, detail: AddressDetail): Match {
  if (row.chome !== null) {
    if (detail.chome === null) return "maybe";
    if (detail.chome !== row.chome) return "no";
  }
  if (row.lot_scope === "全部") return "yes";
  if (!row.lot_ranges || detail.ban === null) return "maybe";
  let result: Match = "no";
  for (const r of row.lot_ranges) {
    if (detail.ban < r.ban[0] || detail.ban > r.ban[1]) continue;
    if (!r.go) return "yes";
    if (detail.go === null) result = "maybe";
    else if (r.go.some(([a, b]) => detail.go! >= a && detail.go! <= b)) return "yes";
  }
  return result;
}

export type ZoneResult =
  | { status: "decided"; school: string; rows: ZoneRow[] }
  | { status: "ambiguous"; candidates: string[]; rows: ZoneRow[] }
  | { status: "none" };

/**
 * 住所に当たる行から、小学校・中学校を決める
 * 当たる行（yes）と、地番が読み取れない・住所に番地がないため外せない行（maybe）を候補にし、学校が1つにそろえば決まり
 * 区（ward）があるのは複数の区にある町名の行だけ。区が空か住所の区と一致する行を使い、それがなければ区を見ない
 */
export function resolveZone(rows: ZoneRow[], address: ParsedAddress): { elementary: ZoneResult; juniorHigh: ZoneResult; town: string | null; detail: AddressDetail | null } {
  const none = { elementary: { status: "none" } as ZoneResult, juniorHigh: { status: "none" } as ZoneResult, town: null, detail: null };
  const inTown = rows.filter((r) => townMatches(address.rest, r.town));
  if (inTown.length === 0) return none;
  // いちばん長く一致した町名（「五十嵐3の町西」と「五十嵐3の町」のような重なりを避ける）
  const longest = Math.max(...inTown.map((r) => r.town.length));
  let candidates = inTown.filter((r) => r.town.length === longest);
  const inWard = candidates.filter((r) => r.ward === null || r.ward === address.ward);
  if (inWard.length > 0) candidates = inWard;

  const town = candidates[0].town;
  const hasChome = candidates.some((r) => r.chome !== null);
  const hasChomeless = candidates.some((r) => r.chome === null);
  const detail = parseAddressDetail(address.rest.slice(town.length), hasChome, hasChomeless);
  // 丁目の行と丁目のない行がある町：丁目が分かれば丁目の行だけ、番地だけなら丁目のない行だけを使う
  if (hasChome && hasChomeless) {
    if (detail.chome !== null) candidates = candidates.filter((r) => r.chome !== null);
    else if (detail.ban !== null) candidates = candidates.filter((r) => r.chome === null);
  }
  const matched = candidates.filter((r) => matchRow(r, detail) !== "no");
  if (matched.length === 0) return { ...none, town, detail };

  const pick = (field: "elementary_school" | "junior_high_school"): ZoneResult => {
    const schools = [...new Set(matched.map((r) => r[field]))];
    return schools.length === 1
      ? { status: "decided", school: schools[0], rows: matched }
      : { status: "ambiguous", candidates: schools, rows: matched };
  };
  return { elementary: pick("elementary_school"), juniorHigh: pick("junior_high_school"), town, detail };
}

/**
 * 物件の位置（地図のピン）が入る町丁目から、通学区域一覧と照らし合わせる住所を作る（2026-10-25 小林さんと決定）
 * 町丁目は町の境界（D39）の名前（例：天神一丁目）。住所の書き方（「天神1」が丁目か番地か）に左右されない
 * 番地は位置から出せないので、入力の住所が同じ町・丁目を指していれば、その番・号を足す（番地で学区が分かれる町のため）
 */
export function pinAddress(pinTown: { name: string; ward: string }, input: ParsedAddress | null, rows: ZoneRow[]): ParsedAddress {
  let lot = "";
  if (input) {
    const fromInput = resolveZone(rows, input);
    const d = fromInput.detail;
    if (fromInput.town && d?.ban != null && townMatches(pinTown.name, fromInput.town)) {
      // ピンの町の丁目（無ければ null）と、入力の住所の丁目が食い違わないときだけ番地を使う
      const pinChome = parseAddressDetail(pinTown.name.slice(fromInput.town.length), true).chome;
      if (d.chome === null || pinChome === null || d.chome === pinChome) lot = `${d.ban}番${d.go != null ? `${d.go}号` : ""}`;
    }
  }
  return { cityCode: "15100", ward: pinTown.ward, rest: `${pinTown.name}${lot}` };
}
