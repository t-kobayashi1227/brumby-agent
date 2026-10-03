-- データの版の管理と取り込みの記録（設計書 4.3・4.4）

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

-- 取り込んだデータの版。データの行にはすべて dataset_version_id を付ける
create table public.dataset_versions (
  id bigint generated always as identity primary key,
  source text not null,               -- 例：reinfolib / estat / osm
  dataset text not null,              -- 例：XIT001 / census2020_small_area
  coverage text not null,             -- 例：pref:15
  period text,                        -- 例：2015Q1-2026Q1
  fetched_at timestamptz not null default now(),
  source_published_at date,
  attribution text not null,          -- 画面に出す出典の文言
  raw_uri text,                       -- 生データの保存先（Supabase Storage）
  row_count integer,
  status text not null default 'loading'
    check (status in ('loading', 'active', 'archived')),
  created_at timestamptz not null default now()
);

-- 同じデータの「使用中」は1つだけ。切り替えは archived → active の順に1つのトランザクションで行う
create unique index dataset_versions_one_active
  on public.dataset_versions (source, dataset, coverage)
  where status = 'active';

-- 取り込むたびの記録（確認1の材料）
create table public.ingest_logs (
  id bigint generated always as identity primary key,
  dataset_version_id bigint references public.dataset_versions (id) on delete cascade,
  command text not null,              -- 実行したコマンドと引数
  status text not null check (status in ('succeeded', 'failed')),
  row_count integer,
  null_ratios jsonb,                  -- 例：{"district_name":0.02,"area_sqm":0.11}
  near_property_counts jsonb,         -- 例：{"<property_id>":{"r1000":24}}
  error text,
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);

create index on public.ingest_logs (dataset_version_id);

-- XKT系（地図タイル単位のAPI）の取得結果。初回に取得して保存し、以後はここから読む
create table public.tile_cache (
  id bigint generated always as identity primary key,
  dataset_version_id bigint not null references public.dataset_versions (id) on delete cascade,
  api_id text not null,               -- 例：XKT002
  z smallint not null,
  x integer not null,
  y integer not null,
  payload jsonb not null,             -- GeoJSON
  fetched_at timestamptz not null default now(),
  unique (dataset_version_id, api_id, z, x, y)
);

alter table public.dataset_versions enable row level security;
alter table public.ingest_logs enable row level security;
alter table public.tile_cache enable row level security;
