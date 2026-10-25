-- 分析を段階（集計 → ルール → AI → 検証）ごとに別の呼び出しで進める（設計書 D34）
-- stage_started_at：いまの段階を誰かが進めている印。同じ段階を二重に進めないようにする（空なら誰も進めていない）
-- 10分たっても空にならない段階は、途中で止まったものとみなして取り直せる

alter table public.analysis_runs
  add column stage_started_at timestamptz;

comment on column public.analysis_runs.stage is
  '次に進める段階（analyze → rules → ai → verify）。status が succeeded なら最後まで進んだ';
