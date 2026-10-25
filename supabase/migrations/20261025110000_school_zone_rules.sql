-- 通学区域一覧（D14 新潟市教育委員会）の表を作り直す（2026-10-25 小林さんと決定）
-- 市のホームページの通学区域の表（町名・地番等 → 小学校・中学校）を読み取って入れ、物件の住所と照らし合わせて学区を決める
-- 市の表は「小学校／中学校」の組ごとに1ページで、1行が「町名（丁目）・地番等」。そのため1行に小学校と中学校を両方持つ
-- 前の形（1行に1校、番地は文字のまま）では住所と照らし合わせられないので、丁目と地番の範囲を分けて持つ形にする（表は空のため作り直す）

drop table public.school_zone_rules;

create table public.school_zone_rules (
  id bigint generated always as identity primary key,
  dataset_id text not null references public.datasets (id) on delete cascade,
  ward text,                          -- 町の区。複数の区にある町名（例：大潟）だけ入れる。それ以外は null
  town text not null,                 -- 町名（丁目を除く。例：青山）
  chome smallint,                     -- 丁目（番町・ノ町も同じに扱う）。丁目のない行は null
  town_text text not null,            -- 表の町名欄のまま（例：青山5・6丁目）
  lot_scope text not null check (lot_scope in ('全部', '一部')),
  lot_text text not null,             -- 表の地番等欄のまま（例：1番／2番1号～8号）
  lot_ranges jsonb,                   -- 読み取った番・号の範囲（例：[{"ban":[2,2],"go":[[1,8]]}]）。読み取れない書き方は null
  elementary_school text not null,
  junior_high_school text not null,
  source_url text not null            -- 読み取った市のページ
);

create index on public.school_zone_rules (town);

alter table public.school_zone_rules enable row level security;
