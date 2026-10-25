-- 事実シート、エージェントの実行記録、点検の結果（docs/設計まとめ.md ③④）
-- 後から「なぜこの戦略になったか」をたどれるよう、物件ごとにすべて残す

-- 事実シート（③）。エージェントに渡した JSON をそのまま保存する
create table public.fact_sheets (
  id bigint generated always as identity primary key,
  property_id bigint not null references public.properties (id) on delete cascade,
  content jsonb not null,             -- {"物件ID", "作成日時", "距離の種類", "事実": [...]}
  assumption_ids bigint[] not null default '{}',  -- 計算に使った前提値（assumptions.id）
  created_at timestamptz not null default now()
);

create index on public.fact_sheets (property_id, created_at desc);

-- 戦略の実行（④の1回分）。画面は status と stage で進み具合を出し、完了したら result を表示に使う
create table public.strategy_runs (
  id bigint generated always as identity primary key,
  property_id bigint not null references public.properties (id) on delete cascade,
  fact_sheet_id bigint not null references public.fact_sheets (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  stage text check (stage in ('分析', 'メイン', '媒体', '確認', '作り直し', '金額の計算')),
  result jsonb,                       -- ⑤に渡す形（メイン・媒体の答えと、システムが計算した金額）
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index on public.strategy_runs (property_id, created_at desc);
-- 同じ物件で同時に動く実行は1つだけ
create unique index strategy_runs_one_active on public.strategy_runs (property_id) where status in ('queued', 'running');

-- エージェントの呼び出し1回ごとの記録。入力・出力・トークン数・費用をすべて残す
create table public.agent_calls (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.strategy_runs (id) on delete cascade,
  agent text not null check (agent in ('物件', '立地', '価格', '買い手', 'メイン', '媒体', '確認')),
  attempt smallint not null default 1 check (attempt in (1, 2)),  -- 2 は作り直し（1回だけ）
  model text not null,                -- 例：claude-haiku-5-5
  prompt_file text not null,          -- 使った指示文（prompts/ のファイル名）
  prompt_sha256 text not null,        -- 指示文の中身のハッシュ。指示文を直したときに見分ける
  input jsonb not null,               -- 渡した事実と、渡した答え
  output jsonb,                       -- 返ってきた JSON（読めなかったときは null）
  raw_text text,                      -- 返ってきた文字列そのまま
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_creation_tokens integer,
  cost_usd numeric(12, 6),
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (run_id, agent, attempt)
);

create index on public.agent_calls (run_id);

-- 点検の結果。プログラムの点検と確認エージェントの点検の両方を1行1件で残す
-- 作り直した後に残った問題も、警告なしで画面に出すが、ここには残す
create table public.check_results (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.strategy_runs (id) on delete cascade,
  agent_call_id bigint references public.agent_calls (id) on delete cascade,  -- 確認エージェントの呼び出し（プログラムの点検は null）
  round smallint not null check (round in (1, 2)),  -- 1：最初の点検、2：作り直した後の点検
  checker text not null check (checker in ('プログラム', 'AI')),
  target text not null check (target in ('メイン', '媒体')),
  location text not null,             -- 文の場所（例：appeals[1]）
  check_name text not null,           -- 点検の項目（例：IDが事実シートにない / 数字が一致しない）
  problem text not null,
  action text not null check (action in ('作り直し', '外す', 'なし')),
  created_at timestamptz not null default now()
);

create index on public.check_results (run_id);

alter table public.fact_sheets enable row level security;
alter table public.strategy_runs enable row level security;
alter table public.agent_calls enable row level security;
alter table public.check_results enable row level security;
