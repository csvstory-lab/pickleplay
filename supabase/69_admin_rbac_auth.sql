-- =============================================================================
-- P!CKLE — 어드민 RBAC (Auth 연동 · 역할 조회 · 신규 관리자 발급)
-- 선행: 38_user_roles.sql, 68_user_roles_admin_access.sql
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

-- ── 현재 세션의 staff 역할 (Auth 필수, anon 어드민 우회 제거) ───────────────
CREATE OR REPLACE FUNCTION public.pickle_get_my_user_role()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_row public.user_roles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object(
      'ok', false,
      'is_admin', false,
      'reason', 'not_authenticated'
    );
  END IF;

  v_email := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');

  IF v_email IS NULL THEN
    SELECT nullif(trim(au.email), '')
    INTO v_email
    FROM auth.users au
    WHERE au.id = auth.uid();
  END IF;

  IF v_email IS NULL THEN
    RETURN json_build_object('ok', false, 'is_admin', false, 'reason', 'email_not_found');
  END IF;

  SELECT ur.*
  INTO v_row
  FROM public.user_roles ur
  WHERE lower(trim(ur.email)) = lower(trim(v_email))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'ok', true,
      'is_admin', false,
      'email', v_email,
      'reason', 'not_in_user_roles'
    );
  END IF;

  IF v_row.status <> 'active' THEN
    RETURN json_build_object(
      'ok', true,
      'is_admin', false,
      'email', v_row.email,
      'role', v_row.role,
      'status', v_row.status,
      'reason', 'suspended'
    );
  END IF;

  RETURN json_build_object(
    'ok', true,
    'is_admin', true,
    'email', v_row.email,
    'role', v_row.role,
    'status', v_row.status,
    'display_name', v_row.display_name,
    'department', v_row.department,
    'is_protected', v_row.is_protected,
    'mode', 'authenticated'
  );
END;
$$;

-- ── staff 호출자 판별 (활성 user_roles + Auth 세션) ───────────────────────────
CREATE OR REPLACE FUNCTION public.pickle_is_admin_caller()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_info json;
BEGIN
  IF current_user = 'service_role' THEN
    RETURN true;
  END IF;

  v_role_info := public.pickle_get_my_user_role();

  RETURN COALESCE((v_role_info->>'ok')::boolean, false) IS TRUE
    AND COALESCE((v_role_info->>'is_admin')::boolean, false) IS TRUE;
END;
$$;

-- ── super 전용: user_roles upsert (Auth 유저 생성은 Edge Function) ────────────
CREATE OR REPLACE FUNCTION public.admin_provision_staff(
  p_email text,
  p_display_name text,
  p_department text,
  p_role text,
  p_status text DEFAULT 'active'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller json;
  v_email text;
BEGIN
  v_caller := public.pickle_get_my_user_role();

  IF current_user <> 'service_role'
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    IF COALESCE((v_caller->>'ok')::boolean, false) IS NOT TRUE
       OR (v_caller->>'role') <> 'super' THEN
      RETURN json_build_object('ok', false, 'reason', 'forbidden', 'detail', 'super_required');
    END IF;
  END IF;

  v_email := lower(trim(p_email));
  IF v_email IS NULL OR v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_email');
  END IF;

  IF p_role NOT IN ('super', 'marketer', 'cs', 'account', 'advertiser') THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_role');
  END IF;

  IF COALESCE(p_status, 'active') NOT IN ('active', 'suspend') THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  INSERT INTO public.user_roles (
    email, display_name, department, role, status, is_protected
  )
  VALUES (
    v_email,
    COALESCE(NULLIF(trim(p_display_name), ''), v_email),
    COALESCE(NULLIF(trim(p_department), ''), ''),
    p_role,
    COALESCE(p_status, 'active'),
    p_role = 'super'
  )
  ON CONFLICT (email) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    department = EXCLUDED.department,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    is_protected = EXCLUDED.is_protected,
    updated_at = timezone('utc', now());

  RETURN json_build_object(
    'ok', true,
    'email', v_email,
    'role', p_role,
    'status', COALESCE(p_status, 'active')
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'reason', 'server_error', 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.admin_provision_staff(text, text, text, text, text) IS
  'super 전용 — user_roles upsert (Supabase Auth 계정은 Edge Function admin-provision-user)';

REVOKE ALL ON FUNCTION public.admin_provision_staff(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_provision_staff(text, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
