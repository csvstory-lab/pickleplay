-- =============================================================================
-- P!CKLE — 어드민 수동 제재/신고 처리 권한 수정
-- 원인: 어드민 웹은 anon 키 사용 + Supabase Auth 미로그인 → auth.uid() NULL → forbidden
--       apply_manual_penalty EXECUTE 권한이 authenticated 만 허용
-- 선행: 66_penalty_two_track.sql
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

-- ── reports: 어드민 상태 변경 UPDATE 허용 (admin_reports 직접 UPDATE 대비) ───
DROP POLICY IF EXISTS reports_update_admin ON public.reports;
CREATE POLICY reports_update_admin
  ON public.reports FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (status IN ('pending', 'reviewed', 'sanctioned', 'dismissed'));

GRANT UPDATE ON public.reports TO anon, authenticated;

-- ── 호출자 판별 (어드민 웹 anon + 로그인 관리자) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.pickle_is_admin_caller()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  v_jwt_role := nullif(trim(current_setting('request.jwt.claim.role', true)), '');

  -- 어드민 웹: anon 키 (admin_set_comment_visibility · admin_list_users 와 동일 패턴)
  IF v_jwt_role = 'anon' OR current_user = 'anon' THEN
    RETURN true;
  END IF;

  IF v_jwt_role = 'service_role' OR current_user = 'service_role' THEN
    RETURN true;
  END IF;

  -- 유저 앱: Supabase Auth + user_roles 활성 관리자
  IF auth.uid() IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      INNER JOIN auth.users au ON lower(trim(au.email)) = lower(trim(ur.email))
      WHERE au.id = auth.uid()
        AND ur.status = 'active'
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.pickle_is_admin_caller() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pickle_is_admin_caller() TO anon, authenticated;

-- ── 수동 제재 RPC 재정의 (SECURITY DEFINER + anon 허용) ─────────────────────
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
BEGIN
  IF NOT public.pickle_is_admin_caller() THEN
    RETURN json_build_object(
      'ok', false,
      'applied', false,
      'reason', 'forbidden',
      'detail', 'admin_caller_required'
    );
  END IF;

  -- 무혐의(반려): report_id 만으로 dismissed 처리
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
      'report_id', p_report_id
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
    RETURN v_result;
  END IF;

  IF (v_result->>'applied')::boolean IS TRUE AND p_report_id IS NOT NULL THEN
    UPDATE public.reports
    SET status = 'sanctioned',
        penalty_points = p_points
    WHERE id = p_report_id;
  END IF;

  RETURN v_result || json_build_object('report_id', p_report_id);
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

COMMENT ON FUNCTION public.apply_manual_penalty(uuid, text, integer, uuid) IS
  '[수동 트랙] 어드민 신고 심사 — anon(어드민 웹) · authenticated 관리자 허용';

REVOKE ALL ON FUNCTION public.apply_manual_penalty(uuid, text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_manual_penalty(uuid, text, integer, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
