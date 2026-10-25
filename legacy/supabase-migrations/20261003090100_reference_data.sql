-- 先に取り込む公開データ（設計書 4.2）：町丁目の境界、国勢調査、取引価格、地価
-- 座標はすべて WGS84（EPSG:4326）で持つ。面積・距離は geography にキャストして計算する

-- 町丁目の境界（e-Stat 国勢調査2020 小地域）
create table public.areas (
  id bigint generated always as identity primary key,
  dataset_version_id bigint not null references public.dataset_versions (id) on delete cascade,
  key_code text not null,             -- 小地域の KEY_CODE。census_values と結びつける
  pref_code text not null,
  city_code text not null,
  city_name text not null,            -- 例：新潟市中央区
  name text,                          -- 町丁字名（S_NAME）。水面などは空になる
  hcode smallint,                     -- 8101：町丁目、8154：水面 など
  geom extensions.geometry (MultiPolygon, 4326) not null,
  unique (dataset_version_id, key_code)
);

create index on public.areas using gist (geom);
create index on public.areas (city_code, name);

-- 国勢調査2020（小地域）の値。項目を増やしても列を足さずに済むよう縦持ちにする
create table public.census_values (
  dataset_version_id bigint not null references public.dataset_versions (id) on delete cascade,
  key_code text not null,
  stat_key text not null,             -- 例：pop_total / age_30_49 / hh_couple_with_children / hh_rented
  value numeric,                      -- 秘匿（X）や該当なし（-）は null
  primary key (dataset_version_id, key_code, stat_key)
);

-- 取引価格（不動産情報ライブラリ XIT001）。緯度経度はなく地区名だけなので、町丁目への対応を別に持つ
create table public.transactions (
  id bigint generated always as identity primary key,
  dataset_version_id bigint not null references public.dataset_versions (id) on delete cascade,
  row_hash text not null,             -- 生データの行のハッシュ。二重に読み込まないため
  price_category text,                -- 取引価格情報 / 成約価格情報
  type text,                          -- 例：宅地(土地と建物) / 中古マンション等
  municipality_code text not null,
  municipality text,
  district_name text,
  year smallint not null,
  quarter smallint not null check (quarter between 1 and 4),
  trade_price bigint,                 -- 円
  unit_price numeric,                 -- 円/㎡（土地）
  area_sqm numeric,                   -- 「2000㎡以上」などの表記は null にして raw に残す
  total_floor_area_sqm numeric,
  building_year smallint,
  floor_plan text,
  structure text,
  land_shape text,
  frontage_m numeric,
  city_planning text,
  coverage_ratio numeric,
  floor_area_ratio numeric,
  raw jsonb not null,
  area_id bigint references public.areas (id) on delete set null,
  area_match text check (area_match in ('exact', 'normalized', 'manual', 'none')),
  unique (dataset_version_id, row_hash)
);

create index on public.transactions (municipality_code, district_name);
create index on public.transactions (year, quarter);
create index on public.transactions (area_id);

-- 地価公示・地価調査（不動産情報ライブラリ XPT002）
create table public.land_prices (
  id bigint generated always as identity primary key,
  dataset_version_id bigint not null references public.dataset_versions (id) on delete cascade,
  survey_type text not null check (survey_type in ('公示', '調査')),
  point_id text not null,             -- 標準地・基準地の番号
  year smallint not null,
  price_per_sqm integer,              -- 円/㎡
  change_rate numeric,                -- 前年からの変動率（%）
  use_category text,                  -- 例：住宅地 / 商業地
  city_code text,
  address text,
  geom extensions.geometry (Point, 4326) not null,
  raw jsonb not null,
  unique (dataset_version_id, survey_type, point_id, year)
);

create index on public.land_prices using gist (geom);
create index on public.land_prices (point_id, year);

alter table public.areas enable row level security;
alter table public.census_values enable row level security;
alter table public.transactions enable row level security;
alter table public.land_prices enable row level security;
