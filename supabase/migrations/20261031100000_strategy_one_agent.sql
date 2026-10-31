-- 戦略を1体の戦略担当（3回の呼び出し）で作る形に一本化する（2026-10-31 小林さんと決定）
-- 7回の形の記録（strategy_runs・agent_calls・check_results）は残す。選択肢も残し、これからの実行の既定だけを変える

alter table public.strategy_runs alter column form set default '3回';
