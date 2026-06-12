-- users — 타 유저 랭킹 포인트(레벨 표시) 공개 읽기
-- feed/detail 작성자 Lv 배지용 (active 회원만)

DROP POLICY IF EXISTS "users_select_active_public" ON public.users;
CREATE POLICY "users_select_active_public"
  ON public.users FOR SELECT
  TO anon, authenticated
  USING (account_status = 'active');

GRANT SELECT ON public.users TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
