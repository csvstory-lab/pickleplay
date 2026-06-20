-- =============================================================================
-- P!CKLE — user_roles 에 sponsor(외부 스폰서) 역할 추가
-- 선행: 38_user_roles.sql, 69_admin_rbac_auth.sql
-- Supabase SQL Editor → Run
-- =============================================================================

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('super', 'marketer', 'cs', 'account', 'advertiser', 'sponsor'));

-- 기존 advertiser → sponsor 통일 (선택적 마이그레이션)
UPDATE public.user_roles SET role = 'sponsor' WHERE role = 'advertiser';

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
  v_role text;
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

  v_role := lower(trim(p_role));
  IF v_role = 'advertiser' THEN
    v_role := 'sponsor';
  END IF;

  IF v_role NOT IN ('super', 'marketer', 'cs', 'account', 'sponsor') THEN
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
    v_role,
    COALESCE(p_status, 'active'),
    v_role = 'super'
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
    'role', v_role,
    'status', COALESCE(p_status, 'active')
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'reason', 'server_error', 'error', SQLERRM);
END;
$$;

NOTIFY pgrst, 'reload schema';
