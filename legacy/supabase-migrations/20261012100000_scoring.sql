-- 物件の評価を「採点ルール表」方式に置き換える（設計書 D35）
-- ペルソナ A〜H × 5つの層（物件・購入可能性・生活環境・市場・競合）× 重み ＋ 買い手の多さ で採点する
-- 元は BRUMBY様と作った Excel「採点ルール表」。最初に scripts/import-scoring-xlsx.ts で取り込み、その後は /rules の画面で直す
-- 古い rules・target_candidates・appeal_items は使わなくなるが、データは残す

-- ペルソナ（Excel：ペルソナ・年収分布・貯蓄分布・ペルソナの年代・買い手の多さ）
create table public.personas (
  id text primary key,                        -- A〜H
  label text not null,                        -- 例：小中学生のいる家族
  description text not null default '',       -- 世帯像・重視すること
  rep_age integer not null,                   -- 代表年齢（完済年齢から返済期間を決める）
  down_payment_rate numeric not null,         -- 想定頭金率（0.15 = 15%）
  purchase_method text not null default 'loan' check (purchase_method in ('loan', 'cash')),  -- 購入力の測り方
  income_dist jsonb not null default '[]',    -- 世帯年収の分布（10区分の割合。区分は lib/scoring/constants.ts）
  savings_dist jsonb not null default '[]',   -- 貯蓄の分布（19区分の割合。現金で買うペルソナだけ使う）
  age_mix jsonb not null default '{}',        -- 広告を見て判断する世帯主の年代構成 {"20代":0.4,...}
  buyer_share_new numeric,                    -- 新築の買い手での割合
  buyer_share_used numeric,                   -- 中古の買い手での割合
  notes jsonb not null default '{}',          -- 統計の区分・世帯数・買い手での割合などの根拠メモ
  sort_order integer not null default 0,
  enabled boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- 採点の項目と、ペルソナごとの重視度（Excel：項目の重視度）
create table public.scoring_items (
  key text primary key,                       -- 項目キー（例：駅_m）
  layer text not null check (layer in ('物件', '生活環境', '市場')),
  importance jsonb not null default '{}',     -- {"A":2,"B":3,...}（0〜3。0=関係ない）
  note text not null default '',
  sort_order integer not null default 0,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- 採点ルール（Excel：採点ルール）。1行＝1ルール。項目の値が下限〜上限なら該当
create table public.scoring_rules (
  id text primary key,                        -- R01〜
  layer text not null check (layer in ('物件', '生活環境', '市場')),
  item_key text not null references public.scoring_items (key) on update cascade,
  lower_bound numeric,                        -- 空欄は制限なし
  upper_bound numeric,
  reason text not null default '',            -- 根拠の表示文（画面の「評価理由」に出す）
  source text,                                -- 出典（値の取得元）
  fit jsonb not null default '{}',            -- ペルソナごとの適合度 {"A":"◎","B":"〇",...}（◎〇－△×）
  basis_class text check (basis_class in ('統計', '仮説', 'BRUMBY確認', 'BRUMBY実務')),  -- 点数の根拠区分
  basis_note text not null default '',
  exclusive_group text,                       -- 同時に該当しないルールのまとまり。空なら項目キー
  sort_order integer not null default 0,
  enabled boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- 数値の設定（Excel：層の重み・購入前提・予算の決め方・媒体配分の上位数・反響係数の開始件数）
create table public.scoring_params (
  key text primary key,                       -- 例：weight_物件、金利、基準率
  category text not null check (category in ('layer_weight', 'purchase', 'budget', 'media')),
  label text not null,
  value numeric not null,
  note text not null default '',
  sort_order integer not null default 0,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- 競合と比べる項目（Excel：競合重視度）
create table public.competitor_items (
  key text primary key,                       -- 例：価格_万円
  label text not null,
  direction smallint not null check (direction in (-1, 1)),  -- 1=大きいほど有利、-1=小さいほど有利
  importance jsonb not null default '{}',     -- {"A":3,...}
  tie_margin numeric not null default 0,      -- 差がこれ以内なら引き分け
  note text not null default '',
  sort_order integer not null default 0,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- 区×築年数区分の取引の中央値（Excel：相場・周辺の取引）
create table public.market_reference (
  ward text not null,                         -- 例：中央区
  age_class text not null check (age_class in ('新築', '築2〜20年', '築21年以上')),
  price_man_yen numeric not null,
  building_sqm numeric,
  land_sqm numeric,
  age_years numeric,
  n integer,                                  -- 件数
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (ward, age_class)
);

-- 町ごとの人気スコア（Excel：エリア人気）
create table public.area_popularity (
  ward text not null,
  town text not null,
  score numeric not null,                     -- 0〜100
  city_rank integer,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (ward, town)
);

-- 媒体（Excel：媒体）
create table public.media_channels (
  id text primary key,                        -- 例：instagram
  label text not null,                        -- 例：Instagram広告
  stat_name text,                             -- 年代別の利用率の統計名（media_usage_rates）。空なら一律の届きやすさ
  flat_reach numeric,                         -- 一律の届きやすさ（統計がない媒体）
  enabled boolean not null default true,
  format_example text not null default '',    -- 形式の例（AIが広告案に使う）
  source text not null default '',
  sort_order integer not null default 0,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- 年代別の媒体の利用率（Excel：媒体の利用率）
create table public.media_usage_rates (
  stat_name text primary key,                 -- 例：Instagram
  rates jsonb not null,                       -- {"20代":82.6,...,"70代":15.8}（%）
  all_ages numeric not null,                  -- 全年代（%）
  metric text not null default '利用率',
  updated_by text,
  updated_at timestamptz not null default now()
);

-- 反響の記録（Excel：反響の記録）。問い合わせ1件あたりの費用から反響係数を出す
create table public.media_results (
  id bigint generated always as identity primary key,
  property_id bigint references public.properties (id) on delete set null,
  media_id text not null references public.media_channels (id) on update cascade,
  started_on date,
  cost_yen integer not null default 0 check (cost_yen >= 0),
  inquiries integer not null default 0 check (inquiries >= 0),
  visits integer not null default 0 check (visits >= 0),
  contracts integer not null default 0 check (contracts >= 0),
  memo text,
  entered_by text,
  created_at timestamptz not null default now()
);

-- BRUMBY様の判断（Excel：BRUMBY判断）。AIの結果との一致率とズレの原因を見る
create table public.brumby_judgments (
  id bigint generated always as identity primary key,
  property_id bigint not null references public.properties (id) on delete cascade,
  run_id bigint references public.analysis_runs (id) on delete set null,  -- 判断したときに見ていた分析
  judged_on date not null default current_date,
  judge text not null,
  targets text[] not null default '{}',       -- 第1〜第3ターゲット（ペルソナID）
  appeals text[] not null default '{}',       -- 主な訴求①〜③（競合と比べる項目キー、または自由記述）
  media text[] not null default '{}',         -- 推奨媒体①②（媒体ID）
  comment text,                               -- AIとのズレの理由・コメント
  created_at timestamptz not null default now()
);

-- 変更履歴（Excel：変更履歴）。トリガーで変更前後を残し、画面から入れた理由・関連物件も残す
-- 理由などは、同じトランザクションで set_config('brumby.change_reason', …, true) を呼んで渡す
create table public.scoring_revisions (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_key text not null,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  before jsonb,
  after jsonb,
  reason text,
  related_property text,
  changed_by text,
  changed_at timestamptz not null default now()
);

create or replace function public.track_scoring_revision()
returns trigger
language plpgsql
as $$
declare
  before_row jsonb;
  after_row jsonb;
  r jsonb;
  row_key text;
begin
  if tg_op = 'UPDATE' then
    new.updated_at = now();
  end if;
  if tg_op <> 'INSERT' then before_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then after_row := to_jsonb(new); end if;
  r := coalesce(after_row, before_row);
  -- 表ごとに主キーの列が違うので、jsonb から取り出す
  row_key := case tg_table_name
    when 'market_reference' then (r ->> 'ward') || '/' || (r ->> 'age_class')
    when 'area_popularity' then (r ->> 'ward') || '/' || (r ->> 'town')
    when 'media_usage_rates' then r ->> 'stat_name'
    else coalesce(r ->> 'id', r ->> 'key')
  end;
  insert into public.scoring_revisions (table_name, row_key, operation, before, after, reason, related_property, changed_by)
  values (
    tg_table_name,
    row_key,
    lower(tg_op),
    before_row,
    after_row,
    nullif(current_setting('brumby.change_reason', true), ''),
    nullif(current_setting('brumby.related_property', true), ''),
    nullif(current_setting('brumby.changed_by', true), '')
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger personas_track_revision before insert or update or delete on public.personas
  for each row execute function public.track_scoring_revision();
create trigger scoring_items_track_revision before insert or update or delete on public.scoring_items
  for each row execute function public.track_scoring_revision();
create trigger scoring_rules_track_revision before insert or update or delete on public.scoring_rules
  for each row execute function public.track_scoring_revision();
create trigger scoring_params_track_revision before insert or update or delete on public.scoring_params
  for each row execute function public.track_scoring_revision();
create trigger competitor_items_track_revision before insert or update or delete on public.competitor_items
  for each row execute function public.track_scoring_revision();
create trigger market_reference_track_revision before insert or update or delete on public.market_reference
  for each row execute function public.track_scoring_revision();
create trigger area_popularity_track_revision before insert or update or delete on public.area_popularity
  for each row execute function public.track_scoring_revision();
create trigger media_channels_track_revision before insert or update or delete on public.media_channels
  for each row execute function public.track_scoring_revision();
create trigger media_usage_rates_track_revision before insert or update or delete on public.media_usage_rates
  for each row execute function public.track_scoring_revision();

-- 物件：採点に使う値（D35）。自動で取れない値は manual_metrics に手入力する
alter table public.properties
  add column age_years smallint check (age_years >= 0),   -- 築年数（新築=0）
  add column rooms smallint check (rooms >= 0),           -- 居室数。空なら layout（例：4LDK）から読む
  add column is_hiraya boolean,                           -- 平屋
  add column has_garden boolean,                          -- 庭あり
  add column ward text,                                   -- 区（例：中央区）
  add column town text,                                   -- 町（例：上近江。エリア人気に使う）
  add column manual_metrics jsonb not null default '{}';  -- 手入力の値 {"バス停_m":250,...}。自動の値より優先

-- 競合物件：築年数（競合と比べる項目。新築=0）
alter table public.competitors
  add column age_years smallint check (age_years >= 0);

-- 分析：どの版の採点設定で計算したか（scoring_revisions の最後の id）
alter table public.analysis_runs
  add column scoring_version bigint;

alter table public.personas enable row level security;
alter table public.scoring_items enable row level security;
alter table public.scoring_rules enable row level security;
alter table public.scoring_params enable row level security;
alter table public.competitor_items enable row level security;
alter table public.market_reference enable row level security;
alter table public.area_popularity enable row level security;
alter table public.media_channels enable row level security;
alter table public.media_usage_rates enable row level security;
alter table public.media_results enable row level security;
alter table public.brumby_judgments enable row level security;
alter table public.scoring_revisions enable row level security;
