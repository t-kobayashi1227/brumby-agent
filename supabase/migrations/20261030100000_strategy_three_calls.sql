-- 戦略を3回の呼び出しで作る形を試す（docs/戦略の質を上げる修正案.md 段階1）
-- 今の形（7回）はそのまま残し、どちらの形で作ったかを strategy_runs.form に残す。画面は段階2で切り替えるまで「7回」の結果だけを出す

alter table public.strategy_runs
  add column form text not null default '7回' check (form in ('7回', '3回'));

alter table public.strategy_runs drop constraint strategy_runs_stage_check;
alter table public.strategy_runs
  add constraint strategy_runs_stage_check check (stage in ('分析', '戦略', 'メイン', '媒体', '確認', '作り直し', '金額の計算'));

-- 戦略担当（3回の形）。effort は呼び出しごとの考える量（medium と high を比べるため）
alter table public.agent_calls drop constraint agent_calls_agent_check;
alter table public.agent_calls
  add constraint agent_calls_agent_check check (agent in ('物件', '立地', '価格', '買い手', 'メイン', '戦略', '媒体', '確認'));
alter table public.agent_calls add column effort text;

-- 点検の結果：3回の形では、戦略担当の文は target「戦略」。禁止語の点検は「記録だけ」（作り直さない）
alter table public.check_results drop constraint check_results_target_check;
alter table public.check_results
  add constraint check_results_target_check check (target in ('メイン', '戦略', '媒体'));
alter table public.check_results drop constraint check_results_action_check;
alter table public.check_results
  add constraint check_results_action_check check (action in ('作り直し', '外す', '記録だけ', 'なし'));
