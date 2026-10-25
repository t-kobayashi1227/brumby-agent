-- 分析の実行、事実カード、ルール表、AIの文章、評価（設計書 5章・6章・7章）

-- 分析の実行。条件を変えた再実行は新しい行にし、古い結果は残す
create table public.analysis_runs (
  id bigint generated always as identity primary key,
  property_id bigint not null references public.properties (id) on delete cascade,
  params jsonb not null,              -- 例：{"radius_m":1000,"price_min_n":10,"price_years":3}
  dataset_version_ids bigint[] not null,
  rules_version bigint,               -- 実行時の rule_revisions の最大 id
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  stage text check (stage in ('analyze', 'rules', 'ai', 'verify')),  -- 進み具合の表示用
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index on public.analysis_runs (property_id, created_at desc);

-- 事実カード（kind=fact）と判断カード（kind=decision）。AIとレポートはカードの数字だけを使う
create table public.facts (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.analysis_runs (id) on delete cascade,
  seq integer not null,               -- 画面の番号（F-07 の 7）
  key text not null,                  -- 例：target.family_with_children_ratio
  kind text not null default 'fact' check (kind in ('fact', 'decision')),
  value numeric,
  value_text text,                    -- 学区名など数字でない値
  unit text,
  comparison numeric,                 -- 比べる値（市の平均など）
  scope jsonb,                        -- 例：{"type":"radius","meters":1000}
  basis jsonb,                        -- 例：{"n":24,"period":"2023Q2-2026Q1"}
  status text not null default 'ok' check (status in ('ok', 'insufficient', 'not_available')),
  dataset_version_ids bigint[] not null default '{}',
  attribution text,
  unique (run_id, key),
  unique (run_id, seq)
);

-- ルール表。データの編集は Supabase Studio で行う（設計書 1.3・D4）
create table public.rules (
  id text primary key,                -- 例：R-21
  kind text not null check (kind in ('total_budget', 'media_weight', 'min_spend', 'target_score')),
  condition jsonb not null,           -- 例：{"fact":"target.age_30_49_ratio","op":">","than":"comparison","delta":0.05}
  effect jsonb not null,              -- 例：{"media":"instagram","weight":2}
  note text not null,                 -- 理由（BRUMBY様の言葉で書く）
  enabled boolean not null default true,
  version integer not null default 1,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- ルールの変更の履歴。Studio で直接編集しても残るようにトリガーで記録する
create table public.rule_revisions (
  id bigint generated always as identity primary key,
  rule_id text not null,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  snapshot jsonb not null,            -- 変更後の行（delete は削除前の行）
  changed_at timestamptz not null default now()
);

create or replace function public.rules_track_revision()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.version = old.version + 1;
    new.updated_at = now();
  end if;

  if tg_op = 'DELETE' then
    insert into public.rule_revisions (rule_id, operation, snapshot)
    values (old.id, 'delete', to_jsonb(old));
    return old;
  end if;

  insert into public.rule_revisions (rule_id, operation, snapshot)
  values (new.id, lower(tg_op), to_jsonb(new));
  return new;
end;
$$;

create trigger rules_track_revision
  before insert or update or delete on public.rules
  for each row execute function public.rules_track_revision();

-- AIの文章。実行ごとに保存し、画面を開き直しても作り直さない
create table public.narratives (
  id bigint generated always as identity primary key,
  run_id bigint not null unique references public.analysis_runs (id) on delete cascade,
  model text not null,
  prompt_version text not null,
  content jsonb not null,             -- セクション → 段落（key付き）→ 文 → 引用したカードの番号
  validation jsonb,                   -- 数字の検証の結果（段落ごと）
  status text not null check (status in ('ok', 'needs_review', 'failed')),
  attempts smallint not null default 1,
  created_at timestamptz not null default now()
);

-- 段落ごとの評価（確認2）
create table public.evaluations (
  id bigint generated always as identity primary key,
  narrative_id bigint not null references public.narratives (id) on delete cascade,
  paragraph_key text not null,
  rating text not null check (rating in ('usable', 'fixable', 'unusable')),  -- 使える／直せば使える／使えない
  memo text,
  evaluator text,
  created_at timestamptz not null default now()
);

create index on public.evaluations (narrative_id);

alter table public.analysis_runs enable row level security;
alter table public.facts enable row level security;
alter table public.rules enable row level security;
alter table public.rule_revisions enable row level security;
alter table public.narratives enable row level security;
alter table public.evaluations enable row level security;
