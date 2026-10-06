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

テーブルは、役割で5つのグループに分かれる。

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
⑤ ルール表           rules ・ target_candidates（狙う層の候補）・ appeal_items（訴求の素材）
                          └ rule_revisions（3つの表の変更の履歴）
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
| ⑤ ルール表 | `rules` | 予算配分・狙う層を決めるルール | 20（仮のルール） | `npm run seed-rules` で最初に入れ、以後はルール表の画面（`/rules`）か Studio で人が直す |
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
| `failure_kind` | text | | 失敗の種類（失敗のときだけ）。`auth`（認証）／`rate_limit`（回数制限）／`network`（通信）／`other` | `rate_limit` |
| `published_on` | date | | データの公開年月（月の1日を入れる）。鮮度（公開から実施日までの差）に使う | `2026-03-01` |
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

**`empty` の読み方**：`features_in_tiles` も0なら「その地域にデータがない」（例：新潟市の学区）。`features_in_tiles` が1以上なら「データはあるが、物件の近くにはない」（例：浸水想定区域の外）。

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
| `created_at` / `updated_at` | timestamptz | 必須 | 作った日時・最後に変えた日時 | |

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
| `walk_min` | smallint | | 駅からの徒歩（分） | `12` |
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
| `rules_version` | bigint | | 使ったルールの版（その時点の `rule_revisions.id` の最大） | |
| `status` | text | 必須 | `running`（実行中）／`succeeded`（成功）／`failed`（失敗） | |
| `stage` | text | | 進み具合。`analyze`（集計）→ `rules`（ルール）→ `ai`（AI）→ `verify`（検証） | |
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
| `facility.elementary_district` | ④ 周辺施設 | — | `裏館小学校`（データがない地域は `not_available`） | 学校名、住所 |
| `facility.junior_high_district` | ④ 周辺施設 | — | `第三中学校` | 同上 |
| `facility.nursery_nearest` | ④ 周辺施設 | 最寄りの保育園・幼稚園等までの直線距離（m） | `宝塔院幼稚園（直線322m、徒歩約6分）` | 名称、種類、直線・徒歩の距離と分数 |
| `facility.nursery_count` | ④ 周辺施設 | 半径（初期値1km）の中の保育園・幼稚園等の数 | `半径1000m以内に15か所` | 種類ごとの内訳 |
| `facility.station_nearest` | ④ 周辺施設 | 最寄りの駅までの直線距離（m） | `白山駅（越後線）直線1539m、徒歩約26分` | 駅名、路線、乗降客数（人/日）とその年 |
| `area.zoning` | ④ 周辺施設 | — | `第１種住居地域`／`用途地域の指定がない区域` | 建蔽率・容積率（ある場合） |
| `target.population` | ① 人口構成 | 半径の中の人口（人） | `半径1000mの人口 約21,226人、世帯 約9,426` | 世帯数、重なった町丁目の数、計算方法 |
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
| `decision.target_rank` | ルール（判断カード） | 1位の点数 | `1位 30〜40代の子育てファミリー（4点） ／ 2位 …` | 順位ごとの狙う層・点数・効いたルール |
| `decision.total_budget` | ルール（判断カード） | 広告の総予算（万円） | `広告の総予算 30万円` | 効いたルール、物件の価格 |
| `decision.media.sns` ほか | ルール（判断カード） | 媒体ごとの金額（万円）。`comparison` は総予算。媒体は `sns`・`posting`・`flyer`・`lp` | `Instagram・Facebook広告 15.6万円（52%）` | 媒体名・役割、割合、重み、固定額・最低額、効いたルール |

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
| `content` | jsonb | 必須 | 文章。セクション → 段落 → 文 → 引用したカードの番号 | |
| `validation` | jsonb | | 検証の結果（段落ごと）。文の種別・数字・比較語・禁止表現（設計書6.3） | |
| `status` | text | 必須 | `ok`／`needs_review`（要確認）／`failed`（生成できなかった） | |
| `attempts` | smallint | 必須 | 生成した回数（検証に通らないと1回だけ作り直す） | `1` |
| `input_tokens` / `output_tokens` | integer | | AIに送った・受け取ったトークン数（作り直しを含めた合計。設計書D17） | `8200` / `2100` |
| `duration_ms` | integer | | 生成にかかった時間（ミリ秒、作り直しを含めた合計） | `34000` |
| `created_at` | timestamptz | 必須 | 作った日時 | |

### `evaluations`：評価（5段階×4観点）
**1行＝1つの観点の点数1つ**（PoCの確認2の材料。設計書D18・10章）。具体性・実行可能性は4つの答えごと、根拠整合・UI可読性は物件ごと（`answer_key` は空）に付ける。

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

## 7. ⑤ ルール表

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

## 8. Storage（ファイルの置き場所）

テーブルではないが、Supabase Storage のバケット `ingest-raw`（非公開）に、APIから受け取った元のデータをそのまま保存している。`dataset_versions.raw_uri` が場所を指す。

| 場所 | 中身 |
|---|---|
| `reinfolib/XIT001/<版>/2024Q1.json` など | 取引価格のAPIの応答（四半期ごと） |
| `reinfolib/XPT002/<版>/2026.json` など | 地価のAPIの応答（年ごと） |
| `estat/census2020_boundary/<版>/r2ka15.zip` | 町丁目の境界（Shapefile） |
| `estat/census2020_small_area/<版>/<statsDataId>.json` | 国勢調査のAPIの応答（表ごと） |
