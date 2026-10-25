-- 物件の周りの公開データ（不動産情報ライブラリ XKT系）
-- 物件が登録されたときに、その周りのタイルをAPIから取り、物件の近くの地物だけを保存する
-- 洪水浸水想定などはタイル1枚が数MBあるため、タイルを丸ごとは保存しない（設計書 4.2 の tile_cache の代わり）

drop table public.tile_cache;

-- 地物（学校、用途地域の区域、浸水想定の区域 など）。APIごとに版を1つ持ち、物件が増えるたびに地物が足されていく
create table public.geo_features (
  id bigint generated always as identity primary key,
  dataset_version_id bigint not null references public.dataset_versions (id) on delete cascade,
  api_id text not null,               -- 例：XKT006（学校）
  feature_id text not null,           -- APIの _id。同じ地物を二重に保存しないため
  geom extensions.geometry (Geometry, 4326) not null,
  properties jsonb not null,          -- APIの属性そのまま（学校名、浸水深ランク など）
  fetched_at timestamptz not null default now(),
  unique (dataset_version_id, api_id, feature_id)
);

create index on public.geo_features using gist (geom);
create index on public.geo_features (api_id);

-- 物件ごと・APIごとの取得の記録。どこまで取ったか、何件取れたか（確認1の材料）
create table public.property_fetches (
  property_id bigint not null references public.properties (id) on delete cascade,
  api_id text not null,
  dataset_version_id bigint references public.dataset_versions (id) on delete set null,
  mode text not null check (mode in ('radius', 'point')),  -- radius：半径で数える / point：物件の地点で判定する
  keep_m integer not null,            -- 物件から何m以内の地物を保存したか
  zoom smallint not null,
  tiles integer not null,             -- 取得したタイルの枚数
  features_in_tiles integer not null, -- タイルに入っていた地物の数
  features_kept integer not null,     -- 保存した（物件の近くにあった）地物の数
  status text not null check (status in ('ok', 'empty', 'failed')),
  error text,
  fetched_at timestamptz not null default now(),
  primary key (property_id, api_id)
);

alter table public.geo_features enable row level security;
alter table public.property_fetches enable row level security;
