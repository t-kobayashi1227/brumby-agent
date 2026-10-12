-- 市の通学区域（町名・丁目・地番 → 小学校・中学校）。
-- 国土数値情報の小学校区・中学校区（XKT004・005）に入っていない新潟市・長岡市を補う。
-- 出典・対象の市・取り込み状態は既存の dataset_versions で管理する（coverage は city:15100 など）。
create table public.school_zones (
  id bigint generated always as identity primary key,
  dataset_version_id bigint not null
    references public.dataset_versions (id) on delete cascade,
  city_code text not null,            -- 15100（新潟市）、15202（長岡市）
  -- 町のある区。同じ町名が複数の区にあるとき（大潟は西区と西蒲区）だけ入れ、ほかは null。
  -- 町名欄に「（東区）」の注記があればそれ、なければ学校ページの区（学校のある区）。
  -- 引くときは「区が空か、住所の区と一致する行」を使い、それがなければ区を見ない
  ward text,
  town text not null,                 -- 青山、古町通、五十嵐1の町（丁目・番町・ノ町は chome に分ける）
  chome integer,                      -- 7（丁目・番町・ノ町がない町は null）。「5・6丁目」は1丁目ずつ1行にする
  town_text text not null,            -- 元の町名欄：「青山5・6丁目」「紫竹2丁目（東区）」
  lot_scope text not null check (lot_scope in ('all', 'partial')),  -- 地番等が「全部」か一部か
  lot_text text not null,             -- 元の地番等：「全部」「1番／2番1号～8号」
  -- 読み取れた地番の範囲。[{"ban":[1,1]},{"ban":[2,2],"go":[[1,8]]}]
  -- 全部のときと、書き方が複雑で読み取れなかったときは null（lot_scope で見分ける）
  lot_ranges jsonb check (lot_ranges is null or jsonb_typeof(lot_ranges) = 'array'),
  elementary_school text not null,    -- 青山小学校
  junior_high_school text not null,   -- 関屋中学校
  source_url text not null,           -- 取ってきた学校ページ
  created_at timestamptz not null default now()
);

create index school_zones_lookup_idx
  on public.school_zones (dataset_version_id, city_code, town, chome);

alter table public.school_zones enable row level security;
