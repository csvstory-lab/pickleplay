-- =============================================================================
-- P!CKLE — super 전용: Auth 비밀번호 즉시 강제 설정 (RPC fallback)
-- Edge Function admin-force-password 배포 전/실패 시 사용
-- 선행: 69_admin_rbac_auth.sql, pgcrypto
-- Supabase SQL Editor → Run
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.admin_force_set_password(
  p_email text,
  p_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller json;
  v_email text;
  v_user_id uuid;
BEGIN
  v_caller := public.pickle_get_my_user_role();

  IF COALESCE((v_caller->>'ok')::boolean, false) IS NOT TRUE
     OR (v_caller->>'role') <> 'super' THEN
    RETURN json_build_object('ok', false, 'reason', 'forbidden', 'detail', 'super_required');
  END IF;

  v_email := lower(trim(p_email));
  IF v_email IS NULL OR v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_email');
  END IF;

  IF p_password IS NULL OR char_length(p_password) < 8 THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_password', 'detail', 'min_8_chars');
  END IF;

  SELECT au.id
  INTO v_user_id
  FROM auth.users au
  WHERE lower(trim(au.email)) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'user_not_found', 'email', v_email);
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = crypt(p_password, gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, timezone('utc', now())),
    confirmation_token = '',
    recovery_token = '',
    email_change = '',
    email_change_token_new = '',
    banned_until = NULL,
    updated_at = timezone('utc', now()),
    raw_app_meta_data = jsonb_set(
      jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{provider}', '"email"'::jsonb, true),
      '{providers}',
      (
        SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
        FROM (
          SELECT jsonb_array_elements_text(COALESCE(raw_app_meta_data->'providers', '[]'::jsonb)) AS elem
          UNION ALL
          SELECT 'email'
        ) s
      ),
      true
    )
  WHERE id = v_user_id;

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  )
  SELECT
    v_user_id,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email',
    v_user_id::text,
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = v_user_id AND i.provider = 'email'
  );

  RETURN json_build_object(
    'ok', true,
    'email', v_email,
    'user_id', v_user_id,
    'method', 'sql_crypt_fallback'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'reason', 'server_error', 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.admin_force_set_password(text, text) IS
  'super 전용 — auth.users 비밀번호 즉시 변경 (Edge Function fallback)';

REVOKE ALL ON FUNCTION public.admin_force_set_password(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_force_set_password(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
