-- 物件と競合物件（設計書 7章の /properties/new、/research）
-- テスト物件は秘密保持契約の対象。seed.sql など Git に入るファイルには書かない

create table public.properties (
  id bigint generated always as identity primary key,
  name text not null,
  property_type text not null,        -- 例：新築戸建 / 中古戸建 / 土地
  price_man_yen integer,              -- 万円
  address text not null,
  geom extensions.geometry (Point, 4326),
  geocode_source text,                -- 住所から緯度経度を取ったサービス
  geocoded_at timestamptz,
  area_class text check (area_class in ('center', 'suburb', 'outer')),  -- 中心部・郊外・周辺。半径の初期値に使う
  layout text,                        -- 例：4LDK
  land_sqm numeric,
  building_sqm numeric,
  parking smallint,
  access text,                        -- 例：最寄り駅 徒歩12分
  features text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.properties using gist (geom);

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- 競合物件（手入力、物件ごとに3件まで）
create table public.competitors (
  id bigint generated always as identity primary key,
  property_id bigint not null references public.properties (id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  price_man_yen integer,
  location text,
  land_sqm numeric,
  building_sqm numeric,
  layout text,
  walk_min smallint,
  parking smallint,
  features text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, position)
);

create trigger competitors_set_updated_at
  before update on public.competitors
  for each row execute function public.set_updated_at();

alter table public.properties enable row level security;
alter table public.competitors enable row level security;
