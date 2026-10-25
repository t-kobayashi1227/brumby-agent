-- リフォームの箇所に「内装一部」を足す（2026-10-25 小林さんと決定。docs/設計まとめ.md「入力画面の動き」）
-- クロスの張り替えだけ、など部分的な内装リフォームを「その他」ではなく選べるようにする
-- 選べる値は lib/property.ts の RENOVATION_PARTS と同じにする

alter table public.properties drop constraint properties_renovation_parts_check;

alter table public.properties add constraint properties_renovation_parts_check
  check (renovation_parts <@ array['キッチン', '浴室', 'トイレ', '洗面', '内装全面', '内装一部', '外壁', '屋根', 'その他']);
