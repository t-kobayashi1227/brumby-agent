-- 物件の写真（2026-10-12）。物件の登録・変更の画面で1枚登録する。なければ画面は共通の仮画像を出す
-- Supabase Storage ではなく DB に置く：画面（Vercel）に Storage の強いキーを置かずに済むため。写真はブラウザで縮めてから送る（長辺1600px・JPEG、数百KB）
-- テスト物件は秘密保持契約の対象。写真も同じ扱い（Basic認証の中の /properties/<id>/photo からだけ見える）

create table public.property_photos (
  property_id bigint primary key references public.properties (id) on delete cascade,
  content bytea not null,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  width integer,
  height integer,
  size_bytes integer not null,
  updated_at timestamptz not null default now()
);

alter table public.property_photos enable row level security;
