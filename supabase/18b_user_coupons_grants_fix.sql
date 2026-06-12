-- user_coupons — API 권한 보완 (보관함 permission denied / 테이블 미노출 수정)
-- 이미 18_user_coupons.sql 을 실행한 경우 이 파일만 추가 실행하면 됩니다.

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, UPDATE ON public.user_coupons TO authenticated;
GRANT SELECT, UPDATE ON public.user_coupons TO service_role;

NOTIFY pgrst, 'reload schema';
