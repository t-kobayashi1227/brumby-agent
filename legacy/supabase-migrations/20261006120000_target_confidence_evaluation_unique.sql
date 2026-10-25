-- 狙う層の設計.md と 決定事項（2026-10-06）に合わせる

-- 根拠の弱い候補（住み替え層など）に「仮説」のラベルを付ける。判断カードの basis.ranking[].confidence に入る
alter table public.target_candidates
  add column confidence text not null default 'normal' check (confidence in ('normal', 'low'));

-- 同じ人が同じ答え・観点を二重に付けないようにする（物件ごとの観点は answer_key が空なので、空どうしも同じとみなす）
alter table public.evaluations
  add constraint evaluations_one_per_evaluator
  unique nulls not distinct (narrative_id, answer_key, criterion, evaluator);
