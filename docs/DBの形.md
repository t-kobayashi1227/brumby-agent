# DBの形

段階1で作る表の説明です。仕様は `docs/設計まとめ.md`、表の定義は `supabase/migrations/20261025*.sql` にあります。

## 全体の決まり

- **座標：** WGS84（EPSG:4326）で持ちます。
  - 点（施設・物件・公示地）は `geography` 型にしています。`ST_DWithin(geog, 物件, 1000)` で1km以内を、`ST_Distance` で直線距離（m）を、そのまま出せます。
  - 面（町・区域・メッシュ）は `geometry` 型にしています。点が入るかは `ST_Intersects(geom, 物件::geometry)` で判定します。
  - 位置と形の列には、すべて空間インデックス（GiST）を付けています。
- **RLS：** すべての表で有効にしています。ポリシーは作らないので、ブラウザからは読めません。サーバー側から DB の接続（`DATABASE_URL`）か service role キーで読み書きします。
- **データの出どころ：** 取り込んだ公的データの行には `dataset_id` を付け、元の行を `raw` に残します。事実の「出典」「時点」は `datasets` から引きます。
- **選択肢の値：** 物件区分、施設の種類、区域の種類など、選択肢の値は日本語で持ち、`check` 制約で決まった値だけを受け付けます。値はそのまま事実や画面に使えます。

## 表の一覧

| 表 | 中身 | 設計まとめ | 入れる時期 |
| --- | --- | --- | --- |
| `datasets` | 使うデータの一覧（D01〜D39、B01〜B06）、時点、出典の文言、件数 | ②使用するデータ、ライセンス表示 | 作成時に43件入る |
| `ingest_logs` | 取り込みのたびの記録、確かめた結果 | 段階2 | 段階2 |
| `api_access_logs` | 不動産情報ライブラリ API のアクセスログ（利用規約） | CLAUDE.md | 段階2から |
| `towns` | 町の境界と町の中心（D39） | 事実 A、区内の平均 | 段階2 |
| `area_stats` | 町・区・市の統計を縦持ち（年齢構成、世帯構成、持ち家率など） | 事実 A | 段階2 |
| `population_mesh` | 250mメッシュの将来推計人口（D11） | 事実 A | 段階2 |
| `facilities` | 施設20種（学校、保育、公園、役所、駅、バス停、買い物、医療） | 事実 L・T | 段階2 |
| `ward_facility_averages` | 区内の町の平均件数（種類ごと、1km以内） | 周りの施設（L）の渡し方 | 段階2で計算 |
| `zones` | 用途地域・学区・災害の形 | 事実 R・S・H | 段階2 |
| `school_zone_rules` | 通学区域一覧（町名・丁目・地番 → 小学校と中学校） | 事実 S | 段階2（市のホームページから読み取る） |
| `transactions` | 取引価格・成約価格（XIT001）と町への対応 | 事実 M | 段階2 |
| `land_prices` | 地価公示・地価調査 | 事実 M | 段階2 |
| `reference_stats` | 買い手・媒体の統計（年収分布、買主の年代、媒体の利用率） | 事実 B | 段階2 |
| `assumptions` | 前提値（金利・頭金・返済負担率など。項目・値・根拠・時点・適用開始日） | 買い手・ローンの前提 | 作成時に6件入る |
| `target_candidates` | ターゲット候補6つと代表年齢 | ターゲット候補 | 作成時に6件入る |
| `media` | 媒体一覧 C-01〜C-16 | 媒体の選び方 | 作成時に16件入る |
| `properties` | 物件（①の15項目のうち交通・競合以外） | ①入力項目 | 段階5の画面から |
| `property_transports` | 交通（最大2つ） | ①交通 | 段階5の画面から |
| `competitors` | 競合物件（任意・複数） | ①競合物件、事実 K | 段階5の画面から |
| `fact_sheets` | 事実シート（エージェントに渡した JSON） | ③ | 段階3 |
| `strategy_runs` | 戦略の実行1回分（進み具合、合計の費用、⑤に渡す結果） | ④処理の流れ | 段階4 |
| `agent_calls` | エージェントの呼び出し1回ごとの入力・出力・トークン数・費用 | ④ | 段階4 |
| `check_results` | 点検の結果（プログラムとAI） | ④確認のチェック項目 | 段階4 |

## つながり

```
datasets ─┬─ towns ── transactions（town_key_code）
          ├─ area_stats / population_mesh / facilities / zones / land_prices
          ├─ school_zone_rules / reference_stats
          └─ ingest_logs

properties ─┬─ property_transports（最大2）
            ├─ competitors（任意・複数）
            └─ fact_sheets ── strategy_runs ─┬─ agent_calls
                                             └─ check_results
```

物件を削除すると、交通・競合・事実シート・実行記録・点検の結果も一緒に消えます（`on delete cascade`）。

## 表ごとの補足

### datasets

- `id` は D＋設計まとめの No（D01〜D39）と、買い手・ローンの前提の B01〜B06 です。No.32・37 は削除済みなので、D32・D37 はありません。
- `as_of`（時点）は、取り込んだときに実際のデータの年月に直します。
- `attribution` は画面の出典一覧に出す文言です。A33（D33）は決まった文言にしています。

### facilities

- `kind` は事実 L の種類の名前そのままです（小学校、保育園、スーパー、小児科のある診療所なら「診療所」で `departments` に「小児科」など）。
- 医療の診療科は `departments`（配列）に入れます。`'小児科' = any(departments)` で探せます。
- 駅の乗降客数、バス停の系統数などは `attrs`（JSON）に入れます。

### zones

- `label` は事実の「値」にそのまま使う文言です（例：`第一種低層住居専用地域`、`0.5〜3.0m`）。
- 学区は、まず `school_zone_rules`（通学区域一覧）で住所から確定します。境界にかかるなど決められないときは「要確認」です。

### school_zone_rules（通学区域一覧）

- 新潟市のホームページの通学区域の表を、そのまま1行ずつ入れます（2026-10-25 に作り直し）。市の表は「小学校／中学校」の組ごとのページなので、1行に小学校と中学校を両方持ちます。
- `town`（町名）・`chome`（丁目）・`lot_ranges`（番・号の範囲）で物件の住所と照らし合わせます。照らし合わせ方は `lib/facts/school-zones.ts` の `resolveZone` です。
- `lot_scope` が「全部」なら町（丁目）全体、「一部」なら `lot_ranges` の範囲だけです。地番の書き方が複雑で読み取れない行は `lot_ranges` が空で、その町の住所は「要確認」になりえます。
- `ward` は、同じ町名が複数の区にある町（例：大潟）だけに入ります。

### reference_stats（買い手・媒体の統計）

- `data/raw/buyers/買い手の統計.csv` を小林さんが整え、`npm run ingest -- buyers` で入れます。
- `source`（出典の場所、例：報告書 p.39）を事実シートの出典に使います。

### assumptions（前提値）

- 金利は月1回、頭金・返済負担率は年1回（7月）、新しい行を**足します**。古い行は消しません。
- 計算には「適用開始日が今日以前で一番新しい行」を使い、事実シートの `assumption_ids` に使った行を記録します。
- 最初の6件：変動金利 1.3%、全期間固定金利 3.83%、頭金の割合 10%、返済負担率 25%、返済期間 35年、完済年齢の上限 80歳。

### properties

- `code`（物件ID、例：`BR-2026-0001`）は、登録したときにトリガーが付けます。
- `layout` は入力のまま持ちます。`rooms`（居室）と `storerooms`（納戸）は、登録時にプログラムで分けて入れます（4LDK+S → 4 と 1）。
- `location_source` は「住所検索」か「手で修正」（地図のピンを動かした）です。
- リフォーム「なし」のときは、年と箇所を入れられません（`check` 制約）。

### fact_sheets（事実シート）

- 物件の画面の「事実シートを見る」→「事実シートを作る」か、`npm run facts -- <物件の番号> save` で作ります（`summary` を付けると値を出さずに ID・項目・状態だけを出します）。作り直すたびに行を足し、古いシートも残します。
- 作り方は `lib/facts/`：`collect.ts` が物件の位置から DB を SQL で引き、`build.ts` が事実に組み立てます。ローン計算は `lib/calc/loan.ts` です。
- 相場は、物件のある区（市区町村コード）の「宅地(土地と建物)」の取引を、取り込んだすべての年（2015〜）で、築年数の帯（築0〜1年、2〜9年、10〜19年、20〜29年、30〜39年、40〜49年、50年以上）に分けて中央値を出します（帯は 2026-10-27 小林さんと決定）。町だけでは件数が少ないため、区で見ます（2026-10-25 小林さんと決定）。新築は築0〜1年と比べます。`transactions.town_key_code` は使っていません（全件が空のため）。
- 地図で「この位置で確定」を押すと事実シートの画面に移り、周辺情報の取得が自動で始まります。画面は `/api/properties/[id]/facts` から段階ごとの知らせ（`lib/facts/steps.ts`）を受けて、進み具合を出します。
- 洪水など、まだ取り込んでいないデータ（`datasets.row_count` が空）の事実は「取得できず」になります。取り込んだあとに作り直すと値が入ります。

### strategy_runs / agent_calls / check_results

- `npm run strategy -- <物件の番号>` で、最新の事実シートから7つのエージェントを動かします（`lib/agents/run.ts`）。指示文は `prompts/`（設計まとめと一字一句同じことを `tests/agents.test.ts` で確かめます）、作り直しの依頼文は `prompts/rebuild.txt` です。
- `strategy_runs.result` は `{fact_sheet_id, 分析, メイン, 媒体, 予算シミュレーション}` です。IDのない文は外した後の形です。

- 同じ物件で同時に動く実行は1つだけです（`strategy_runs_one_active`）。
- `agent_calls.attempt` は、1が最初の呼び出し、2が作り直しです（作り直しは1回だけ）。
- `prompt_sha256` は指示文の中身のハッシュです。指示文を直したとき、どの版で動かしたかが分かります。
- 費用は呼び出しごとに `agent_calls.cost_usd`、合計を `strategy_runs.cost_usd` に入れます。

## よく使う確かめ方（SQL Editor で）

```sql
-- 表と件数
select relname as 表, n_live_tup as 件数 from pg_stat_user_tables order by relname;

-- データの一覧（段階2の完了条件：データごとの件数と時点）
select id, name, as_of, row_count, loaded_at from datasets order by id;

-- いま使われる前提値
select distinct on (key) key, value, unit, as_of, effective_from
from assumptions where effective_from <= current_date
order by key, effective_from desc;
```
