# BRUMBY AI物件販売戦略 PoC

新潟市の戸建て（新築・中古）1物件の情報から、販売戦略レポートを作るシステムのPoCです。

流れは ①入力 → ②収集 → ③事実シート → ④エージェント → ⑤画面 です。AIを使うのは④だけで、距離・件数・相場比・返済額・金額はプログラムで計算します。

## 資料

| 資料 | 内容 |
|---|---|
| `docs/設計まとめ.md` | 仕様の正本。エージェントの指示文もここにある |
| `docs/実装の進め方.md` | 作る順番と各段階の完了条件 |
| `docs/DBの形.md` | 表と列の説明 |
| `docs/データ取り込み一覧.md` | 取り込みのコマンドと順番 |
| `docs/参考/` | データの調査メモ（取得先URL、形式、ライセンス） |
| `docs/履歴/` | 済んだ作業計画・修正案（内容は設計まとめに反映済み） |

## フォルダの形

```
app/               画面（① 入力、⑤ レポート）とAPI
lib/facts/         ②収集と③事実シートの作成
lib/agents/        ④エージェントの呼び出し、点検
lib/calc/          ローン計算、予算シミュレーション
lib/db/            DBへの接続
prompts/           エージェントの指示文（設計まとめと一字一句同じ）
scripts/           コマンド（事実シート、戦略、取り込み）
scripts/ingest/    データの取り込み（データごとに1ファイル：jobs/）
supabase/migrations/
data/raw/          ダウンロードした元データ（gitに入れない）
tests/
docs/
```

## 必要なもの

- Node.js 20 以上
- 取り込みだけで使うもの：Python（`pypdf`。D29 大規模小売店舗の PDF を読む）

## `.env.local`

値は git にもログにも出しません。`NEXT_PUBLIC_` の付いていないキーはサーバー側だけで使います。

| 変数 | 用途 |
|---|---|
| `DATABASE_URL` | DBへの接続（`lib/db/`、`scripts/`）。Vercel では Transaction pooler（ポート 6543）の接続文字列にする |
| `ANTHROPIC_API_KEY` | エージェントの呼び出し（`lib/agents/llm.ts`） |
| `REINFOLIB_API_KEY` | 取引価格の取り込み（`scripts/ingest/lib/reinfolib.ts`）。利用規約によりアクセスログを保存する |
| `NEXT_PUBLIC_SUPABASE_URL` | 動作確認（`/api/health`） |
| `SUPABASE_SERVICE_ROLE_KEY` | 同上。すべてのデータを操作できるキー |
| `BASIC_AUTH_PASSWORD` | Basic認証のパスワード（`proxy.ts`）。未設定だと認証なしで表示される（一時的に解除中） |
| `BASIC_AUTH_USER` | Basic認証のユーザー名（省略時は `brumby`） |

Vercel の関数のリージョンは東京（`vercel.json` の `hnd1`）です。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発用サーバー |
| `npm test` | テスト（Vitest） |
| `npm run lint` | ESLint |
| `npm run db:check` | DBにつながるか、表の一覧 |
| `npm run ingest -- <名前>` | データの取り込み（`npm run ingest -- status` で状況） |
| `npm run facts -- <物件番号>` | 事実シートを作る |
| `npm run strategy -- <物件番号>` | エージェントを実行する |
| `npm run paste -- <物件番号>` | claude.ai に貼る文章を作る |

## 住所から緯度経度

国土地理院 住所検索API（`https://msearch.gsi.go.jp/address-search/AddressSearch`、無料・APIキー不要）を使います（`lib/geocode.ts`）。

- 細かさは住所の書き方で変わります。「○番○号」（住居表示）は建物のあたりまで合いますが、「○番地」（地番）は丁目の代表の地点までしか合わないことがあります。
- 丁目の代表の地点でもずれは数百m以内ですが、地点で判定するもの（浸水想定、用途地域）は結果が変わることがあります。登録のときに地図のピンで確かめ、直せるようにしています。
- PoC の対象は新潟県内だけです。県の外に当たったら、住所の書き方が違う可能性が高いです。
