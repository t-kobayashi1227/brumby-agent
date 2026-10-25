-- 2026-10-06 の設計書の更新に合わせる（D15・D17・D18・D22・D23・D30・D31）

-- 物件：総予算・販売期限・販促目的は利用者が入力する（D15）。総予算が空なら total_budget ルールの提案値を使う
alter table public.properties
  add column total_budget_man_yen integer check (total_budget_man_yen > 0),  -- 万円
  add column sales_deadline date,     -- 販売期限
  add column sales_goal text;         -- 販促目的（例：見学予約を増やしたい）

-- 競合物件：どこで・いつ・誰が確かめたか（D30）
alter table public.competitors
  add column source_type text check (source_type in ('seen', 'portal', 'other')),  -- 見かけた／ポータル／その他
  add column source_site text,        -- 参照サイト名（例：SUUMO）
  add column confirmed_on date,       -- 確認日
  add column entered_by text;         -- 入力者

-- 取り込みの記録：失敗の種類と、データの公開年月（D31。取得成功率と鮮度を出す）
alter table public.ingest_logs
  add column failure_kind text check (failure_kind in ('auth', 'rate_limit', 'network', 'other')),
  add column published_on date,       -- データの公開年月（月の1日を入れる）
  add constraint ingest_logs_failure_kind_only_failed
    check (failure_kind is null or status = 'failed');

-- AIの文章：トークン数と所要時間（D17。P7 の性能・費用を自前で記録する）
alter table public.narratives
  add column input_tokens integer,
  add column output_tokens integer,
  add column duration_ms integer;     -- 作り直しを含めた合計

comment on column public.narratives.validation is
  '検証の結果（段落ごと）。文の種別・数字・比較語・禁止表現（設計書 6.3）';

-- ルール：訴求の点数（D23）を足す
alter table public.rules drop constraint rules_kind_check;
alter table public.rules add constraint rules_kind_check
  check (kind in ('total_budget', 'media_weight', 'min_spend', 'target_score', 'appeal_score'));

-- 狙う層の候補（D22）。コードに候補を書かず、この表の行にする
create table public.target_candidates (
  id text primary key,                -- 例：family
  label text not null,                -- 例：30〜40代の子育てファミリー
  description text not null,
  property_types text[],              -- 対象の物件種別。null なら全部
  sort_order integer not null default 0,  -- 同点のときは小さいほうを上にする
  enabled boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- 訴求の素材（D23）。ルール appeal_score で点を付け、上位3つを使う
create table public.appeal_items (
  id text primary key,                -- 例：school_near
  label text not null,                -- 例：小・中学校が近い
  description text not null,
  needs_facts text[] not null default '{}',  -- 必要な事実カードの key。1つでも ok でなければ選ばない
  property_types text[],              -- 対象の物件種別。null なら全部
  sort_order integer not null default 0,
  enabled boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- 候補表・訴求表の変更も rule_revisions に残す（/rules の履歴にまとめて出す。D14）
alter table public.rule_revisions
  add column table_name text not null default 'rules'
    check (table_name in ('rules', 'target_candidates', 'appeal_items'));

comment on column public.rule_revisions.rule_id is
  '変更した行の id（table_name の表の id）';

create or replace function public.track_rule_table_revision()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at = now();
  end if;

  if tg_op = 'DELETE' then
    insert into public.rule_revisions (rule_id, operation, snapshot, table_name)
    values (old.id, 'delete', to_jsonb(old), tg_table_name);
    return old;
  end if;

  insert into public.rule_revisions (rule_id, operation, snapshot, table_name)
  values (new.id, lower(tg_op), to_jsonb(new), tg_table_name);
  return new;
end;
$$;

create trigger target_candidates_track_revision
  before insert or update or delete on public.target_candidates
  for each row execute function public.track_rule_table_revision();

create trigger appeal_items_track_revision
  before insert or update or delete on public.appeal_items
  for each row execute function public.track_rule_table_revision();

alter table public.target_candidates enable row level security;
alter table public.appeal_items enable row level security;

-- 評価：段落ごとの3段階から、5段階×4観点に変える（D18、設計書 10章）
-- 評価の入力画面はまだなく、行は入っていない
drop table public.evaluations;

create table public.evaluations (
  id bigint generated always as identity primary key,
  narrative_id bigint not null references public.narratives (id) on delete cascade,
  answer_key text check (answer_key in ('target', 'appeal', 'media_budget', 'action')),  -- 4つの答え。物件ごとの観点は null
  criterion text not null check (criterion in ('specificity', 'evidence', 'feasibility', 'readability')),
  score smallint not null check (score between 1 and 5),
  memo text,
  evaluator text,
  created_at timestamptz not null default now(),
  -- 具体性・実行可能性は答えごと、根拠整合・UI可読性は物件ごと
  check (
    (criterion in ('specificity', 'feasibility') and answer_key is not null)
    or (criterion in ('evidence', 'readability') and answer_key is null)
  )
);

create index on public.evaluations (narrative_id);

alter table public.evaluations enable row level security;
