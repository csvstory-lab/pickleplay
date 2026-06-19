-- =============================================================================
-- P!CKLE — user_roles 조회·수동 제재 RPC 권한 보완
-- 원인: authenticated 세션 시 anon 우회 불가 + JWT 이메일/user_roles 매칭 실패 → forbidden
--       프론트 user_roles 직접 조회 시 .single() / 이메일 대소문자 불일치 → 406
-- 선행: 67_admin_penalty_manual_fix.sql
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

-- ── user_roles: 인증 유저 본인 역할 SELECT (JWT 이메일 기준) ─────────────────
DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;
CREATE POLICY user_roles_select_own
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );

-- 기존 어드민 목록용 전체 조회(anon) 유지 — 38_user_roles.sql user_roles_select_all

-- ── 프론트엔드용: 내 관리자 역할 조회 RPC (406 방지 · SECURITY DEFINER) ─────
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
  v_jwt_role text;
BEGIN
  v_jwt_role := nullif(trim(current_setting('request.jwt.claim.role', true)), '');

  -- 어드민 웹 anon 키 (로그인 없음)
  IF v_jwt_role = 'anon' OR current_user = 'anon' THEN
    RETURN json_build_object(
      'ok', true,
      'is_admin', true,
      'mode', 'anon_admin_workspace',
      'role', 'super'
    );
  END IF;

  v_email := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');

  IF v_email IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT nullif(trim(au.email), '')
    INTO v_email
    FROM auth.users au
    WHERE au.id = auth.uid();
  END IF;

  IF v_email IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'not_authenticated', 'is_admin', false);
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

  RETURN json_build_object(
    'ok', true,
    'is_admin', (
      v_row.status = 'active'
      AND v_row.role IN ('super', 'marketer', 'cs', 'account')
    ),
    'email', v_row.email,
    'role', v_row.role,
    'status', v_row.status,
    'display_name', v_row.display_name,
    'mode', 'authenticated'
  );
END;
$$;

COMMENT ON FUNCTION public.pickle_get_my_user_role() IS
  '현재 세션의 관리자 역할 조회 (프론트 user_roles 직접 SELECT 대체)';

REVOKE ALL ON FUNCTION public.pickle_get_my_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pickle_get_my_user_role() TO anon, authenticated;

-- ── 호출자 판별 (JWT 이메일 우선 · authenticated 관리자 인식) ───────────────
CREATE OR REPLACE FUNCTION public.pickle_is_admin_caller()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text;
  v_email text;
  v_role_info json;
BEGIN
  v_jwt_role := nullif(trim(current_setting('request.jwt.claim.role', true)), '');
  IF v_jwt_role IS NULL OR v_jwt_role = '' THEN
    v_jwt_role := current_user;
  END IF;

  -- 어드민 웹 anon 키
  IF v_jwt_role = 'anon' OR current_user = 'anon' THEN
    RETURN true;
  END IF;

  IF v_jwt_role = 'service_role' OR current_user = 'service_role' THEN
    RETURN true;
  END IF;

  v_role_info := public.pickle_get_my_user_role();

  IF COALESCE((v_role_info->>'ok')::boolean, false) IS TRUE
     AND COALESCE((v_role_info->>'is_admin')::boolean, false) IS TRUE THEN
    RETURN true;
  END IF;

  -- authenticated 이지만 user_roles 미등록(일반 유저 세션) — 어드민 RPC는 거부
  RETURN false;
END;
$$;

-- ── 수동 제재 RPC: admin_* 패턴 — SECURITY DEFINER (호출자 차단 없음) ───────
CREATE OR REPLACE FUNCTION public.apply_manual_penalty(
  p_user_id uuid,
  p_reason text,
  p_points integer,
  p_report_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_caller json;
BEGIN
  -- 감사 로그용 호출자 스냅샷 (admin_set_comment_visibility 와 동일 — RPC 자체가 어드민 게이트)
  BEGIN
    v_caller := public.pickle_get_my_user_role();
  EXCEPTION
    WHEN OTHERS THEN
      v_caller := json_build_object('ok', false, 'reason', 'caller_lookup_failed');
  END;

  -- 무혐의(반려)
  IF p_report_id IS NOT NULL AND (p_points IS NULL OR p_points <= 0) THEN
    UPDATE public.reports
    SET status = 'dismissed',
        penalty_points = 0
    WHERE id = p_report_id;

    IF NOT FOUND THEN
      RETURN json_build_object(
        'ok', false,
        'applied', false,
        'reason', 'report_not_found',
        'report_id', p_report_id
      );
    END IF;

    RETURN json_build_object(
      'ok', true,
      'applied', false,
      'reason', 'dismissed',
      'report_id', p_report_id,
      'caller', v_caller
    );
  END IF;

  IF p_user_id IS NULL OR p_points IS NULL OR p_points <= 0 THEN
    RETURN json_build_object('ok', false, 'applied', false, 'reason', 'invalid_args');
  END IF;

  v_result := public._penalty_apply_core(
    p_user_id,
    p_reason,
    p_points,
    'admin',
    'admin_manual'
  );

  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_result || json_build_object('caller', v_caller);
  END IF;

  IF (v_result->>'applied')::boolean IS TRUE AND p_report_id IS NOT NULL THEN
    UPDATE public.reports
    SET status = 'sanctioned',
        penalty_points = p_points
    WHERE id = p_report_id;
  END IF;

  RETURN v_result || json_build_object('report_id', p_report_id, 'caller', v_caller);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'ok', false,
      'applied', false,
      'reason', 'server_error',
      'error', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_manual_penalty(uuid, text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_manual_penalty(uuid, text, integer, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
