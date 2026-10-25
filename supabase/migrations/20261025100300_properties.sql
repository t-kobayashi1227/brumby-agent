-- 物件と、その交通・競合物件（docs/設計まとめ.md「①物件情報の入力」の15項目）
-- テスト物件は秘密保持契約の対象。seed など Git に入るファイルには書かない

create table public.properties (
  id bigint generated always as identity primary key,
  code text unique,                   -- 物件ID（例：BR-2026-0001）。作るときにトリガーで付ける
  property_class text not null check (property_class in ('新築', '中古')),
  price_man_yen integer not null check (price_man_yen > 0),
  address text not null,
  -- 位置。住所検索で出し、地図のピンで直したら location_source を「手で修正」にする
  geog extensions.geography (Point, 4326),
  location_source text check (location_source in ('住所検索', '手で修正')),
  geocode_title text,                 -- 住所検索で当たった住所の表記
  layout text not null,               -- 入力のまま（例：4LDK+S）
  rooms smallint,                     -- 居室の数（4LDK+S なら 4）
  storerooms smallint,                -- 納戸の数（+S なら 1）
  building_sqm numeric not null check (building_sqm > 0),
  land_sqm numeric not null check (land_sqm > 0),
  parking smallint not null check (parking >= 0),
  building_age smallint not null check (building_age >= 0),  -- 新築は 0
  floors text not null check (floors in ('平屋', '2階建', '3階建以上')),
  has_garden boolean not null,
  renovated boolean not null,
  renovation_year smallint,
  renovation_parts text[] check (renovation_parts <@ array['キッチン', '浴室', 'トイレ', '洗面', '内装全面', '外壁', '屋根', 'その他']),
  features text,                      -- 特徴ピックアップ（物件資料のまとめ書きのまま）
  ad_budget_man_yen integer check (ad_budget_man_yen > 0),  -- 広告予算の総額（任意）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- リフォーム「あり」のときだけ年と箇所を持つ
  check (renovated or (renovation_year is null and renovation_parts is null))
);

create index on public.properties using gist (geog);

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- 物件ID（BR-年-番号）を付ける。id は既定値で先に決まっているので、BEFORE INSERT で使える
create or replace function public.set_property_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null then
    new.code = 'BR-' || to_char(now() at time zone 'Asia/Tokyo', 'YYYY') || '-' || lpad(new.id::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger properties_set_code
  before insert on public.properties
  for each row execute function public.set_property_code();

-- 交通（最大2つ）。物件資料の「新潟交通バス「○○」停 徒歩3分」をそのまま移せる形
create table public.property_transports (
  property_id bigint not null references public.properties (id) on delete cascade,
  position smallint not null check (position in (1, 2)),
  mode text not null check (mode in ('電車', 'バス')),
  line text,                          -- 路線名（例：JR越後線 / 新潟交通バス）
  stop_name text not null,            -- 駅またはバス停の名前
  walk_min smallint not null check (walk_min >= 0),  -- 物件資料の徒歩分（広告の表記に使う）
  primary key (property_id, position)
);

-- 競合物件（任意・複数）。住所から位置を出し、物件との直線距離を事実にする
create table public.competitors (
  id bigint generated always as identity primary key,
  property_id bigint not null references public.properties (id) on delete cascade,
  position smallint not null check (position >= 1),
  price_man_yen integer check (price_man_yen > 0),
  address text,
  geog extensions.geography (Point, 4326),
  building_sqm numeric check (building_sqm > 0),
  land_sqm numeric check (land_sqm > 0),
  building_age smallint check (building_age >= 0),
  created_at timestamptz not null default now(),
  unique (property_id, position)
);

alter table public.properties enable row level security;
alter table public.property_transports enable row level security;
alter table public.competitors enable row level security;
