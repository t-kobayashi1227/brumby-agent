-- ターゲット候補の定義（事実 B「ターゲット候補の定義」。docs/設計まとめ.md「ターゲット候補」）
-- 段階3のたたき台（2026-10-25）。小林さんの確認待ち。直すときは、この文言を変えた新しいマイグレーションを足す
-- 代表年齢（10-24仮決め）は返済期間と必要年収の計算に使う。定義は買い手エージェントが候補を判断するときに読む

update public.target_candidates set definition = '世帯主が20代〜30代前半で、夫婦のみか、小学校に入る前の子どものいる世帯', note = '代表年齢は10-24仮決め。定義は10-25たたき台' where name = '若い夫婦';
update public.target_candidates set definition = '小学生・中学生の子どものいる世帯（世帯主はおもに30代後半〜40代）', note = '代表年齢は10-24仮決め。定義は10-25たたき台' where name = '小中学生のいる家族';
update public.target_candidates set definition = '世帯主が50代で、子どもの独立や持ち家の老朽化などをきっかけに住み替える世帯', note = '代表年齢は10-24仮決め。定義は10-25たたき台' where name = '50代の住み替え';
update public.target_candidates set definition = '世帯主が60歳以上の世帯（夫婦のみ・ひとり暮らしを含む）', note = '代表年齢は10-24仮決め。定義は10-25たたき台' where name = '60歳以上';
update public.target_candidates set definition = 'ひとりで暮らす世帯（年代は問わない）', note = '代表年齢は10-24仮決め。定義は10-25たたき台' where name = '単身';
update public.target_candidates set definition = '親の世帯と子の世帯が一緒に暮らす世帯（二世帯）', note = '代表年齢は10-24仮決め。定義は10-25たたき台' where name = '親と同居';
