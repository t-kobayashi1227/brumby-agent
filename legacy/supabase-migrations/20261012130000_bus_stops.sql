-- 国土数値情報 P11（バス停留所）の地点データ。
-- 出典・対象地域・作成年・取り込み状態は既存の dataset_versions で管理する。
create table public.bus_stops (
  id bigint generated always as identity primary key,
  dataset_version_id bigint not null
    references public.dataset_versions (id) on delete cascade,
  -- P11-22_15.geojson に地物IDがないため、取り込み時にファイル内の順番を文字列にする。
  source_feature_id text not null,
  name text not null,                 -- P11_001：バス停名
  operator_name text,                -- P11_002：バス事業者名
  -- P11_003_01～35（系統）と P11_004_01～35（区分）を同じ番号で対応付けた配列。
  routes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(routes) = 'array'),
  note text,                         -- P11_005：備考
  geom extensions.geometry (Point, 4326) not null,
  raw jsonb not null                 -- 元の properties を保持し、属性変更時に再利用する
    check (jsonb_typeof(raw) = 'object'),
  created_at timestamptz not null default now(),
  unique (dataset_version_id, source_feature_id)
);

create index bus_stops_dataset_version_idx
  on public.bus_stops (dataset_version_id);

-- 距離（m）での半径検索に使う。geom 自体は既存の位置データと同じ EPSG:4326。
create index bus_stops_geography_idx
  on public.bus_stops using gist ((geom::extensions.geography));

alter table public.bus_stops enable row level security;
