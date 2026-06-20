-- =============================================================================
-- P!CKLE — 관리자 비밀번호 재설정: Auth provider 조회 (OAuth vs email)
-- 선행: 69_admin_rbac_auth.sql
-- Supabase SQL Editor → Run
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_auth_providers(p_email text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller json;
  v_user_id uuid;
  v_providers text[];
BEGIN
  v_caller := public.pickle_get_my_user_role();

  IF COALESCE((v_caller->>'ok')::boolean, false) IS NOT TRUE
     OR (v_caller->>'role') <> 'super' THEN
    RETURN json_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF p_email IS NULL OR trim(p_email) = '' THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_email');
  END IF;

  SELECT u.id
  INTO v_user_id
  FROM auth.users u
  WHERE lower(trim(u.email)) = lower(trim(p_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'ok', true,
      'user_exists', false,
      'email', lower(trim(p_email)),
      'providers', '[]'::json,
      'has_email_provider', false
    );
  END IF;

  SELECT COALESCE(array_agg(DISTINCT i.provider ORDER BY i.provider), ARRAY[]::text[])
  INTO v_providers
  FROM auth.identities i
  WHERE i.user_id = v_user_id;

  RETURN json_build_object(
    'ok', true,
    'user_exists', true,
    'email', lower(trim(p_email)),
    'providers', to_json(v_providers),
    'has_email_provider', 'email' = ANY(v_providers),
    'oauth_only',
      CASE
        WHEN array_length(v_providers, 1) IS NULL THEN false
        WHEN v_providers = ARRAY['email']::text[] THEN false
        WHEN 'email' = ANY(v_providers) THEN false
        ELSE true
      END
  );
END;
$$;

COMMENT ON FUNCTION public.admin_get_auth_providers(text) IS
  'super 전용 — 대상 Auth 계정의 로그인 provider 목록 (OAuth 판별)';

REVOKE ALL ON FUNCTION public.admin_get_auth_providers(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_auth_providers(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
