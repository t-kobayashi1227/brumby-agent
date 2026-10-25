-- 事前に取り込む公的データ（docs/設計まとめ.md ②）。物件ごとには、ここを PostGIS の SQL で検索する
-- 取り込むたびに入れ替えるので、行にはすべて dataset_id を付ける。元の行は raw に残す

-- 町の境界（D39 e-Stat 小地域）。物件がどの町に入るかの判定と、区内の町の平均件数の計算に使う
create table public.towns (
  key_code text primary key,          -- 小地域の KEY_CODE
  dataset_id text not null references public.datasets (id),
  city_code text not null,            -- 例：15104（新潟市西区）
  ward text not null,                 -- 例：西区
  name text,                          -- 町丁字名（S_NAME）。水面などは空になる
  hcode smallint,                     -- 8101：町丁目、8154：水面 など
  geom extensions.geometry (MultiPolygon, 4326) not null,
  center extensions.geography (Point, 4326) not null  -- 町の中心（区内の町の平均件数を数える起点）
);

create index on public.towns using gist (geom);
create index on public.towns (ward, name);

-- 町・区の統計（D05〜D10）。項目を増やしても列を足さずに済むよう縦持ちにする
create table public.area_stats (
  id bigint generated always as identity primary key,
  dataset_id text not null references public.datasets (id) on delete cascade,
  area_level text not null check (area_level in ('町', '区', '市')),
  area_key text not null,             -- 町は KEY_CODE（無ければ町名）、区は「西区」、市は「新潟市」
  ward text,                          -- 町と区のときの区名
  area_name text not null,            -- 表示用の名前
  metric text not null,               -- 例：0〜14歳の割合 / 持ち家率 / 夫婦と子の世帯数
  value numeric,                      -- 秘匿（X）や該当なし（-）は null
  unit text,                          -- 例：% / 人 / 世帯
  raw jsonb,
  unique (dataset_id, area_level, area_key, metric)
);

create index on public.area_stats (area_level, area_key);

-- 250mメッシュの将来推計人口（D11）
create table public.population_mesh (
  mesh_code text primary key,
  dataset_id text not null references public.datasets (id),
  geom extensions.geometry (MultiPolygon, 4326) not null,
  population jsonb not null           -- 例：{"2020": 120, "2035": 98, "2050": 75}
);

create index on public.population_mesh using gist (geom);

-- 施設（D15〜D30、駅 D25・バス停 D27 も含む）。1km以内の件数・一覧、3km以内の最寄りを出す
create table public.facilities (
  id bigint generated always as identity primary key,
  dataset_id text not null references public.datasets (id) on delete cascade,
  kind text not null check (kind in (
    '小学校', '中学校', '保育園', '地域型保育', '幼稚園', '認定こども園', '放課後児童クラブ',
    '公園', '図書館', '役所', '駅', 'バス停',
    'スーパー', 'ドラッグストア', 'コンビニ', '大規模小売店舗',
    '病院', '診療所', '歯科', '薬局'
  )),
  name text not null,
  address text,
  departments text[],                 -- 医療の診療科（例：{内科,小児科}）。医療以外は null
  attrs jsonb,                        -- 種類ごとの値（駅の乗降客数、バス停の系統数、路線名など）
  source_ref text,                    -- 元データの番号（OSM の id など）。二重に入れないため
  geog extensions.geography (Point, 4326) not null,
  raw jsonb
);

create index on public.facilities using gist (geog);
create index on public.facilities (kind);
create index on public.facilities using gin (departments);
create unique index facilities_source_ref on public.facilities (dataset_id, kind, source_ref) where source_ref is not null;

-- 区内の町の平均件数（町の中心から 1km 以内の件数の平均）。段階2で towns と facilities から計算して保存する
create table public.ward_facility_averages (
  ward text not null,
  kind text not null,
  radius_m integer not null default 1000,
  avg_count numeric not null,
  town_count integer not null,        -- 平均に使った町の数
  computed_at timestamptz not null default now(),
  primary key (ward, kind, radius_m)
);

-- 区域（D04 用途地域、D12・D13 学区、D31〜D36 災害）。点が入るかを判定する
create table public.zones (
  id bigint generated always as identity primary key,
  dataset_id text not null references public.datasets (id) on delete cascade,
  kind text not null check (kind in (
    '用途地域', '小学校区', '中学校区',
    '洪水浸水想定', '土砂災害警戒区域', '津波浸水想定', '液状化の傾向', '大規模盛土造成地'
  )),
  label text not null,                -- 事実の値にそのまま使う文言（例：第一種低層住居専用地域 / 0.5〜3.0m / 特別警戒区域）
  attrs jsonb,                        -- 浸水深の下限・上限、学校名など
  geom extensions.geometry (MultiPolygon, 4326) not null,
  raw jsonb
);

create index on public.zones using gist (geom);
create index on public.zones (kind);

-- 通学区域一覧（D14 新潟市教育委員会）。小林さんが整備する。住所で学区を確定する
create table public.school_zone_rules (
  id bigint generated always as identity primary key,
  dataset_id text not null references public.datasets (id) on delete cascade,
  ward text,
  town_name text not null,            -- 例：寺尾東三丁目
  block_range text,                   -- 番地の範囲（一覧の書き方のまま。町全体なら null）
  school_level text not null check (school_level in ('小学校', '中学校')),
  school_name text not null,
  note text
);

create index on public.school_zone_rules (town_name);

-- 取引価格・成約価格（D01 XIT001）。緯度経度はなく地区名だけなので、町への対応を別に持つ
create table public.transactions (
  id bigint generated always as identity primary key,
  dataset_id text not null references public.datasets (id) on delete cascade,
  row_hash text not null,             -- 元の行のハッシュ。二重に入れないため
  price_category text,                -- 取引価格情報 / 成約価格情報
  type text,                          -- 例：宅地(土地と建物) / 中古マンション等
  municipality_code text not null,
  ward text,
  district_name text,
  year smallint not null,
  quarter smallint not null check (quarter between 1 and 4),
  trade_price bigint,                 -- 円
  land_sqm numeric,
  floor_sqm numeric,
  building_year smallint,             -- 建築年（西暦）。築年数帯は取引の年との差で出す
  floor_plan text,
  structure text,
  raw jsonb not null,
  town_key_code text references public.towns (key_code) on delete set null,
  town_match text check (town_match in ('一致', '表記ゆれを直して一致', '手で対応', '対応なし')),
  unique (dataset_id, row_hash)
);

create index on public.transactions (ward, district_name);
create index on public.transactions (town_key_code);
create index on public.transactions (year, quarter);

-- 地価公示・都道府県地価調査（D02 L01、D03 L02）
create table public.land_prices (
  id bigint generated always as identity primary key,
  dataset_id text not null references public.datasets (id) on delete cascade,
  point_id text not null,             -- 標準地・基準地の番号
  year smallint not null,
  price_per_sqm integer,              -- 円/㎡
  change_rate numeric,                -- 前年からの変動率（%）
  use_category text,                  -- 例：住宅地 / 商業地
  address text,
  geog extensions.geography (Point, 4326) not null,
  raw jsonb not null,
  unique (dataset_id, point_id, year)
);

create index on public.land_prices using gist (geog);

-- 買い手・媒体の統計（B01〜B06）。年収分布、買主の年代、媒体の年代別利用率など
create table public.reference_stats (
  id bigint generated always as identity primary key,
  dataset_id text not null references public.datasets (id) on delete cascade,
  category text not null,             -- 例：年収分布 / 買主の年代 / 媒体の利用率
  segment text not null,              -- 例：中古戸建を買った世帯 / 30代
  item text not null,                 -- 例：400〜500万円 / Instagram
  value numeric,
  unit text,                          -- 例：%
  sort smallint,
  unique (dataset_id, category, segment, item)
);

alter table public.towns enable row level security;
alter table public.area_stats enable row level security;
alter table public.population_mesh enable row level security;
alter table public.facilities enable row level security;
alter table public.ward_facility_averages enable row level security;
alter table public.zones enable row level security;
alter table public.school_zone_rules enable row level security;
alter table public.transactions enable row level security;
alter table public.land_prices enable row level security;
alter table public.reference_stats enable row level security;
