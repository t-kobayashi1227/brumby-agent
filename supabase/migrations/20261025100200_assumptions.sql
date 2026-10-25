-- 前提値・ターゲット候補・媒体一覧（docs/設計まとめ.md「買い手・ローンの前提」「ターゲット候補」「媒体の選び方」）

-- 前提値。金利は月1回、頭金・返済負担率は年1回（7月）、担当者が新しい行を足す（古い行は消さない）
-- 計算には「適用開始日が今日以前で一番新しい行」を使い、事実シートに使った行の id を記録する
create table public.assumptions (
  id bigint generated always as identity primary key,
  key text not null,                  -- 例：変動金利
  value numeric not null,
  unit text not null,                 -- 例：% / 年 / 歳
  basis text not null,                -- 根拠
  as_of text not null,                -- 時点
  effective_from date not null,       -- 適用開始日
  dataset_id text references public.datasets (id),
  created_at timestamptz not null default now(),
  unique (key, effective_from)
);

insert into public.assumptions (key, value, unit, basis, as_of, effective_from, dataset_id) values
  ('変動金利', 1.3, '%', '各銀行の公表金利', '2026-10', '2026-10-01', 'B04'),
  ('全期間固定金利', 3.83, '%', 'フラット35の金利（住宅金融支援機構）', '2026-10', '2026-10-01', 'B05'),
  ('頭金の割合', 10, '%', 'フラット35利用者調査（住宅金融支援機構）', '2025年度', '2026-10-01', 'B01'),
  ('返済負担率', 25, '%', 'フラット35利用者調査（住宅金融支援機構）', '2025年度', '2026-10-01', 'B01'),
  ('返済期間', 35, '年', '設計まとめ「買い手・ローンの前提」', '2026-10', '2026-10-01', null),
  ('完済年齢の上限', 80, '歳', '民間住宅ローンの実態に関する調査（国土交通省）', '令和7年度', '2026-10-01', 'B03');

-- ターゲット候補。代表年齢は返済期間と必要年収の計算に使う（10-24仮決め）
-- メインのエージェントが加える「エージェント提案」の候補は、ここではなく実行の結果に残す
create table public.target_candidates (
  id smallint primary key,
  name text not null unique,
  representative_age smallint not null,
  definition text,                    -- 事実 B に入れる定義（段階3で整える）
  note text
);

insert into public.target_candidates (id, name, representative_age, note) values
  (1, '若い夫婦', 30, '代表年齢は10-24仮決め'),
  (2, '小中学生のいる家族', 38, '代表年齢は10-24仮決め'),
  (3, '50代の住み替え', 55, '代表年齢は10-24仮決め'),
  (4, '60歳以上', 65, '代表年齢は10-24仮決め'),
  (5, '単身', 35, '代表年齢は10-24仮決め'),
  (6, '親と同居', 40, '代表年齢は10-24仮決め');

-- 媒体一覧（事実 C-01〜C-16）。PoC では16件すべてを候補にする。費用の目安は空欄
create table public.media (
  id text primary key,                -- 例：C-01
  name text not null,
  category text not null,
  purpose text not null,
  reach_ages text not null,           -- 届きやすい年代（見立て）
  sort smallint not null
);

insert into public.media (id, name, category, purpose, reach_ages, sort) values
  ('C-01', 'SUUMO', '不動産ポータル', '問い合わせ', '30〜40代', 1),
  ('C-02', 'アットホーム', '不動産ポータル', '問い合わせ', '30〜50代', 2),
  ('C-03', 'LIFULL HOME''S', '不動産ポータル', '問い合わせ', '30〜40代', 3),
  ('C-04', '自社ホームページ', '自社', '問い合わせ・信頼', '全年代', 4),
  ('C-05', 'Google検索広告', 'ネット広告', '問い合わせ', '30〜50代', 5),
  ('C-06', 'Instagram広告', 'SNS広告', '認知', '20〜40代', 6),
  ('C-07', 'Facebook広告', 'SNS広告', '認知', '40〜50代', 7),
  ('C-08', 'TikTok広告', 'SNS広告', '認知', '10〜30代', 8),
  ('C-09', 'LINE広告', 'SNS広告', '認知', '幅広い年代', 9),
  ('C-10', 'YouTube広告', '動画広告', '認知', '幅広い年代', 10),
  ('C-11', '新聞折込チラシ', '紙', '認知・問い合わせ', '50代以上', 11),
  ('C-12', 'ポスティング', '紙', '認知（近所の住み替え）', '全年代', 12),
  ('C-13', 'フリーペーパー・地域情報誌', '紙', '認知', '30〜50代', 13),
  ('C-14', '現地看板・のぼり', '現地', '認知（通りかかり）', '全年代', 14),
  ('C-15', 'オープンハウス（現地販売会）', '現地', '内見', '全年代', 15),
  ('C-16', 'LINE公式・メール（自社の顧客）', '自社', '問い合わせ・内見', '全年代', 16);

alter table public.assumptions enable row level security;
alter table public.target_candidates enable row level security;
alter table public.media enable row level security;
