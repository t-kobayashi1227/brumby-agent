-- 取り込む前の生データの置き場所（設計書 4.1）。非公開。取り込みコマンドが secret key で書き込む
insert into storage.buckets (id, name, public)
values ('ingest-raw', 'ingest-raw', false)
on conflict (id) do nothing;
