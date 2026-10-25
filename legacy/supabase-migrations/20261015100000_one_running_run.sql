-- 同じ物件で進行中（running）の実行は1つまで（設計書 8章「ボタンの連打で二重に動かさない」）
-- startRun は「進行中がなければ作る」を select → insert の2回で行うため、同時に呼ばれると2つできることがあった
-- この索引があれば2つ目の insert が失敗するので、startRun はそれを拾って進行中の実行を返す

-- 既に2つ以上ある物件は、一番新しいものだけ残して、ほかを失敗にする（索引を作れるようにするため）
update public.analysis_runs r
set status = 'failed', error = '同じ物件の実行が重なったため止めました', stage_started_at = null, finished_at = now()
where r.status = 'running'
  and exists (
    select 1 from public.analysis_runs n
    where n.property_id = r.property_id and n.status = 'running' and n.id > r.id
  );

create unique index analysis_runs_one_running
  on public.analysis_runs (property_id)
  where status = 'running';
