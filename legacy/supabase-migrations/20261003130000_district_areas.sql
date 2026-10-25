-- 取引価格（XIT001）の地区と、町丁目（国勢調査の小地域）の対応
-- 地区は町・大字の単位で、町丁目より一段粗い（例：「小針台」→「小針台一丁目」「小針台二丁目」…）
-- 1つの地区に複数の町丁目が対応するので、取引の行に列を持たせず、対応表を別に持つ
-- XIT001の地区コードと国勢調査のKEY_CODEは、桁の形が似ているが別の体系（先頭9桁が一致しても別の町を指す）。名前で結びつける

alter table public.transactions drop column area_id;
alter table public.transactions drop column area_match;

-- 自動で作る対応。取引価格か町丁目の版が変わったら、その組み合わせで作り直す
create table public.district_areas (
  transactions_version_id bigint not null references public.dataset_versions (id) on delete cascade,
  areas_version_id bigint not null references public.dataset_versions (id) on delete cascade,
  municipality_code text not null,
  district_name text not null,
  key_code text not null,             -- 町丁目（areas.key_code）
  match text not null
    check (match in ('exact', 'prefix', 'manual')),
  -- exact：名前をならして一致 / prefix：町丁目の名前が地区名で始まる（「太田」→「太田栄町」）/ manual：district_manual から
  primary key (transactions_version_id, areas_version_id, municipality_code, district_name, key_code)
);

create index on public.district_areas (areas_version_id, key_code);

-- 手で直した対応。版に関係なく残し、自動の対応を作るたびに当てはめる
-- ルール表と同じく、Studioで直接編集してよい（設計書 D4 の例外）
create table public.district_manual (
  municipality_code text not null,
  district_name text not null,        -- XIT001の地区名そのまま
  key_code text not null,             -- 結びつける町丁目。対応する町丁目がない地区は行を作らない
  note text,                          -- 理由（例：2020年の国勢調査では「○○」に含まれる）
  updated_at timestamptz not null default now(),
  primary key (municipality_code, district_name, key_code)
);

alter table public.district_areas enable row level security;
alter table public.district_manual enable row level security;
