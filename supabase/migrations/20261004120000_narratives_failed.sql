-- AIの文章が生成できなかった回も残す（画面からの実行の設計書 6章・7章）
-- 実行は succeeded のまま、narratives.status = 'failed'、content は空、error に理由
alter table public.narratives alter column content drop not null;
alter table public.narratives add column error text;
