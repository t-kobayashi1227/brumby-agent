-- 共通の準備と、データの一覧・取り込みの記録（docs/設計まとめ.md「使用するデータ（37件）」「買い手・ローンの前提」）
-- 座標は WGS84（EPSG:4326）。点は geography（直線距離をそのまま出せる）、面は geometry（点が入るかの判定）で持つ
-- PoC ではログインを作らない。表はすべて RLS を有効にし、サーバー側から service role（または DB の接続）で読み書きする

create extension if not exists postgis with schema extensions;

-- updated_at を自動で更新する共通の関数
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 使うデータの一覧。D01〜D39 は設計まとめの No、B01〜B06 は「買い手・ローンの前提」の表
-- 事実の「出典」「時点」はここから引く。取り込んだら as_of・row_count・loaded_at を更新する
create table public.datasets (
  id text primary key,                -- 例：D01 / B01
  no smallint,                        -- 設計まとめの No（買い手・ローンの前提は null）
  category text not null,             -- 例：価格 / エリア / 施設 / 買い手
  name text not null,                 -- 例：取引価格・成約価格（XIT001）
  provider text not null,             -- 例：不動産情報ライブラリ
  as_of text,                         -- データの時点（例：2023 / 2026-03 / ダウンロード日）
  method text,                        -- 取得の方法（API / ファイル / 手で整備 など）
  usage text,                         -- 使い方
  attribution text,                   -- 画面に出す出典の文言（ライセンス表示）
  row_count integer,                  -- 取り込んだ件数
  loaded_at timestamptz,              -- 最後に取り込んだ日時
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger datasets_set_updated_at
  before update on public.datasets
  for each row execute function public.set_updated_at();

-- 取り込むたびの記録（段階2の「データごとの件数と時点の一覧」と、確かめること5点の材料）
create table public.ingest_logs (
  id bigint generated always as identity primary key,
  dataset_id text not null references public.datasets (id) on delete cascade,
  command text not null,              -- 実行したコマンドと引数
  status text not null check (status in ('succeeded', 'failed')),
  row_count integer,
  checks jsonb,                       -- 確かめた結果（例：{"緯度経度0の行": 117, "補った行": 117}）
  error text,
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);

create index on public.ingest_logs (dataset_id, finished_at desc);

-- 不動産情報ライブラリ API のアクセスログ（利用規約により保存する）
create table public.api_access_logs (
  id bigint generated always as identity primary key,
  api text not null,                  -- 例：XIT001 / XKT002 / XKT025
  endpoint text not null,             -- キーを含まない URL
  params jsonb,                       -- 送ったパラメータ（キーは入れない）
  status_code integer,
  response_bytes integer,
  duration_ms integer,
  requested_at timestamptz not null default now()
);

create index on public.api_access_logs (requested_at desc);

alter table public.datasets enable row level security;
alter table public.ingest_logs enable row level security;
alter table public.api_access_logs enable row level security;

-- 設計まとめの「使用するデータ（37件）」。No.32・37 は削除済み（10-24決定）
insert into public.datasets (id, no, category, name, provider, as_of, method, usage) values
  ('D01', 1, '価格', '取引価格・成約価格（XIT001）', '不動産情報ライブラリ', '2005〜（四半期）', 'API', '町×築年数の相場、区平均'),
  ('D02', 2, '価格', '地価公示（L01）', '国土数値情報', '2026', 'ファイル', '近くの公示地の価格・変動率'),
  ('D03', 3, '価格', '都道府県地価調査（L02）', '国土数値情報', '2026', 'ファイル', '公示地の少ない所を補う'),
  ('D04', 4, '規制', '用途地域（XKT002）', '不動産情報ライブラリ', '2026-07', 'API', '用途地域の名前（建蔽率・容積率は使わない）'),
  ('D05', 5, 'エリア', '年齢別人口（T001082）', 'e-Stat 国勢調査', '2020', 'ファイル', '町の年齢構成'),
  ('D06', 6, 'エリア', '家族類型別世帯数（T001084）', 'e-Stat 国勢調査', '2020', 'ファイル', '夫婦と子・子育て世帯の数'),
  ('D07', 7, 'エリア', '持ち家・借家別世帯数（T001085）', 'e-Stat 国勢調査', '2020', 'ファイル', '持ち家率'),
  ('D08', 8, 'エリア', '住宅の建て方別世帯数（T001086）', 'e-Stat 国勢調査', '2020', 'ファイル', '一戸建て率'),
  ('D09', 9, 'エリア', '核家族世帯割合・世帯員年齢別割合（T001090）', 'e-Stat 国勢調査', '2020', 'ファイル', '子育て世帯の割合'),
  ('D10', 10, 'エリア', '町名別5歳階級人口', '新潟市OD', '2026-03', 'ファイル', '最新の年齢構成'),
  ('D11', 11, 'エリア', '250mメッシュ将来推計人口（mesh250r6）', '国土数値情報', 'R6推計', 'ファイル', 'エリアの将来性'),
  ('D12', 12, '学区', '小学校区（A27）', '国土数値情報', '2023', 'ファイル', '学区の候補（新潟市分が入っていれば）'),
  ('D13', 13, '学区', '中学校区（A32）', '国土数値情報', '2023', 'ファイル', '学区の候補（新潟市分が入っていれば）'),
  ('D14', 14, '学区', '通学区域一覧', '新潟市教育委員会', '2026-04', '手で整備', '住所で学区を確定'),
  ('D15', 15, '施設', '小学校', '国土数値情報 P29', '2023', 'ファイル', '最寄りまでの距離'),
  ('D16', 16, '施設', '中学校', '国土数値情報 P29', '2023', 'ファイル', '最寄りまでの距離'),
  ('D17', 17, '施設', '保育園', '国土数値情報 P14', '2023', 'ファイル', '1km以内の数・最寄り'),
  ('D18', 18, '施設', '地域型保育事業所', '国土数値情報 P14', '2023', 'ファイル', '1km以内の数・最寄り（P14に無ければ新潟市OD 2020-11）'),
  ('D19', 19, '施設', '幼稚園', '国土数値情報 P29', '2023', 'ファイル', '1km以内の数・最寄り'),
  ('D20', 20, '施設', '認定こども園', '国土数値情報 P29', '2023', 'ファイル', '1km以内の数・最寄り'),
  ('D21', 21, '施設', '放課後児童クラブ', '新潟市OD', '2017-03', 'ファイル', '最寄りまでの距離'),
  ('D22', 22, '施設', '公園・緑地', '新潟市OD', '2019-12', 'ファイル', '1km以内の数・最寄り'),
  ('D23', 23, '施設', '図書館', '新潟市OD', '2019-01', 'ファイル', '最寄りまでの距離'),
  ('D24', 24, '施設', '市役所・区役所', '国土数値情報 P05', '2022', 'ファイル', '最寄りまでの距離'),
  ('D25', 25, '交通', '鉄道・駅（N02）', '国土数値情報', '2025', 'ファイル', '最寄り駅（直線距離）'),
  ('D26', 26, '交通', '駅別乗降客数（S12）', '国土数値情報', '2024', 'ファイル', '駅の規模'),
  ('D27', 27, '交通', 'バス停留所（P11）', '国土数値情報', '2022', 'ファイル', '最寄りバス停・系統数'),
  ('D28', 28, '買い物', 'スーパー・ドラッグストア・コンビニ', 'OpenStreetMap（Geofabrik 中部地方）', '随時', 'ファイル（月1回）', '1km以内の数・最寄り（主に使用）'),
  ('D29', 29, '買い物', '大規模小売店舗一覧', '新潟県', '2026-09', 'PDF→座標', 'OSMに無い店を補う（同種の店が約200m以内に無ければ追加）'),
  ('D30', 30, '医療', '病院・診療所・歯科・薬局', '医療情報ネット', 'ダウンロード日', 'ファイル', '1km以内の全施設、3km以内の診療科ごとの最寄り'),
  ('D31', 31, '災害', '洪水浸水想定区域（A31a）', '国土数値情報', '2025', 'ファイル', '想定浸水深'),
  ('D33', 33, '災害', '土砂災害警戒区域（A33）', '国土数値情報', '2025', 'ファイル', '区域内かどうか'),
  ('D34', 34, '災害', '津波浸水想定（A40）', '国土数値情報', '2024', 'ファイル', '想定浸水深'),
  ('D35', 35, '災害', '液状化の発生傾向（XKT025）', '不動産情報ライブラリ', '2024-10', 'API', '液状化の傾向'),
  ('D36', 36, '災害', '大規模盛土造成地（A54）', '国土数値情報', '2023', 'ファイル', '盛土の上かどうか'),
  ('D38', 38, '災害', '液状化しやすさマップ', '北陸地方整備局', '未確認', 'PDF（参照のみ）', 'XKT025の確認用'),
  ('D39', 39, 'エリア', '町丁・字等の境界（小地域）', 'e-Stat 国勢調査', '2020', 'ファイル', '物件がどの町に入るかの判定、区内の町の平均件数の計算');

-- 設計まとめの「買い手・ローンの前提」
insert into public.datasets (id, category, name, provider, as_of, method, usage) values
  ('B01', '買い手', 'フラット35利用者調査', '住宅金融支援機構', '2025年度（2026-07公表）', 'ファイル', '頭金・返済負担率の実績'),
  ('B02', '買い手', '住宅市場動向調査', '国土交通省', '令和7年度（2026-07公表）', 'ファイル', '中古戸建を買った世帯の年収分布・年代、情報収集の仕方'),
  ('B03', '買い手', '民間住宅ローンの実態に関する調査', '国土交通省', '令和7年度（2026-03）', 'ファイル', '返済負担率の上限・完済年齢'),
  ('B04', '買い手', '変動金利', '各銀行の公表金利', '2026-10', '手で整備', '基本の金利'),
  ('B05', '買い手', 'フラット35の金利', '住宅金融支援機構', '2026-10', '手で整備', '慎重な場合の金利'),
  ('B06', '買い手', '情報通信メディアの利用時間と情報行動に関する調査', '総務省', '令和7年度（2026-06掲載）', 'ファイル', '年代別のSNS利用率、テレビ・新聞・ネットの重要度');

-- ライセンス表示（設計まとめ「ライセンス表示」）
update public.datasets set attribution = 'このサービスは、国土交通省の不動産情報ライブラリのAPI機能を使用していますが、提供情報の最新性、正確性、完全性等が保証されたものではありません'
  where id in ('D01', 'D04', 'D35');
update public.datasets set attribution = '出典：国土数値情報（国土交通省）を加工して作成（CC BY 4.0）'
  where provider like '国土数値情報%' and id <> 'D33';
update public.datasets set attribution = 'この国土数値情報（土砂災害警戒区域データ）は以下の著作物を改変して利用しています。土砂災害(特別)警戒区域、新潟県、国土数値情報、クリエイティブ・コモンズ・ライセンス 表示 4.0国際'
  where id = 'D33';
update public.datasets set attribution = '出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）。国勢調査（総務省統計局）を加工して作成'
  where provider = 'e-Stat 国勢調査';
update public.datasets set attribution = '出典：新潟市オープンデータ（CC BY 2.1 JP）を加工して作成'
  where provider = '新潟市OD';
update public.datasets set attribution = '© OpenStreetMap contributors（ODbL）'
  where id = 'D28';
update public.datasets set attribution = '出典：医療情報ネット（厚生労働省）（CC BY）を加工して作成'
  where id = 'D30';
