-- P!CKLE — 관리자 회원 목록 전체 조회 (admin_users.html)
-- 운영 환경에서는 authenticated + user_roles 기반으로 제한 권장

DROP POLICY IF EXISTS users_select_admin_all ON public.users;
CREATE POLICY users_select_admin_all
  ON public.users FOR SELECT
  TO anon, authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
