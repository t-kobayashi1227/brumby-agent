# データベース解説資料

BRUMBY PoC の Supabase（共有のクラウドのプロジェクト）にあるテーブルと列の説明。
Supabase のダッシュボード（Table Editor）を開いたときに、「このテーブルは何か」「この列は何か」がわかるように書いている。

- 対象：`public` スキーマの20のテーブル
- テーブルの定義の元：`supabase/migrations/`（このファイルとずれたら、マイグレーションが正しい）
- データの取り込みの仕組みと注意点：[`data-notes.md`](data-notes.md)
- 取り込むたびの結果：[`data-ingest-records.md`](data-ingest-records.md)

最終更新：2026-10-06

---

## 1. はじめに：全体の見取り図

テーブルは、役割で6つのグループに分かれる。

```
① 版の管理           dataset_versions ─ ingest_logs
                          │（すべての公開データの行は「どの版か」を持つ）
② 公開データ          transactions（取引価格）   land_prices（地価）
   （先に県全域）      areas（町丁目の境界）      census_values（国勢調査）
                     district_areas ・ district_manual（取引の地区 ↔ 町丁目）
   （物件の周り）      geo_features（施設・学区・防災など）─ property_fetches（取得の記録）

③ 物件               properties（物件）─ competitors（競合物件）
                          │
④ 分析の結果          analysis_runs（分析1回分）─ facts（事実カード・判断カード）
                                              └ narratives（AIの文章）─ evaluations（評価）
                     brumby_judgments（BRUMBY様の判断。いまは使っていない）
⑤ ルール表（旧）       rules ・ target_candidates（狙う層の候補）・ appeal_items（訴求の素材）
   2026-10-12まで         └ rule_revisions（3つの表の変更の履歴）
⑥ 採点ルール表        personas（ペルソナ）・ scoring_items（項目の重視度）・ scoring_rules（採点ルール）
   （設計書D35）        scoring_params（重み・前提・予算）・ competitor_items（競合重視度）
                     market_reference（相場）・ area_popularity（エリア人気）
                     media_channels（媒体）・ media_usage_rates（利用率）・ media_results（反響の記録）
                          └ scoring_revisions（変更の履歴）
```

### テーブルの一覧

| グループ | テーブル | 何が入っているか | 件数（2026-10-04） | 誰が書き込むか |
|---|---|---|---:|---|
| ① 版の管理 | `dataset_versions` | 公開データを取り込んだときの「版」 | 25 | 取り込みのコマンド、物件の周りを取るコマンド |
| ① 版の管理 | `ingest_logs` | 取り込むたびの記録 | 15 | 取り込みのコマンド |
| ② 公開データ | `transactions` | 取引価格（不動産の売買1件ずつ） | 76,030 | 取り込みのコマンド |
| ② 公開データ | `land_prices` | 地価公示・地価調査（地点ごと・年ごとの価格） | 11,571 | 取り込みのコマンド |
| ② 公開データ | `areas` | 町丁目の境界（地図上の範囲） | 7,703 | 取り込みのコマンド |
| ② 公開データ | `census_values` | 国勢調査2020の町丁目ごとの数字 | 356,040 | 取り込みのコマンド |
| ② 公開データ | `bus_stops` | バス停留所（国土数値情報 P11。2026-10-12時点で新潟県 8,653件） | 8,653 | 取り込みのコマンド |
| ② 公開データ | `school_zones` | 市の通学区域（町名・丁目・地番 → 小学校・中学校。2026-10-12時点で新潟市 1,977行） | 1,977 | 取り込みのコマンド |
| ② 公開データ | `district_areas` | 取引価格の地区と町丁目の対応（自動） | 6,697 | 対応表を作るコマンド |
| ② 公開データ | `district_manual` | 地区と町丁目の対応を手で直したもの | 0 | 人が Studio で編集 |
| ② 公開データ | `geo_features` | 物件の周りの地物（施設・学区・防災・将来人口・用途地域） | 2,216 | 物件の周りを取るコマンド（本番では物件の登録のとき） |
| ② 公開データ | `property_fetches` | 物件ごと・APIごとの取得の記録 | 30 | 同上 |
| ③ 物件 | `properties` | 分析する物件 | 3（仕組みの確認用） | （これから）物件の登録画面 |
| ③ 物件 | `competitors` | 競合物件（物件ごとに3件まで） | 3（物件1の試しの競合） | （これから）競合の入力画面 |
| ④ 分析の結果 | `analysis_runs` | 分析の実行1回分 | 22（仮の物件で試し） | 分析のコマンド（本番では画面の「分析する」） |
| ④ 分析の結果 | `facts` | 事実カード・判断カード | 430（仮の物件で試し） | 同上 |
| ④ 分析の結果 | `narratives` | AIが書いた説明文 | 0 | （これから）分析の処理 |
| ④ 分析の結果 | `evaluations` | 評価（5段階×4観点） | 0 | （これから）評価の入力画面 |
| ④ 分析の結果 | `brumby_judgments` | BRUMBY様の判断（ターゲット・訴求・媒体）。2026-10-12に画面から外し、いまは使っていない | 0 | （なし） |
| ⑥ 採点ルール表 | `personas` | ペルソナ（A〜H）と年収・貯蓄の分布、年代構成、買い手の割合 | 6 | `npm run import-scoring` で Excel から入れ、以後は `/rules` で人が直す |
| ⑥ 採点ルール表 | `scoring_items` | 項目と、ペルソナごとの重視度（0〜3） | 19 | 同上 |
| ⑥ 採点ルール表 | `scoring_rules` | 採点ルール（1行＝1ルール） | 59 | 同上 |
| ⑥ 採点ルール表 | `scoring_params` | 層の重み・購入前提・予算の決め方・媒体配分の数値 | 32 | 同上 |
| ⑥ 採点ルール表 | `competitor_items` | 競合と比べる項目と重視度 | 8 | 同上 |
| ⑥ 採点ルール表 | `market_reference` | 区×築年数区分の取引の中央値 | 24 | 同上 |
| ⑥ 採点ルール表 | `area_popularity` | 町ごとの人気スコア | 198 | 同上 |
| ⑥ 採点ルール表 | `media_channels` | 媒体の一覧 | 11 | 同上 |
| ⑥ 採点ルール表 | `media_usage_rates` | 年代別の媒体の利用率 | 8 | 同上 |
| ⑥ 採点ルール表 | `media_results` | 反響の記録（費用・問い合わせ・見学・成約） | 0 | `/rules` の「媒体・反響」 |
| ⑥ 採点ルール表 | `scoring_revisions` | ⑥の表の変更の履歴（理由・関連物件つき） | — | 自動（トリガー）。Excel の変更履歴も取り込む |
| ⑤ ルール表（旧） | `rules` | 予算配分・狙う層を決めるルール | 20（仮のルール） | `npm run seed-rules` で最初に入れ、以後はルール表の画面（`/rules`）か Studio で人が直す |
| ⑤ ルール表 | `target_candidates` | 狙う層の候補 | 0 | ルール表の画面（`/rules`）か Studio で人が直す |
| ⑤ ルール表 | `appeal_items` | 訴求の素材 | 0 | 同上 |
| ⑤ ルール表 | `rule_revisions` | ルール・候補・訴求の変更の履歴 | 24 | 自動（`rules`・`target_candidates`・`appeal_items` を変えると記録される） |

---

## 2. 先に知っておくと読みやすいこと

### 2.1 「版」と `dataset_version_id`
公開データは、取り込むたびに「版」（`dataset_versions` の1行）を作り、データの行にはすべて **`dataset_version_id`（どの版の行か）** が付いている。

- 使うのは、`dataset_versions.status = 'active'` の版の行だけ
- 同じデータを取り込み直すと新しい版ができ、古い版は `archived` になる（不要になったら削除する）
- **集計するときは、必ず active の版に絞る**（古い版が残っていると、同じデータを二重に数えてしまう）

```sql
-- 例：使用中の取引価格だけを読む
select t.*
from transactions t
join dataset_versions v on v.id = t.dataset_version_id
where v.status = 'active';
```

### 2.2 町丁目のコード `key_code`
国勢調査の町丁目（小地域）を表すコード。`areas`・`census_values`・`district_areas`・`district_manual` で共通に使う。

| 桁数 | 意味 | 例 |
|---|---|---|
| 5桁 | 市区町村（都道府県2桁＋市区町村3桁） | `15103` ＝ 新潟市中央区 |
| 9桁 | 丁目のない町・大字（＋町のコード4桁） | `151010020` ＝ 新潟市北区 太郎代 |
| 11桁 | 丁目（＋丁目のコード2桁） | `15103212003` ＝ 新潟市中央区 上近江三丁目 |

取引価格の地区コード（`transactions.district_code`）は、桁の形が似ているが**別の体系**なので、`key_code` とは結びつけられない（名前で結びつけた対応表 `district_areas` を使う）。

### 2.3 列の型の読み方

| 型 | 意味 | 例 |
|---|---|---|
| `bigint` / `integer` / `smallint` | 整数（入る大きさが違うだけ） | `76030` |
| `numeric` | 小数も入る数 | `1.1` |
| `text` | 文字 | `新潟市中央区` |
| `boolean` | はい／いいえ | `true` |
| `date` | 日付 | `2026-03-18` |
| `timestamptz` | 日時（タイムゾーン付き） | `2026-10-03 20:26:55+09` |
| `jsonb` | 項目と値の組をまとめて入れる箱（JSON） | `{"radius_m": 1000}` |
| `bigint[]` | 整数の並び（配列） | `{4,7,13}` |
| `geometry` | 地図上の点や範囲（PostGIS）。座標は経度・緯度（世界測地系、EPSG:4326） | `POINT(139.07 37.91)` |

### 2.4 その他
- **必須**：「必須」の列は空にできない
- **`id`**：行の番号。自動で振られる（`rules` だけは `R-01` のような文字）
- **`created_at` / `updated_at`**：行を作った日時・最後に変えた日時。自動で入る
- **`raw`**：APIから受け取った元のデータそのもの。列にしていない項目も、ここを見ればわかる
- **セキュリティ**：全テーブルで RLS（行単位のアクセス制御）を有効にし、公開されるキー（anon）からは読めないようにしている。サーバーの処理と Studio からは読み書きできる
- **秘密保持**：`properties`・`competitors` に入るテスト物件は秘密保持契約の対象。画面の写しなどを外に出さない

---

## 3. ① 版の管理

### `dataset_versions`：公開データの版
**1行＝公開データを1回取り込んだときのひとまとまり。** 公開データのテーブルの行は、すべてここのどれかを指す。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 版の番号（「版4」の4） | `4` |
| `source` | text | 必須 | データの提供元 | `reinfolib`（不動産情報ライブラリ）、`estat`（e-Stat） |
| `dataset` | text | 必須 | データの種類 | `XIT001`、`XPT002`、`census2020_boundary`、`census2020_small_area` |
| `coverage` | text | 必須 | 範囲。同じ `source`＋`dataset`＋`coverage` で active は1つだけ | `pref:15`（新潟県）、`pref:15/year:2026`（地価は年ごと） |
| `period` | text | | 期間 | `2015Q1-2026Q4`、`2026`、`2020` |
| `fetched_at` | timestamptz | 必須 | 取得した日時 | |
| `source_published_at` | date | | 提供元が公表した日（わかる場合） | |
| `attribution` | text | 必須 | 画面に出す出典の文言 | `出典：国土交通省 不動産情報ライブラリ（…）` |
| `raw_uri` | text | | 生データ（APIの応答）の保存場所（Supabase Storage） | `storage://ingest-raw/reinfolib/XIT001/4/` |
| `row_count` | integer | | 読み込んだ行数 | `76030` |
| `status` | text | 必須 | 状態。`loading`（取り込み中・失敗）／`active`（使用中）／`archived`（前に使っていた） | `active` |
| `created_at` | timestamptz | 必須 | 行を作った日時 | |

使用中の版（2026-10-04）：取引価格 版4、地価 版7〜11・14〜20（2015〜2026年の12個）、町丁目の境界 版13、国勢調査 版22、物件の周りのデータ 版23〜32（XKT系のAPIごとに1つ。`coverage = pref:15`）。

### `ingest_logs`：取り込みの記録
**1行＝取り込みのコマンドを1回動かした記録。** 成功も失敗も残る。PoCの確認1（公開データは足りるか）の材料。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 記録の番号 | |
| `dataset_version_id` | bigint | | どの版の取り込みか（版を削除すると、この記録も消える） | `4` |
| `command` | text | 必須 | 実行したコマンドと引数 | `ingest reinfolib-transactions --pref 15 --from 2015Q1` |
| `status` | text | 必須 | `succeeded`（成功）／`failed`（失敗） | |
| `row_count` | integer | | 読み込んだ行数 | `76030` |
| `null_ratios` | jsonb | | 列ごとの空欄の割合（0〜1） | `{"structure": 0.625, "trade_price": 0}` |
| `near_property_counts` | jsonb | | 物件の周りで取れた件数（これから使う） | |
| `error` | text | | 失敗したときの理由 | |
| `failure_kind` | text | | 失敗の種類（失敗のときだけ）。`auth`（APIキーがない・401・403）／`rate_limit`（429）／`network`（通信の失敗・時間切れ・5xx）／`other` | `rate_limit` |
| `published_on` | date | | データの時点。鮮度（この日から実施日までの差）に使う。取引価格は取れた中で最新の四半期の最初の月、地価はその年の1月1日、国勢調査は e-Stat の公開日。`dataset_versions.source_published_at` にも入れる | `2026-01-01` |
| `started_at` | timestamptz | 必須 | 始めた日時 | |
| `finished_at` | timestamptz | 必須 | 終わった日時 | |

---

## 4. ② 公開データ

### `transactions`：取引価格（不動産情報ライブラリ XIT001）
**1行＝不動産の売買1件。** 新潟県の2015年第1四半期〜2026年第1四半期。番地はなく、「地区」までしかわからない。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 行の番号 | |
| `dataset_version_id` | bigint | 必須 | どの版か | `4` |
| `row_hash` | text | 必須 | 同じ行を二重に読み込まないための目印（元のデータから計算） | `3f2a…#1` |
| `price_category` | text | | `不動産取引価格情報`（買った人へのアンケート）／`成約価格情報`（不動産会社がレインズに登録。2021年から） | |
| `type` | text | | 取引の種類 | `宅地(土地と建物)`、`宅地(土地)`、`中古マンション等`、`農地`、`林地` |
| `municipality_code` | text | 必須 | 市区町村コード（5桁） | `15103` |
| `municipality` | text | | 市区町村名 | `新潟市中央区` |
| `district_name` | text | | 地区名（町・大字の単位） | `網川原` |
| `district_code` | text | | 地区コード（9桁）。データの更新で変わることがある。`key_code` とは別の体系 | `151030090` |
| `year` | smallint | 必須 | 取引の年 | `2024` |
| `quarter` | smallint | 必須 | 取引の四半期（1：1〜3月、2：4〜6月、3：7〜9月、4：10〜12月） | `1` |
| `trade_price` | bigint | | 取引価格の総額（円） | `44000000` |
| `unit_price` | numeric | | 1㎡あたりの価格（円）。土地の取引だけに入る | `59000` |
| `area_sqm` | numeric | | 面積（㎡）。土地・戸建では土地の面積、マンションでは専有面積。「2000㎡以上」などは空欄 | `140` |
| `total_floor_area_sqm` | numeric | | 延床面積（㎡）。建物がある取引だけ | `90` |
| `building_year` | smallint | | 建築年（西暦）。「戦前」は空欄 | `2023` |
| `floor_plan` | text | | 間取り | `３ＬＤＫ` |
| `structure` | text | | 建物の構造 | `木造`、`ＲＣ` |
| `land_shape` | text | | 土地の形 | `長方形` |
| `frontage_m` | numeric | | 間口（m） | |
| `city_planning` | text | | 都市計画（用途地域） | `第１種住居地域` |
| `coverage_ratio` | numeric | | 建蔽率（%） | `60` |
| `floor_area_ratio` | numeric | | 容積率（%） | `200` |
| `raw` | jsonb | 必須 | APIの元のデータ。坪単価、前面道路、取引の事情（`Remarks`）、改装の有無などもここにある | |

**相場に使うのは**：`type` が `宅地(土地と建物)`・`宅地(土地)` で、`raw->>'Remarks'` に「調停・競売等」「関係者間取引」「瑕疵有りの可能性」を含まない取引（設計書D11）。

### `land_prices`：地価公示・地価調査（不動産情報ライブラリ XPT002）
**1行＝1つの地点の、1年分の価格。** 地点は、国（地価公示）や県（地価調査）が毎年価格を調べている決まった土地。新潟県の2015〜2026年。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 行の番号 | |
| `dataset_version_id` | bigint | 必須 | どの版か（年ごとに版が分かれている） | `7`（2026年） |
| `survey_type` | text | 必須 | `公示`（地価公示、1月1日時点）／`調査`（地価調査、7月1日時点） | `調査` |
| `point_id` | text | 必須 | 地点のID。同じ地点なら年が変わっても同じ | `3510682` |
| `year` | smallint | 必須 | 対象の年 | `2026` |
| `price_per_sqm` | integer | | 1㎡あたりの価格（円）。休止中の地点と林地（単位が円/10a）は空欄 | `91500` |
| `change_rate` | numeric | | 前年からの変動率（%） | `1.1` |
| `use_category` | text | | 用途 | `住宅地`、`商業地`、`工業地`、`宅地見込地`、`林地` |
| `city_code` | text | | 市区町村コード（林地は県単位の `15900`） | `15103` |
| `address` | text | | 所在地（地番） | `新潟県新潟市中央区紫竹１丁目３６番４` |
| `geom` | geometry（点） | 必須 | 地点の位置 | `POINT(139.0741 37.9097)` |
| `raw` | jsonb | 必須 | APIの元のデータ。前年の価格、最寄り駅と距離、用途地域、建蔽率・容積率、休止フラグ（`pause_flag`）などもここにある | |

### `areas`：町丁目の境界（e-Stat 国勢調査2020 小地域）
**1行＝1つの町丁目の、地図上の範囲。** 新潟県の7,703区域。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 行の番号 | |
| `dataset_version_id` | bigint | 必須 | どの版か | `13` |
| `key_code` | text | 必須 | 町丁目のコード（2.2） | `15103212003` |
| `pref_code` | text | 必須 | 都道府県コード | `15` |
| `city_code` | text | 必須 | 市区町村コード | `15103` |
| `city_name` | text | 必須 | 市区町村名 | `新潟市中央区` |
| `name` | text | | 町丁目の名前 | `上近江三丁目` |
| `hcode` | smallint | | 区域の種類。`8101`：町丁目、`8154`：水面 | `8101` |
| `geom` | geometry（多角形） | 必須 | 範囲の形。飛び地はまとめて1つにしている | |

### `bus_stops`：バス停留所（国土数値情報 P11）
**1行＝1つのバス停留所。** 新潟県の8,653件（版38、令和4年度）。ファイル（GeoJSON）を手でダウンロードして取り込む。距離で探すための索引（geography）がある。分析の「最寄りのバス停」（`facility.bus_stop_nearest`）で使う。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 行の番号 | |
| `dataset_version_id` | bigint | 必須 | どの版か | `38` |
| `source_feature_id` | text | 必須 | ファイルの中の順番（ファイルに地物IDがないため） | `1` |
| `name` | text | 必須 | バス停名（`P11_001`） | `上近江二丁目` |
| `operator_name` | text | | バス事業者名（`P11_002`） | `新潟交通（株）` |
| `routes` | jsonb | 必須 | 系統（`P11_003_01〜35`）と区分（`P11_004_01〜35`）を同じ番号で組にした配列。**1つの要素に複数の系統がカンマ区切りで入ることがある**。区分：`1` 民間路線バス、`2` 公営路線バス、`3` コミュニティバス | `[{"name":"…","category_code":"1"}]` |
| `note` | text | | 備考（`P11_005`）。新潟県は全件空 | |
| `geom` | geometry（点） | 必須 | 位置（EPSG:4326） | |
| `raw` | jsonb | 必須 | 元の属性そのまま | |
| `created_at` | timestamptz | 必須 | 入れた日時 | |

### `school_zones`：市の通学区域（2026-10-12）
**1行＝市の一覧表の1行を、丁目ごとに分けたもの。** 国土数値情報の小学校区・中学校区（XKT004・005）に入っていない新潟市を補う。新潟市の1,977行（版49）。市のページ（HTML、学校ごとに1ページ）を `npm run ingest -- niigata-school-zones` で読む。分析の「小学校区・中学校区」（`facility.elementary_district`・`junior_high_district`）で、住所の町名・丁目・番地から引く。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 行の番号 | |
| `dataset_version_id` | bigint | 必須 | どの版か | `49` |
| `city_code` | text | 必須 | 市のコード | `15100`（新潟市） |
| `ward` | text | | 町のある区。**同じ町名が複数の区にあるとき（大潟は西区と西蒲区）だけ**入れ、ほかは空。町名欄の「（東区）」の注記、なければ学校ページの区 | `西蒲区` |
| `town` | text | 必須 | 町名（丁目・番町・ノ町を除いたもの） | `青山`、`古町通`、`五十嵐1の町` |
| `chome` | integer | | 丁目（番町・ノ町も）。丁目のない町は空。「5・6丁目」は1丁目ずつ1行 | `7` |
| `town_text` | text | 必須 | 元の町名欄 | `青山5・6丁目`、`紫竹2丁目（東区）` |
| `lot_scope` | text | 必須 | 地番等が全部（`all`）か一部（`partial`）か | `partial` |
| `lot_text` | text | 必須 | 元の地番等 | `1番／2番1号～8号` |
| `lot_ranges` | jsonb | | 読み取れた地番の範囲。全部のときと、枝番・甲乙などで読み取れないときは空 | `[{"ban":[1,1]},{"ban":[2,2],"go":[[1,8]]}]` |
| `elementary_school` | text | 必須 | 小学校 | `青山小学校` |
| `junior_high_school` | text | 必須 | 中学校 | `関屋中学校` |
| `source_url` | text | 必須 | 取ってきた学校ページ | |
| `created_at` | timestamptz | 必須 | 入れた日時 | |

**引き方**（`lib/school-zones/parse.ts`）：住所を「市・区・残り」に分け、残りの先頭に一致するいちばん長い町名の行を集める → 区が空か住所の区と一致する行に絞る → 丁目・番・号で当たる行を残す。学校が1つにそろえば決まり、そろわなければ候補を出す。丁目の行と丁目のない行がある町（紫竹と紫竹1〜7丁目）は、丁目が分かれば丁目の行だけ、番地だけなら丁目のない行だけを使う。

### `census_values`：国勢調査2020の町丁目ごとの数字
**1行＝1つの地域の、1つの項目の値**（縦持ち）。地域は市区町村（5桁）・丁目のない町（9桁）・丁目（11桁）の7,740。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `dataset_version_id` | bigint | 必須 | どの版か | `22` |
| `key_code` | text | 必須 | 地域のコード（2.2）。5桁は市区町村の値（市の平均と比べるときに使う） | `15103212003` |
| `stat_key` | text | 必須 | 項目の名前（下の表） | `pop_total` |
| `value` | numeric | | 値（人・世帯）。秘匿や該当なしは空欄 | `1970` |

**項目（`stat_key`）の一覧**

| 項目 | 意味 |
|---|---|
| `pop_total` / `pop_male` / `pop_female` | 人口の総数／男／女 |
| `households` | 世帯の総数 |
| `age_total` | 年齢別の表の総数（年齢「不詳」を含む） |
| `age_00_04` 〜 `age_70_74` | 5歳ごとの人口（0〜4歳 … 70〜74歳） |
| `age_under15` / `age_15_64` / `age_65plus` / `age_75plus` | 15歳未満／15〜64歳／65歳以上／75歳以上 |
| `hh_general` | 一般世帯の総数（家族の類型の分母） |
| `hh_kin` / `hh_nuclear` / `hh_non_nuclear` | 親族世帯／核家族世帯／核家族以外の世帯 |
| `hh_couple_only` / `hh_couple_children` | 夫婦のみの世帯／夫婦と子供から成る世帯 |
| `hh_with_under6` / `hh_with_under18` / `hh_with_65plus` | 6歳未満／18歳未満／65歳以上の人がいる世帯 |
| `tenure_total` | 住宅に住む一般世帯（持ち家・借家の分母） |
| `tenure_owned` / `tenure_private_rented` | 持ち家／民営借家（公営借家などは表にない） |
| `dwelling_total` | 主世帯の総数（建て方の分母） |
| `dwelling_detached` / `dwelling_row` / `dwelling_apartment` | 一戸建／長屋建／共同住宅 |
| `dwelling_apt_1_2f` / `dwelling_apt_3_5f` / `dwelling_apt_6_10f` / `dwelling_apt_11f_plus` | 共同住宅の階数別（1・2階建 … 11階建以上） |
| `dwelling_other` | その他の建て方 |
| `secrecy` | 秘匿・合算の印（1：無し、2：合算、3：秘匿）。新潟県はすべて1 |

```sql
-- 例：上近江三丁目の「夫婦と子供の世帯」の割合
select round(100.0 * max(value) filter (where stat_key = 'hh_couple_children')
                   / max(value) filter (where stat_key = 'hh_general'), 1) as pct
from census_values
where dataset_version_id = 22 and key_code = '15103212003';   -- → 31.2
```

### `district_areas`：取引価格の地区 ↔ 町丁目の対応（自動）
**1行＝取引価格の1つの地区が、1つの町丁目に対応すること。** 取引価格には地区名しかないので、町丁目単位で相場を出すためにこの表を使う。1つの地区に複数の町丁目が対応することがある（例：中央区「上近江」→「上近江一丁目」〜「上近江四丁目」の4行）。`npm run build:district-areas` で作り直す。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `transactions_version_id` | bigint | 必須 | 取引価格のどの版で作った対応か | `4` |
| `areas_version_id` | bigint | 必須 | 町丁目の境界のどの版で作った対応か | `13` |
| `municipality_code` | text | 必須 | 市区町村コード | `15103` |
| `district_name` | text | 必須 | 取引価格の地区名 | `上近江` |
| `key_code` | text | 必須 | 対応する町丁目のコード | `15103212003`（上近江三丁目） |
| `match` | text | 必須 | 結びつけ方。`exact`：名前をならして一致／`prefix`：町丁目の名前が地区名で始まる／`manual`：`district_manual` から | `exact` |

宅地の取引の94.3%が `exact`、3.9%が `prefix` で結びつき、1.8%は結びつかない（2026-10-04）。

### `district_manual`：地区 ↔ 町丁目の対応を手で直したもの
**1行＝人が決めた、地区と町丁目の対応1つ。** 自動では結びつかない地区などを直す。版に関係なく残り、`district_areas` を作るたびに当てはめられる。**Supabase Studio で直接編集してよい。**

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `municipality_code` | text | 必須 | 市区町村コード | |
| `district_name` | text | 必須 | 取引価格の地区名（そのまま） | |
| `key_code` | text | 必須 | 結びつける町丁目のコード | |
| `note` | text | | 理由 | `2020年の国勢調査では「○○」に含まれる` |
| `updated_at` | timestamptz | 必須 | 最後に変えた日時 | |

### `geo_features`：物件の周りの地物（施設・学区・防災・将来人口・用途地域）
**1行＝地図上の地物1つ**（学校1校、浸水想定の区域1つ、250mメッシュ1つ など）。物件が登録されたときに、その周りのデータを不動産情報ライブラリ（XKT系）から取り、物件の近くにある地物だけを保存する。`npm run fetch-surroundings -- --property <物件の番号>`（本番では物件の登録のとき）。APIごとに版を1つ持ち、物件が増えるたびに地物が足されていく。同じ地物は二重に保存されない。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 行の番号 | |
| `dataset_version_id` | bigint | 必須 | どの版か（APIごとに1つ） | `31`（XKT026） |
| `api_id` | text | 必須 | どのAPIの地物か（下の表） | `XKT006` |
| `feature_id` | text | 必須 | APIが付けた地物のID（`_id`）。二重に保存しないための目印 | `U06SmpABk4JyLPT25jIi` |
| `geom` | geometry（点・線・多角形） | 必須 | 地物の位置・形 | |
| `properties` | jsonb | 必須 | APIの属性そのまま（下の表の主な項目） | |
| `fetched_at` | timestamptz | 必須 | 取得した日時 | |

**API（`api_id`）と、保存する範囲・主な属性**

| api_id | 中身 | 保存する範囲 | `properties` の主な項目 |
|---|---|---|---|
| `XKT006` | 学校 | 物件から半径3km | `P29_004_ja`（名称）、`P29_003_name_ja`（小学校・中学校 など） |
| `XKT007` | 保育園・幼稚園等 | 半径3km | `preSchoolName_ja`（名称）、`schoolClassCode_name_ja`（分類） |
| `OSM_SUPERMARKET` | スーパーマーケット（OpenStreetMap。`feature_id` は `<物件の番号>:node/123` の形で、物件ごとに入れ替える） | 半径3km | `name`（名称）、`brand`、`shop`（`supermarket`）などOSMのタグそのまま |
| `XKT015` | 駅（乗降客数） | 半径3km | `S12_001_ja`（駅名）、`S12_003_ja`（路線名）、乗降客数（年ごと） |
| `XKT013` | 将来推計人口（250mメッシュ） | 半径3km | `PTN_2020`（2020年の総人口）、`PT00_2025`〜`PT00_2070`（総人口の推計）、`PT01_`〜`PT20_`（5歳ごと。2025年から） |
| `XKT004` / `XKT005` | 小学校区／中学校区 | 物件を含む区域だけ | `A27_004_ja` / `A32_004_ja`（学校名）。**新潟市・長岡市はデータがない** |
| `XKT002` | 用途地域 | 物件から300m | `use_area_ja`（用途地域名）、建蔽率・容積率 |
| `XKT025` | 液状化の発生傾向 | 300m | `note`（例：液状化しやすい）、`liquefaction_tendency_level`（6段階） |
| `XKT026` | 洪水浸水想定区域（想定最大規模） | 300m | `A31a_202`（河川名）、`A31a_205`（浸水深ランク） |
| `XKT029` | 土砂災害警戒区域 | 300m | `A33_001`（現象の種類）、`A33_002`（区域区分） |

```sql
-- 例：物件1の地点が、洪水の浸水想定区域に入っているか（入っていれば河川名と浸水深ランク）
select g.properties->>'A31a_202' as river, g.properties->>'A31a_205' as rank
from properties p
join geo_features g on g.api_id = 'XKT026' and extensions.st_intersects(g.geom, p.geom)
where p.id = 1;
```

### `property_fetches`：物件ごとの、周りのデータの取得の記録
**1行＝ある物件について、ある1つのAPIのデータを取った記録。** 取り直すと上書きされる。PoCの確認1（公開データは足りるか）の材料。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `property_id` | bigint | 必須 | どの物件か | `1` |
| `api_id` | text | 必須 | どのAPIか | `XKT026` |
| `dataset_version_id` | bigint | | 保存した版 | `31` |
| `mode` | text | 必須 | `radius`（半径の中を数える）／`point`（物件の地点で判定する） | `point` |
| `keep_m` | integer | 必須 | 物件から何m以内の地物を保存したか（0＝物件を含むものだけ） | `300` |
| `zoom` | smallint | 必須 | 取得したタイルのズーム | `15` |
| `tiles` | integer | 必須 | 取得したタイルの枚数 | `1` |
| `features_in_tiles` | integer | 必須 | タイルに入っていた地物の数 | `681` |
| `features_kept` | integer | 必須 | 保存した（物件の近くにあった）地物の数 | `182` |
| `status` | text | 必須 | `ok`（近くに地物がある）／`empty`（近くに地物がない）／`failed`（取得に失敗） | `ok` |
| `error` | text | | 失敗したときの理由 | |
| `fetched_at` | timestamptz | 必須 | 取得した日時 | |

**`empty` の読み方**：`features_in_tiles` も0なら「その地域にデータがない」（例：新潟市の学区。新潟市は分析で `school_zones` から補う）。`features_in_tiles` が1以上なら「データはあるが、物件の近くにはない」（例：浸水想定区域の外）。

---

## 5. ③ 物件（これから使う）

### `properties`：物件
**1行＝分析する物件1件。** 物件の登録画面（`/properties/new`）から入る予定。テスト物件は秘密保持契約の対象。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 物件の番号 | |
| `name` | text | 必須 | 物件名 | `中央区上近江 新築戸建` |
| `property_type` | text | 必須 | 種別 | `新築戸建`、`中古戸建`、`土地` |
| `price_man_yen` | integer | | 価格（万円） | `3780` |
| `address` | text | 必須 | 住所 | `新潟市中央区上近江1丁目` |
| `geom` | geometry（点） | | 位置（住所から緯度経度を取って入れる） | |
| `geocode_source` | text | | 住所から緯度経度を取ったサービス | |
| `geocoded_at` | timestamptz | | 緯度経度を取った日時 | |
| `area_class` | text | | エリアの区分。`center`（中心部）／`suburb`（郊外）／`outer`（周辺の市町村）。集計の半径の初期値に使う | `center` |
| `layout` | text | | 間取り | `4LDK` |
| `land_sqm` | numeric | | 土地の面積（㎡） | `180.25` |
| `building_sqm` | numeric | | 建物の面積（㎡） | `105.98` |
| `parking` | smallint | | 駐車場の台数 | `2` |
| `access` | text | | 交通 | `最寄り駅 徒歩12分` |
| `features` | text | | 特徴 | `ZEH仕様` |
| `total_budget_man_yen` | integer | | 広告の総予算（万円）。利用者が入力する。空なら `total_budget` ルールの提案値を使う（設計書D15） | `30` |
| `sales_deadline` | date | | 販売期限 | `2027-03-31` |
| `sales_goal` | text | | 販促目的 | `見学予約を増やしたい` |
| `age_years` | smallint | | 築年数（新築=0）。空で種別が新築なら0とみなす（採点ルール表。設計書D35） | `0` |
| `rooms` | smallint | | 居室数。空なら `layout`（4LDK → 4）から読む | `4` |
| `is_hiraya` | boolean | | 平屋か。空なら「データなし」 | `false` |
| `has_garden` | boolean | | 庭があるか | `true` |
| `ward` | text | | 区（相場・エリア人気に使う）。空なら住所から読む | `中央区` |
| `town` | text | | 町（エリア人気に使う）。空なら住所から読む | `上近江` |
| `manual_metrics` | jsonb | 必須 | 手入力の値。自動で取れない距離・地域の値や、自動の値の上書き。キーは採点ルール表の項目キー | `{"バス停_m":250,"スーパー_m":480}` |
| `created_at` / `updated_at` | timestamptz | 必須 | 作った日時・最後に変えた日時 | |

### `property_photos`：物件の写真（2026-10-12）
**1行＝物件1件の写真1枚。** 物件の登録・変更の画面で登録する。なければ画面は共通の仮画像（`public/house.jpg`）を出す。Supabase Storage ではなく DB に置く（画面に Storage の強いキーを置かずに済むため）。写真はブラウザで長辺1600px・JPEG に縮めてから送る（2.5MBまで）。画面からは `/properties/<id>/photo?v=<更新日時>` で読む。物件を削除すると消える。

| 列 | 型 | 必須 | 説明 |
|---|---|---|---|
| `property_id` | bigint | 必須 | どの物件の写真か（`properties.id`） |
| `content` | bytea | 必須 | 画像のデータ |
| `content_type` | text | 必須 | `image/jpeg`／`image/png`／`image/webp` |
| `width` / `height` | integer | | 縮めた後の大きさ（px） |
| `size_bytes` | integer | 必須 | データの大きさ |
| `updated_at` | timestamptz | 必須 | 登録・差し替えの日時（URL の版に使う） |

### `competitors`：競合物件
**1行＝ある物件の競合物件1件**（手入力、物件ごとに3件まで）。物件を削除すると、競合物件も消える。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 行の番号 | |
| `property_id` | bigint | 必須 | どの物件の競合か（`properties.id`） | |
| `position` | smallint | 必須 | 何件目か（1〜3） | `1` |
| `price_man_yen` | integer | | 価格（万円） | `3580` |
| `location` | text | | 所在地 | `新潟市中央区○○町` |
| `land_sqm` / `building_sqm` | numeric | | 土地・建物の面積（㎡） | `135` / `102` |
| `layout` | text | | 間取り | `4LDK` |
| `walk_min` | smallint | | 駅からの徒歩（分）。採点では「×80÷1.3」で直線距離（m）にそろえて比べる | `12` |
| `age_years` | smallint | | 築年数（新築=0）。採点ルール表の競合比較に使う | `0` |
| `parking` | smallint | | 駐車場の台数 | `2` |
| `features` | text | | 特徴 | `南向き・太陽光発電付き` |
| `source_type` | text | | どこで見たか。`seen`（見かけた）／`portal`（ポータル）／`other`（設計書D30） | `portal` |
| `source_site` | text | | 参照サイト名 | `SUUMO` |
| `confirmed_on` | date | | 確認日 | `2026-10-06` |
| `entered_by` | text | | 入力者 | |
| `created_at` / `updated_at` | timestamptz | 必須 | 作った日時・最後に変えた日時 | |

---

## 6. ④ 分析の結果（これから使う）

分析を1回実行すると、`analysis_runs` に1行でき、その結果が `facts`・`narratives` に入る。条件を変えて再実行すると新しい実行として残り、前の結果と比べられる。

### `analysis_runs`：分析の実行1回分

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 実行の番号 | |
| `property_id` | bigint | 必須 | どの物件の分析か | |
| `params` | jsonb | 必須 | 分析の条件。`min_top_score`・`tie_margin` は狙う層の絞り込みの基準 | `{"radius_m":1000,"price_min_n":10,"price_years":3,"min_top_score":2,"tie_margin":0}` |
| `dataset_version_ids` | bigint[] | 必須 | 使った公開データの版 | `{4,7,13,22}` |
| `rules_version` | bigint | | 使ったルールの版（その時点の `rule_revisions.id` の最大）。旧ルール表 | |
| `scoring_version` | bigint | | 使った採点ルール表の版（その時点の `scoring_revisions.id` の最大。設計書D35） | |
| `status` | text | 必須 | `running`（実行中）／`succeeded`（成功）／`failed`（失敗）。`running` は1物件につき1つまで（索引 `analysis_runs_one_running`。ボタンの連打で二重に動かさない） | |
| `stage` | text | | 次に進める段階。`analyze`（集計）→ `rules`（ルール）→ `ai`（AI）→ `verify`（検証）。段階ごとに別の呼び出しで進める（設計書D34） | |
| `stage_started_at` | timestamptz | | いまの段階を進めている印（空なら誰も進めていない）。10分たっても空にならなければ、止まったものとして取り直せる | |
| `error` | text | | 失敗したときの理由 | |
| `created_at` / `finished_at` | timestamptz | | 始めた日時・終わった日時 | |

### `facts`：事実カード・判断カード
**1行＝カード1枚。** 集計した数字（事実カード）と、ルールで決めた結果（判断カード）。AIとレポートは、ここにある数字だけを使う（設計書D8）。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 行の番号 | |
| `run_id` | bigint | 必須 | どの実行のカードか | |
| `seq` | integer | 必須 | 画面に出すカードの番号（`F-07` の7） | `7` |
| `key` | text | 必須 | カードの種類 | `target.family_with_children_ratio` |
| `kind` | text | 必須 | `fact`（事実カード）／`decision`（判断カード） | `fact` |
| `value` | numeric | | 数字の値 | `0.312` |
| `value_text` | text | | 数字でない値（学区名など） | `上近江小学校区` |
| `unit` | text | | 単位 | `ratio`、`円/㎡`、`m` |
| `comparison` | numeric | | 比べる値（市の平均など） | `0.241` |
| `scope` | jsonb | | 集計した範囲 | `{"type":"radius","meters":1000}` |
| `basis` | jsonb | | 根拠（件数・期間など） | `{"n":24,"period":"2023Q2-2026Q1"}` |
| `status` | text | 必須 | `ok`／`insufficient`（データが足りない）／`not_available`（データがない） | `ok` |
| `dataset_version_ids` | bigint[] | 必須 | 使った公開データの版 | `{22}` |
| `attribution` | text | | 出典の文言 | |

**カードの種類（`key`）の一覧**（作った部品から順に足していく）

| key | 部品 | `value` | `value_text` の例 | `basis` の中身 |
|---|---|---|---|---|
| `hazard.flood` | ⑤ 防災 | 浸水深ランク（0＝区域の外、1〜6） | `浸水深 0.5〜3.0m未満（床上から1階が浸水）` | 規模（想定最大規模）、河川ごとのランク、取得日時 |
| `hazard.landslide` | ⑤ 防災 | 1＝区域の中、0＝区域の外 | `土砂災害警戒区域の外` | 区域の一覧（現象・区域区分・名前）、取得日時 |
| `hazard.liquefaction` | ⑤ 防災 | 液状化の傾向（1＝最も液状化しやすい〜6） | `液状化しやすい` | 微地形（例：三角州・海岸低地）、取得日時 |
| `facility.elementary_nearest` | ④ 周辺施設 | 最寄りの小学校までの直線距離（m） | `新潟市立上山小学校（直線409m、徒歩約7分）` | 学校名、住所、直線・徒歩の距離と分数 |
| `facility.junior_high_nearest` | ④ 周辺施設 | 最寄りの中学校までの直線距離（m） | `新潟市立鳥屋野中学校（直線465m、徒歩約8分）` | 同上 |
| `facility.elementary_district` | ④ 周辺施設 | — | `裏館小学校`（データがない地域は `not_available`）。新潟市は `school_zones` から住所で引き、番地で分かれて決められないときは `insufficient` で `関屋中学校または小針中学校（番地で異なる）` の形 | 学校名、住所。新潟市は町名 `town`・丁目 `chome`・地番等 `lots`、決められないときは候補 `candidates` |
| `facility.junior_high_district` | ④ 周辺施設 | — | `第三中学校` | 同上 |
| `facility.nursery_nearest` | ④ 周辺施設 | 最寄りの保育園・幼稚園等までの直線距離（m） | `宝塔院幼稚園（直線322m、徒歩約6分）` | 名称、種類、直線・徒歩の距離と分数 |
| `facility.nursery_count` | ④ 周辺施設 | 半径（初期値1km）の中の保育園・幼稚園等の数 | `半径1000m以内に15か所` | 種類ごとの内訳 |
| `facility.medical_nearest` | ④ 周辺施設 | 最寄りの内科のある病院・診療所までの直線距離（m）。採点ルール表の「病院_m」 | `きくち内科医院（内科のある診療所、直線450m、徒歩約8分）` | 名前・種類・診療科目・住所、最寄りの病院（20床以上）`nearest_hospital`、近い順10件 `nearby`。出典は XKT010（国土数値情報「医療機関（令和2年度）」） |
| `facility.supermarket_nearest` | ④ 周辺施設 | 最寄りのスーパーまでの直線距離（m）。採点ルール表の「スーパー_m」 | `ウオロク（直線445m、徒歩約8分）` | 名前、直線・徒歩の距離と分数、近い順10件 `nearby`。出典は OpenStreetMap（`OSM_SUPERMARKET`） |
| `facility.bus_stop_nearest` | ④ 周辺施設 | 最寄りのバス停までの直線距離（m）。採点ルール表の「バス停_m」。5km以内になければ「データ不足」 | `上近江二丁目（新潟交通（株）、直線217m、徒歩約4分）` | 名前・事業者 `operator`・系統 `routes`（カンマで分けたもの）と数 `route_count`、近い順10件 `nearby`。出典は `bus_stops`（国土数値情報 P11） |
| `facility.nursery_count_800m` | ④ 周辺施設 | 半径800mの中の保育園・幼稚園等の数（採点ルール表の「保育園_800m内」） | `半径800m以内に9か所` | 種類ごとの内訳 |
| `facility.station_nearest` | ④ 周辺施設 | 最寄りの駅までの直線距離（m） | `白山駅（越後線）直線1539m、徒歩約26分` | 駅名、路線、乗降客数（人/日）とその年 |
| `area.zoning` | ④ 周辺施設 | — | `第１種住居地域`／`用途地域の指定がない区域` | 建蔽率・容積率（ある場合） |
| `target.population` | ① 人口構成 | 半径の中の人口（人） | `半径1000mの人口 約21,226人、世帯 約9,426` | 世帯数、重なった町丁目の数、計算方法 |
| `target.age_20_39_ratio` | ① 人口構成 | 20〜39歳の人の割合（共働き夫婦の代わり、設計書D21） | `20〜39歳の人 22.4%（新潟市中央区 21.0%）` | 同下 |
| `target.age_65plus_ratio` | ① 人口構成 | 65歳以上の人の割合 | `65歳以上の人 28.1%（新潟市中央区 27.5%）` | 同下 |
| `target.age_30_49_ratio` | ① 人口構成 | 狙う層の年齢の人の割合（`comparison` は市区町村の値）。年齢は条件 `target_age` で変わる | `30〜49歳の人 30.1%（新潟市中央区 26.0%）` | 分子・分母（人数）、比べた市区町村、計算方法 |
| `target.households_with_under18_ratio` | ① 人口構成 | 18歳未満のいる世帯の割合 | `18歳未満のいる世帯 23.5%（新潟市中央区 16.0%）` | 同上（世帯数） |
| `target.couple_children_ratio` | ① 人口構成 | 夫婦と子供から成る世帯の割合 | `夫婦と子供から成る世帯 28.0%（新潟市中央区 20.0%）` | 同上 |
| `target.private_rented_ratio` | ① 人口構成 | 民営借家に住む世帯の割合 | `民営借家に住む世帯 41.5%（新潟市中央区 41.5%）` | 同上 |
| `target.detached_ratio` | ① 人口構成 | 一戸建に住む世帯の割合 | `一戸建に住む世帯 43.9%（新潟市中央区 40.6%）` | 同上 |
| `future.population_change` | ② 将来人口 | 半径の中の総人口の増減の割合（2025年→2035年） | `総人口 2025年 約21,435人 → 2035年 約21,338人（-0.4%）` | 2025年・2035年の人数、メッシュの数、計算方法 |
| `future.age_30_49_change` | ② 将来人口 | 狙う層の年齢の人の増減の割合。年齢は条件 `target_age` で変わる | `30〜49歳 2025年 約5,973人 → 2035年 約4,671人（-21.8%）` | 同上 |
| `future.children_change` | ② 将来人口 | 0〜14歳の増減の割合 | `0〜14歳 2025年 約2,589人 → 2035年 約1,972人（-23.8%）` | 同上 |
| `market.price_median` | ③ 相場 | 取引価格の中央値（万円）。`comparison` は物件の価格 | `取引価格の中央値 2,450万円（物件のある地区、2023Q2-2026Q1、10件、四分位 1,225〜3,675万円）` | 件数、期間、取引の種類、四分位、範囲を広げた経過、地区名 |
| `market.price_gap` | ③ 相場 | 物件の価格と中央値の差の割合（物件÷中央値−1） | `物件の価格 3,780万円は、取引価格の中央値より54.3%高い` | 物件の価格、中央値、件数、期間 |
| `market.unit_price_median` | ③ 相場（土地だけ） | 土地の1㎡あたりの取引価格の中央値（円/㎡）。`comparison` は物件の1㎡あたりの価格 | `土地の1㎡あたりの取引価格の中央値 39,000円/㎡（隣の地区まで、11件）` | 件数、期間 |
| `market.recent_build_price_median` | ③ 相場（新築戸建だけ） | 築5年以内の取引に絞った中央値（万円） | `築5年以内（2021年以降の建築）の取引価格の中央値 4,550万円（隣の地区まで、12件）` | 件数、期間、建築年の下限、四分位、範囲を広げた経過 |
| `land.trend_5y` | ③ 相場 | 近くの住宅地の地価の5年間の変化率（同じ地点どうしの平均）。`comparison` は市区町村の値 | `近くの住宅地5地点の地価 2021年→2026年 +20.7%（新潟市中央区 +10.1%）` | 地点ごとの住所・距離・価格、比べた市区町村と地点数 |
| `land.nearest_residential_price` | ③ 相場 | 最寄りの住宅地の地価（円/㎡） | `最寄りの住宅地の地価 126,000円/㎡（…、直線446m、2026年の地価公示）` | 地点、距離、年 |
| `competitor.price_gap` | ⑥ 競合物件 | 物件の価格と競合の平均価格の差の割合。`comparison` は競合の平均（万円） | `物件の価格 3,780万円は、競合3件の平均 3,880万円より2.6%低い` | 物件の価格、競合1件ずつとの差 |
| `competitor.unit_price_gap` | ⑥ 競合物件 | 面積あたりの価格の差の割合（戸建は建物、土地は土地の面積） | `建物1㎡あたりの価格 356,671円は、競合3件の平均 368,019円より3.1%低い` | 物件と競合1件ずつの1㎡あたりの価格 |
| `competitor.land_area_gap` | ⑥ 競合物件 | 土地の面積の差の割合 | `土地 180.25㎡は、競合3件の平均 157.7㎡より14.3%広い` | 物件と競合1件ずつの土地の面積 |
| `competitor.features` | ⑥ 競合物件 | 競合物件の数 | `競合3件の特徴：1件目 4LDK・駅徒歩12分・駐車場2台・南向き・太陽光発電付き ／ …` | 物件と競合の間取り・徒歩・駐車場・特徴 |
| `decision.persona_scores` | 採点ルール表（判断カード、2026-10-12から） | 1位の総合点 | `1位 小中学生のいる家族 総合83.1点（物件96点・購入可能性67点・…）／ …` | `personas`（全ペルソナの総合点・5層の点数・該当ルール・素点/満点・データなしの項目・購入可能性の計算・ターゲット像）、`inputs`（採点に使った値と出どころ）、`competitors`（項目ごとの勝ち負け）、`missing_inputs` |
| `decision.salability` | 採点ルール表（判断カード） | 売れやすさ（0〜100） | `売れやすさ 58点（標準）` | エリア人気・価格の相場比・第1ターゲットの適合度の点、区分 |
| `decision.target_rank` | ルール（判断カード） | 1位の点数。採点ルール表（2026-10-12から）では第1ターゲットの総合点（100点満点）で、`basis.method` が `scoring`、`ranking` に層ごとの点数とターゲット像が入る。1位の点が `min_top_score` 未満なら `insufficient`（絞り込めない） | `1位 30〜40代の子育てファミリー（3/4点） ／ 2位 …` | `ranking`（順位・候補・点・満点 `max`・効いたルール・`confidence`・`available`）、`tied`、`unresolved` |
| `decision.appeals` | ルール（判断カード） | 選んだ訴求の数（3つまで） | `1. 駅が近い ／ 2. 相場より割安 ／ 3. …` | `items`（素材ごとの点・選んだか・効いたルール）、`skipped`（必要なカードがなく外した素材） |
| `decision.total_budget` | ルール（判断カード） | 広告の総予算（万円） | `広告の総予算 30万円（入力値）` | `source`（`input`＝入力／`rule`＝ルールの提案値）、効いたルール、提案値、物件の価格 |
| `decision.media.sns` ほか | ルール（判断カード） | 媒体ごとの金額（万円）。`comparison` は総予算。旧ルール表の媒体は `sns`・`posting`・`flyer`・`lp`、採点ルール表では `media_channels.id`（`instagram`・`portal` など）。採点ルール表では `basis` に届きやすさ・反響係数・最初に使う額も入る | `Instagram・Facebook広告 15.6万円（52%）` | 媒体名・役割、割合、重み、固定額・最低額、効いたルール |

周りのデータをまだ取っていない物件では、⑤ 防災・④ 周辺施設のカードは `status = not_available` になり、`basis.reason` に理由が入る。

```sql
-- 例：物件1の最新の実行のカードを番号順に
select f.seq, f.key, f.value, f.value_text, f.status
from facts f
where f.run_id = (select max(id) from analysis_runs where property_id = 1 and status = 'succeeded')
order by f.seq;
```

### `narratives`：AIが書いた説明文
**1行＝1回の実行でAIが書いた文章一式。** 画面を開き直しても作り直さない。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 行の番号 | |
| `run_id` | bigint | 必須 | どの実行の文章か（1つの実行に1つ） | |
| `model` | text | 必須 | 使ったAIのモデル | |
| `prompt_version` | text | 必須 | 使った指示文（プロンプト）の版 | |
| `content` | jsonb | 必須 | 文章。セクション（6つ）→ 段落 → 文（種別：`numeric`／`qualitative`／`proposal`）→ 引用したカードの番号。`prompt_version` が `v1` の文章は旧い4セクション | |
| `validation` | jsonb | | 検証の結果（段落ごと）。文の種別・数字・比較語・禁止表現（設計書6.3） | |
| `status` | text | 必須 | `ok`／`needs_review`（要確認）／`failed`（生成できなかった） | |
| `attempts` | smallint | 必須 | 生成した回数（検証に通らないと1回だけ作り直す） | `1` |
| `input_tokens` / `output_tokens` | integer | | AIに送った・受け取ったトークン数（作り直しを含めた合計。設計書D17） | `8200` / `2100` |
| `duration_ms` | integer | | 生成にかかった時間（ミリ秒、作り直しを含めた合計） | `34000` |
| `created_at` | timestamptz | 必須 | 作った日時 | |

### `evaluations`：評価（5段階×4観点）
2026-10-12 に、PoCで見せるときに邪魔になるため販売戦略の画面から評価の入力（「この戦略の評価（確認2）」）を外した。表は残している。

**1行＝1つの観点の点数1つ**（PoCの確認2の材料。設計書D18・10章）。具体性・実行可能性は4つの答えごと、根拠整合・UI可読性は物件ごと（`answer_key` は空）に付ける。同じ人が同じ文章・答え・観点に付けられるのは1行だけ。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 行の番号 | |
| `narrative_id` | bigint | 必須 | どの文章（＝どの実行）の評価か | |
| `answer_key` | text | | 4つの答えのどれか。`target`（狙う層）／`appeal`（訴求）／`media_budget`（媒体予算）／`action`（進め方）。物件ごとの観点では空 | `target` |
| `criterion` | text | 必須 | 観点。`specificity`（具体性）／`feasibility`（実行可能性）／`evidence`（根拠整合）／`readability`（UI可読性） | `specificity` |
| `score` | smallint | 必須 | 1〜5点（5＝そのまま取引先に出せる〜1＝使えない・事実が誤っている） | `4` |
| `memo` | text | | メモ | |
| `evaluator` | text | | 評価した人 | |
| `created_at` | timestamptz | 必須 | 評価した日時 | |

---

## 7. ⑤ ルール表（旧。2026-10-12から分析には使っていない）

採点ルール表（7.5、設計書D35）に置き換えた。前の分析の結果を読むために、表と画面（`/rules/legacy`）を残している。

### `rules`：ルール
**1行＝ルール1つ。** 狙う層の順位、訴求の選び方、予算配分を決める。BRUMBY様からの聞き取りで育てる。**ルール表の画面（`/rules`）か Supabase Studio で直接直してよい**（設計書D4の例外、D14）。編集すると `version` が自動で上がり、変更が `rule_revisions` に残る。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | text | 必須 | ルールの番号 | `R-21` |
| `kind` | text | 必須 | 種類。`total_budget`（総予算）／`media_weight`（媒体の重み）／`min_spend`（最低額）／`target_score`（狙う層の点数）／`appeal_score`（訴求の点数） | `media_weight` |
| `condition` | jsonb | 必須 | 条件（事実カードの値の比較）。`when` で物件種別を絞れる | `{"fact":"target.age_30_49_ratio","op":">","than":"comparison","delta":0.05,"when":{"property_type":["新築戸建"]}}` |
| `effect` | jsonb | 必須 | 条件に当てはまったときの効果 | `{"media":"instagram","weight":2}` ／ `{"candidate":"family","score":1}` ／ `{"appeal":"school_near","score":1}` |
| `note` | text | 必須 | 理由（BRUMBY様の言葉で書く） | |
| `enabled` | boolean | 必須 | 使うかどうか | `true` |
| `version` | integer | 必須 | ルールの版。編集すると自動で1つ上がる | `1` |
| `updated_by` | text | | 最後に変えた人 | |
| `updated_at` | timestamptz | 必須 | 最後に変えた日時（自動） | |

### `target_candidates`：狙う層の候補
**1行＝狙う層の候補1つ**（設計書D22）。候補はコードに書かず、この表の行にする。点数は `rules` の `target_score` で付ける。`/rules` か Studio で直してよい。変更は `rule_revisions` に残る。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | text | 必須 | 候補の番号（ルールの `effect` から指す） | `family` |
| `label` | text | 必須 | 画面に出す名前 | `30〜40代の子育てファミリー` |
| `description` | text | 必須 | 説明 | `賃貸からの住み替え層。学校・駐車場・広さに関心` |
| `property_types` | text[] | | 対象の物件種別。空なら全部 | `{新築戸建,中古戸建}` |
| `sort_order` | integer | 必須 | 並び順。同点のときは小さいほうを上にする | `1` |
| `enabled` | boolean | 必須 | 使うかどうか | `true` |
| `confidence` | text | 必須 | `normal`／`low`（公開データでは根拠が弱い。画面とAIで「仮説」と出す） | `low`（住み替え層） |
| `updated_by` / `updated_at` | text / timestamptz | | 最後に変えた人・日時（日時は自動） | |

### `appeal_items`：訴求の素材
**1行＝訴求の素材1つ**（設計書D23・6.4）。`rules` の `appeal_score` で点を付け、上位3つを使う。AIは選ばれた素材を言い換えるだけ。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | text | 必須 | 素材の番号（ルールの `effect` から指す） | `school_near` |
| `label` | text | 必須 | 画面に出す名前 | `小・中学校が近い` |
| `description` | text | 必須 | 説明 | |
| `needs_facts` | text[] | 必須 | 必要な事実カードの `key`。1つでも `ok` でなければ選ばない | `{facility.elementary_nearest}` |
| `property_types` | text[] | | 対象の物件種別。空なら全部 | `{土地}` |
| `sort_order` | integer | 必須 | 並び順。同点のときは小さいほうを上にする | `1` |
| `enabled` | boolean | 必須 | 使うかどうか | `true` |
| `updated_by` / `updated_at` | text / timestamptz | | 最後に変えた人・日時（日時は自動） | |

### `rule_revisions`：ルール・候補・訴求の変更の履歴
**1行＝`rules`・`target_candidates`・`appeal_items` の追加・変更・削除1回。** 自動で記録される（手で書かない）。

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | bigint | 必須 | 履歴の番号。分析の実行には、この最大値を「ルールの版」として残す（候補・訴求の変更も版が上がる） | |
| `table_name` | text | 必須 | どの表の変更か | `rules` |
| `rule_id` | text | 必須 | 変更した行の番号（`table_name` の表の `id`） | `R-21` |
| `operation` | text | 必須 | `insert`（追加）／`update`（変更）／`delete`（削除） | |
| `snapshot` | jsonb | 必須 | 変更後の行の中身（削除のときは削除前） | |
| `changed_at` | timestamptz | 必須 | 変えた日時 | |

---

## 7.5 ⑥ 採点ルール表（設計書D35）

BRUMBY様と作った Excel「採点ルール表」を表にしたもの。最初に `npm run import-scoring -- "<xlsxのパス>"` で取り込み、以後は採点ルール表の画面（`/rules`）で直す（「採点ルール」「項目の重視度」の行の追加と、ID・層・項目キーの変更は管理者が Excel の取り込みか Studio で行う。画面ではできない）（Supabase Studio で直してもよい）。どの表を変えても `scoring_revisions` に変更前後が残り、分析の実行には `scoring_revisions.id` の最大を「採点ルール表の版」として残す。計算は `lib/scoring/engine.ts`。

### `personas`：ペルソナ（Excel：ペルソナ・年収分布・貯蓄分布・ペルソナの年代・買い手の多さ）

| 列 | 型 | 必須 | 説明 | 例 |
|---|---|---|---|---|
| `id` | text | 必須 | A〜H（G・Hは予備枠） | `B` |
| `label` / `description` | text | 必須 | ターゲット候補の名前／世帯像・重視すること | `小中学生のいる家族` |
| `rep_age` | integer | 必須 | 代表年齢。完済年齢の上限から返済期間を決める | `40` |
| `down_payment_rate` | numeric | 必須 | 想定頭金率 | `0.15` |
| `purchase_method` | text | 必須 | `loan`（年収からローンを逆算）／`cash`（今の家の売却見込み＋貯蓄） | `loan` |
| `income_dist` | jsonb | 必須 | 世帯年収の分布（10区分の割合。区分は `lib/scoring/constants.ts` の `INCOME_BANDS`） | `[0.016,0.033,…]` |
| `savings_dist` | jsonb | 必須 | 貯蓄の分布（19区分。`cash` のペルソナだけ使う） | `[0.077,…]` |
| `age_mix` | jsonb | 必須 | 広告を見て判断する世帯主の年代構成（媒体の届きやすさに使う） | `{"30代":0.5,"40代":0.5}` |
| `buyer_share_new` / `buyer_share_used` | numeric | | 新築／中古の買い手での割合（買い手の多さ） | `0.661` / `0.387` |
| `notes` | jsonb | 必須 | 統計の区分・世帯数・根拠のメモ | |
| `sort_order` / `enabled` | | 必須 | 並び順（同点のときは上が先）・使うか | |

### `scoring_items`：項目の重視度
**1行＝採点の項目1つ。** `key` は Excel と同じ項目キー（例：`駅_m`・`延床_㎡`）。`importance` はペルソナごとの重視度 `{"A":2,"B":3,…}`（0=関係ない〜3=とても重視）。`layer` は 物件／生活環境／市場。

### `scoring_rules`：採点ルール
**1行＝1ルール。** 項目の値が `lower_bound`〜`upper_bound`（空は制限なし）なら該当。点＝適合度（`fit` の ◎+2〜×−2）×重視度×1段階の点数（`scoring_params` の `1段階の点数`）。`reason` は画面の「評価理由」に出す文。`basis_class` は 統計／仮説／BRUMBY確認／BRUMBY実務。`exclusive_group`（空なら `id`）ごとに一番大きい加点を足したものが満点。

### `scoring_params`：数値の設定
**1行＝数値1つ。** `category` が `layer_weight`（物件・購入可能性・生活環境・市場・競合・買い手の多さ）／`purchase`（金利・返済負担率・完済年齢上限・最長返済期間・満点割合・1段階の点数・年収の端数・自宅売却見込み・貯蓄の使える割合）／`budget`（売れやすさの重みと区切り、基準率、倍率、初回の割合、追加の条件、価格見直しの相場比）／`media`（配分に使う媒体の数、反響係数を使い始める問い合わせ数）。キーが抜けていると `lib/scoring/constants.ts` の既定値で計算する。

### `competitor_items`：競合重視度
**1行＝競合と比べる項目1つ。** `direction`（1=大きいほど有利、−1=小さいほど有利）、`importance`（ペルソナごとの重視度）、`tie_margin`（この差以内は引き分け）。

### `market_reference`：相場・周辺の取引
**1行＝区×築年数区分（新築／築2〜20年／築21年以上）の取引の中央値。** 価格・延床・土地・築年数・件数。価格の相場比と、競合がないときの比較相手に使う。出典は不動産情報ライブラリ（新潟市 2021〜2026年、戸建3,297件）。

### `area_popularity`：エリア人気
**1行＝町1つの人気スコア（0〜100）と市内順位。** 町が見つからないときは区の中央値、それもなければ50点。

### `media_channels`・`media_usage_rates`：媒体と利用率
媒体ごとに、使う統計（`stat_name`、`media_usage_rates` の行）か一律の届きやすさ（`flat_reach`）を持つ。利用率は年代別（%）と全年代。届きやすさ＝(ペルソナの年代構成で平均した利用率)²÷全年代の利用率×反響係数。

### `media_results`：反響の記録
**1行＝ある媒体の掲載1回分**（物件・掲載開始日・費用・問い合わせ・見学・成約）。反響係数＝全媒体の平均の問い合わせ単価÷その媒体の問い合わせ単価（0.5〜2.0）。問い合わせが `係数を使い始める問い合わせ数`（10件）未満の媒体は1.00。計算に使うのは媒体・費用・問い合わせだけ。`visits`・`contracts`・`memo`・`entered_by` は画面からは入れない（2026-10-12）。

### `brumby_judgments`：BRUMBY様の判断（いまは使っていない）
2026-10-12 に、PoCで見せるときに邪魔になるため販売戦略の画面から入力欄と一致率の表示を外した。表は残している。

**1行＝ある物件についての判断1回。** `targets`（ペルソナID、第1〜第3）、`appeals`（`competitor_items.key`）、`media`（`media_channels.id`）、`comment`（AIとのズレの理由）、`run_id`（判断したときに見ていた分析）。以前は販売戦略の画面で、AIの結果との一致率とズレを出していた（計算のコードも外した）。

### `scoring_revisions`：採点ルール表の変更の履歴
**1行＝⑥の表の追加・変更・削除1回**（トリガーで自動）。`before`・`after` に変更前後の行、`reason`・`related_property`・`changed_by` に変更理由・関連物件・変更者（`set_config('brumby.change_reason', …)` などで同じトランザクションから渡す。入るのは Excel 取り込みの行だけ。2026-10-12 に画面の入力欄は外した）。`table_name = 'excel'` の行は、Excel の「変更履歴」シートを取り込んだもの。

---

## 8. Storage（ファイルの置き場所）

テーブルではないが、Supabase Storage のバケット `ingest-raw`（非公開）に、APIから受け取った元のデータをそのまま保存している。`dataset_versions.raw_uri` が場所を指す。

| 場所 | 中身 |
|---|---|
| `reinfolib/XIT001/<版>/2024Q1.json` など | 取引価格のAPIの応答（四半期ごと） |
| `reinfolib/XPT002/<版>/2026.json` など | 地価のAPIの応答（年ごと） |
| `estat/census2020_boundary/<版>/r2ka15.zip` | 町丁目の境界（Shapefile） |
| `estat/census2020_small_area/<版>/<statsDataId>.json` | 国勢調査のAPIの応答（表ごと） |
