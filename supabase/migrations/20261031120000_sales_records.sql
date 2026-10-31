-- 販売の記録（docs/設計まとめ.md「販売の記録」）
-- 実際に運用した結果を物件ごとに残す。いまは記録だけで、AI には渡さない（2026-10-31 小林さんと決定）
-- 貯まったら、プログラムが集計して事実にする（媒体ごとの費用の目安、問い合わせ1件あたりの費用など）

-- 物件ごとの販売の結果（1物件1行）
create table public.sales_records (
  property_id bigint primary key references public.properties (id) on delete cascade,
  status text not null default '販売中' check (status in ('販売前', '販売中', '成約', '販売中止')),
  listed_on date,                       -- 販売開始日
  list_price_man_yen integer check (list_price_man_yen > 0),    -- 販売開始時の価格
  price_cut_count smallint not null default 0 check (price_cut_count >= 0),  -- 値下げの回数
  final_price_man_yen integer check (final_price_man_yen > 0),  -- 最後の売出価格（値下げ後）
  contracted_on date,                   -- 成約日
  contract_price_man_yen integer check (contract_price_man_yen > 0),  -- 成約価格
  -- 買主のこと（わかる範囲で。空は「不明」）
  buyer_age_band text check (buyer_age_band in ('20代以下', '30代', '40代', '50代', '60代', '70代以上')),
  buyer_household text,                 -- ターゲット候補の名前か「その他」
  buyer_first_media_id text references public.media (id),  -- 買主が最初にこの物件を知った媒体
  buyer_first_media_other text,         -- 媒体一覧にない媒体のときの名前
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contracted_on is null or listed_on is null or contracted_on >= listed_on),
  check (buyer_first_media_id is null or buyer_first_media_other is null)
);

create trigger sales_records_set_updated_at
  before update on public.sales_records
  for each row execute function public.set_updated_at();

-- 媒体ごとの実績（物件×媒体×期間。ポータルの月ごとの報告をそのまま1行にできる）
create table public.media_results (
  id bigint generated always as identity primary key,
  property_id bigint not null references public.properties (id) on delete cascade,
  media_id text references public.media (id),  -- 媒体一覧（C-01〜C-16）
  other_name text,                      -- 媒体一覧にない媒体（地元の媒体など）の名前
  started_on date not null,
  ended_on date,
  cost_man_yen numeric(8, 1) check (cost_man_yen >= 0),  -- 実際にかけた費用（0.1万円単位）
  reach_count integer check (reach_count >= 0),          -- 表示回数・配布部数
  views integer check (views >= 0),                      -- 物件ページの閲覧数
  inquiries integer check (inquiries >= 0),              -- 問い合わせ件数
  viewings integer check (viewings >= 0),                -- 内見件数
  note text,
  created_at timestamptz not null default now(),
  check ((media_id is null) <> (other_name is null)),
  check (ended_on is null or ended_on >= started_on)
);

create index on public.media_results (property_id);

alter table public.sales_records enable row level security;
alter table public.media_results enable row level security;
