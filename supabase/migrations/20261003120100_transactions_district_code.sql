-- XIT001 は地区名に加えて地区のコード（DistrictCode、例：151010240）を返す
-- 町丁目に結びつけるとき、表記ゆれのある地区名より先にこちらを使う（設計書 4.5）
alter table public.transactions add column district_code text;

create index on public.transactions (district_code);
