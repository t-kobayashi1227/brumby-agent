-- 買い手・媒体の統計（reference_stats）に、出典の場所（報告書のページなど）とメモを持たせる
-- 事実シートの「出典」に、どの報告書のどの表かを書けるようにする

alter table public.reference_stats
  add column source text,             -- 例：住宅市場動向調査 令和7年度 報告書 p.39
  add column note text;
