-- 住み替えの候補の頭金（docs/事実シートの修正_実装案.md 2.4）
-- 50代の住み替え・60歳以上は、今の家を売ったお金を頭金にするのが普通なので、通常の頭金（10%）に加えて
-- 二次取得者の自己資金比率を頭金にした返済も事実に出す。物件区分（中古・新築）ごとに値が違うので key を分ける

insert into public.assumptions (key, value, unit, basis, as_of, effective_from, dataset_id) values
  ('住み替えの頭金の割合（中古）', 49.2, '%', '住宅市場動向調査（国土交通省）既存（中古）戸建住宅の二次取得者の自己資金比率（三大都市圏）p.49', '令和7年度', '2026-10-01', 'B02'),
  ('住み替えの頭金の割合（新築）', 58.3, '%', '住宅市場動向調査（国土交通省）分譲戸建住宅の二次取得者の自己資金比率（三大都市圏）p.49', '令和7年度', '2026-10-01', 'B02');

-- 住み替えの頭金を使う候補の印。候補名で判定しないため
alter table public.target_candidates add column uses_resale_down_payment boolean not null default false;
update public.target_candidates set uses_resale_down_payment = true where name in ('50代の住み替え', '60歳以上');
