-- =============================================================================
-- P!CKLE — 회원 탈퇴 RPC (public.users + auth.users 영구 삭제)
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid UUID;
BEGIN
  uid := auth.uid();

  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- public.users 삭제 (연관 CASCADE 데이터 정리)
  DELETE FROM public.users WHERE id = uid;

  -- Supabase Auth 계정 삭제
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

COMMENT ON FUNCTION public.delete_user_account IS '본인 회원 탈퇴 — public.users 및 auth.users 영구 삭제';

NOTIFY pgrst, 'reload schema';
