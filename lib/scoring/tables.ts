import { AGE_BANDS, MARKS } from "./constants";

// /rules の画面で編集する、採点ルール表の表の定義（設計書 D35）
// 画面（入力欄の並び）とサーバーの保存処理（値の読み取り・検証）の両方がこの定義を使う
// Excel のシートとの対応をラベルに書いておく

export type FieldType =
  | "text" //       1行の文字
  | "longtext" //   複数行の文字
  | "int"
  | "num"
  | "bool"
  | "enum" //       options から選ぶ
  | "persona_num" // ペルソナごとの数（重視度など）→ jsonb {"A":2,...}
  | "persona_mark" // ペルソナごとの適合度（◎〇－△×）→ jsonb
  | "age_num" //    年代ごとの数 → jsonb {"20代":0.4,...}
  | "num_list"; //  数の並び（年収分布など）→ jsonb [0.01, ...]

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
  /** 主キーの列（追加のときだけ入力できる） */
  pk?: boolean;
  /** 入力欄の幅（Tailwind の col-span） */
  wide?: boolean;
  hint?: string;
}

export interface TableDef {
  table: string;
  label: string;
  /** Excel のシート名 */
  sheet: string;
  note: string;
  fields: FieldDef[];
  orderBy: string;
  /** 行を追加・削除できるか */
  canAdd: boolean;
  canDelete: boolean;
}

export const SCORING_TABLES: Record<string, TableDef> = {
  personas: {
    table: "personas",
    label: "ペルソナ",
    sheet: "ペルソナ・年収分布・貯蓄分布・ペルソナの年代・買い手の多さ",
    note: "ターゲット候補。購入可能性の計算に使う代表年齢・頭金率・年収（貯蓄）の分布と、媒体の届きやすさに使う年代構成、統計上の買い手の割合。",
    orderBy: "sort_order, id",
    canAdd: true,
    canDelete: false,
    fields: [
      { name: "id", label: "ID", type: "text", pk: true, required: true, hint: "A〜H" },
      { name: "label", label: "ターゲット候補", type: "text", required: true, wide: true },
      { name: "description", label: "世帯像・重視すること", type: "longtext", wide: true },
      { name: "rep_age", label: "代表年齢", type: "int", required: true },
      { name: "down_payment_rate", label: "想定頭金率", type: "num", required: true, hint: "0.15 = 15%" },
      { name: "purchase_method", label: "購入力の測り方", type: "enum", options: ["loan", "cash"], required: true, hint: "loan=ローン／cash=現金（売却＋貯蓄）" },
      { name: "buyer_share_new", label: "新築の買い手での割合", type: "num" },
      { name: "buyer_share_used", label: "中古の買い手での割合", type: "num" },
      { name: "income_dist", label: "年収分布（10区分）", type: "num_list", wide: true, hint: "100万未満, 100〜200万, …, 2000万以上 の割合をカンマ区切り" },
      { name: "savings_dist", label: "貯蓄分布（19区分）", type: "num_list", wide: true, hint: "現金で買うペルソナだけ使う。100万未満, …, 4000万以上" },
      { name: "age_mix", label: "年代構成", type: "age_num", wide: true },
      { name: "sort_order", label: "並び順", type: "int" },
      { name: "enabled", label: "使う", type: "bool" },
    ],
  },
  scoring_rules: {
    table: "scoring_rules",
    label: "採点ルール",
    sheet: "採点ルール",
    note: "1行＝1ルール。項目の値が下限〜上限（空欄は制限なし）なら該当。点＝適合度（◎+2〜×−2）×重視度×1段階の点数。",
    orderBy: "sort_order, id",
    canAdd: true,
    canDelete: true,
    fields: [
      { name: "id", label: "ID", type: "text", pk: true, required: true, hint: "例：R60" },
      { name: "layer", label: "層", type: "enum", options: ["物件", "生活環境", "市場"], required: true },
      { name: "item_key", label: "項目キー", type: "text", required: true, hint: "項目の重視度にあるキー" },
      { name: "lower_bound", label: "下限", type: "num" },
      { name: "upper_bound", label: "上限", type: "num" },
      { name: "reason", label: "根拠の表示文（評価理由に出す）", type: "text", wide: true, required: true },
      { name: "fit", label: "適合度", type: "persona_mark", wide: true },
      { name: "basis_class", label: "点数の根拠区分", type: "enum", options: ["統計", "仮説", "BRUMBY確認", "BRUMBY実務"] },
      { name: "basis_note", label: "点数の根拠メモ", type: "longtext", wide: true },
      { name: "source", label: "出典", type: "text" },
      { name: "exclusive_group", label: "排他グループ", type: "text", hint: "空なら項目キー" },
      { name: "sort_order", label: "並び順", type: "int" },
      { name: "enabled", label: "使う", type: "bool" },
    ],
  },
  scoring_items: {
    table: "scoring_items",
    label: "項目の重視度",
    sheet: "項目の重視度",
    note: "項目ごとに、各ペルソナがどれだけ重視するか（0=関係ない／1=少し気にする／2=気にする／3=とても重視）。",
    orderBy: "sort_order, key",
    canAdd: true,
    canDelete: false,
    fields: [
      { name: "key", label: "項目キー", type: "text", pk: true, required: true },
      { name: "layer", label: "層", type: "enum", options: ["物件", "生活環境", "市場"], required: true },
      { name: "importance", label: "重視度", type: "persona_num", wide: true },
      { name: "note", label: "メモ", type: "longtext", wide: true },
      { name: "sort_order", label: "並び順", type: "int" },
    ],
  },
  scoring_params: {
    table: "scoring_params",
    label: "重み・前提・予算",
    sheet: "層の重み・購入前提・予算の決め方",
    note: "5つの層の重み（合計100%）と買い手の多さ、ローン逆算の前提、売れやすさと広告予算の決め方、媒体配分の設定。",
    orderBy: "category, sort_order, key",
    canAdd: false,
    canDelete: false,
    fields: [
      { name: "key", label: "項目キー", type: "text", pk: true, required: true },
      { name: "label", label: "項目", type: "text", required: true, wide: true },
      { name: "value", label: "値", type: "num", required: true },
      { name: "note", label: "メモ", type: "longtext", wide: true },
    ],
  },
  competitor_items: {
    table: "competitor_items",
    label: "競合重視度",
    sheet: "競合重視度",
    note: "競合と比べる項目。良い方向（1=大きいほど有利、-1=小さいほど有利）と、ペルソナごとの重視度、引き分けとみなす差。",
    orderBy: "sort_order, key",
    canAdd: false,
    canDelete: false,
    fields: [
      { name: "key", label: "項目キー", type: "text", pk: true, required: true },
      { name: "label", label: "項目", type: "text", required: true },
      { name: "direction", label: "良い方向", type: "enum", options: ["1", "-1"], required: true },
      { name: "tie_margin", label: "同等とみなす差", type: "num", required: true },
      { name: "importance", label: "重視度", type: "persona_num", wide: true },
      { name: "note", label: "メモ", type: "longtext", wide: true },
    ],
  },
  market_reference: {
    table: "market_reference",
    label: "相場・周辺の取引",
    sheet: "相場・周辺の取引",
    note: "区×築年数区分の取引の中央値（不動産情報ライブラリ）。価格の相場比と、競合がないときの比較相手に使う。",
    orderBy: "ward, age_class",
    canAdd: true,
    canDelete: true,
    fields: [
      { name: "ward", label: "区", type: "text", pk: true, required: true },
      { name: "age_class", label: "築年数の区分", type: "enum", options: ["新築", "築2〜20年", "築21年以上"], pk: true, required: true },
      { name: "price_man_yen", label: "価格（万円）", type: "num", required: true },
      { name: "building_sqm", label: "延床（㎡）", type: "num" },
      { name: "land_sqm", label: "土地（㎡）", type: "num" },
      { name: "age_years", label: "築年数", type: "num" },
      { name: "n", label: "件数", type: "int" },
    ],
  },
  area_popularity: {
    table: "area_popularity",
    label: "エリア人気",
    sheet: "エリア人気",
    note: "町ごとの人気スコア（0〜100）。売れやすさに使う。町が見つからないときは区の中央値。",
    orderBy: "ward, city_rank nulls last, town",
    canAdd: true,
    canDelete: true,
    fields: [
      { name: "ward", label: "区", type: "text", pk: true, required: true },
      { name: "town", label: "町", type: "text", pk: true, required: true },
      { name: "score", label: "人気スコア", type: "num", required: true },
      { name: "city_rank", label: "市内順位", type: "int" },
    ],
  },
  media_channels: {
    table: "media_channels",
    label: "媒体",
    sheet: "媒体",
    note: "使う統計（年代別の利用率）がある媒体は、ペルソナの年代構成で届きやすさを出す。統計がない媒体は一律の届きやすさ。",
    orderBy: "sort_order, id",
    canAdd: true,
    canDelete: false,
    fields: [
      { name: "id", label: "ID", type: "text", pk: true, required: true, hint: "英小文字（例：instagram）" },
      { name: "label", label: "媒体", type: "text", required: true },
      { name: "stat_name", label: "使う統計", type: "text", hint: "媒体の利用率の統計名" },
      { name: "flat_reach", label: "一律の届きやすさ", type: "num" },
      { name: "format_example", label: "形式の例", type: "longtext", wide: true },
      { name: "source", label: "届きやすさの出典", type: "longtext", wide: true },
      { name: "sort_order", label: "並び順", type: "int" },
      { name: "enabled", label: "使う", type: "bool" },
    ],
  },
  media_usage_rates: {
    table: "media_usage_rates",
    label: "媒体の利用率",
    sheet: "媒体の利用率",
    note: "年代別の利用率（%）。総務省「情報通信メディアの利用時間と情報行動に関する調査」。毎年6月ごろの最新版に入れ替える。",
    orderBy: "stat_name",
    canAdd: true,
    canDelete: false,
    fields: [
      { name: "stat_name", label: "統計の名前", type: "text", pk: true, required: true },
      { name: "rates", label: "利用率（%）", type: "age_num", wide: true },
      { name: "all_ages", label: "全年代", type: "num", required: true },
      { name: "metric", label: "指標", type: "text" },
    ],
  },
};

export const MARK_OPTIONS = MARKS;
export const AGE_OPTIONS = AGE_BANDS;
