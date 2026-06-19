-- =============================================================================
-- P!CKLE — 제재/벌점 투트랙 분리
--   [자동 트랙] apply_auto_penalty — 시스템 감지·알고리즘 100% 자동
--   [수동 트랙] submit_user_report — 신고 접수만 / apply_manual_penalty — 관리자 집행
-- 선행: 65_apply_penalty_rpc.sql (reports 정책 등)
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

DROP FUNCTION IF EXISTS public.apply_penalty(uuid, text, text, text, uuid, text);

-- penalty_config: 시스템 자동 감지 벌점 필드 병합
UPDATE public.system_settings
SET penalty_config = COALESCE(penalty_config, '{}'::jsonb) || '{
  "score_profanity_block": 10,
  "score_ai_vision": 50
}'::jsonb
WHERE id = 1;

-- ── 내부 공통: 벌점 누적 + 자동 정지 (SECURITY DEFINER, 외부 호출 불가) ───
CREATE OR REPLACE FUNCTION public._penalty_apply_core(
  p_user_id uuid,
  p_reason text,
  p_points integer,
  p_source_type text,
  p_penalty_type text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config jsonb;
  v_new_total integer;
  v_reason text;
  v_restricted_until timestamptz;
  v_is_banned boolean := false;
  v_auto_30 integer;
  v_auto_50 integer;
  v_auto_100 integer;
  v_auto_30_action text;
  v_auto_50_action text;
BEGIN
  IF p_user_id IS NULL OR p_points IS NULL OR p_points <= 0 THEN
    RETURN json_build_object('ok', false, 'applied', false, 'reason', 'invalid_args');
  END IF;

  SELECT penalty_config
  INTO v_config
  FROM public.system_settings
  WHERE id = 1;

  v_reason := COALESCE(NULLIF(trim(p_reason), ''), '규정 위반');

  SELECT u.penalty_points
  INTO v_new_total
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'applied', false, 'reason', 'user_not_found');
  END IF;

  v_new_total := v_new_total + p_points;

  UPDATE public.users
  SET penalty_points = v_new_total,
      updated_at = timezone('utc', now())
  WHERE id = p_user_id;

  v_auto_30 := COALESCE((v_config->>'auto_30_points')::integer, 30);
  v_auto_50 := COALESCE((v_config->>'auto_50_points')::integer, 50);
  v_auto_100 := COALESCE((v_config->>'auto_100_points')::integer, 100);
  v_auto_30_action := COALESCE(v_config->>'auto_30_action', 'suspend_3d');
  v_auto_50_action := COALESCE(v_config->>'auto_50_action', 'suspend_7d');

  IF v_new_total >= v_auto_100 THEN
    v_is_banned := true;
    UPDATE public.users
    SET is_banned = true,
        account_status = 'suspended',
        updated_at = timezone('utc', now())
    WHERE id = p_user_id;
  ELSIF v_new_total >= v_auto_50 THEN
    v_restricted_until := timezone('utc', now()) + CASE v_auto_50_action
      WHEN 'suspend_3d' THEN interval '3 days'
      WHEN 'suspend_7d' THEN interval '7 days'
      WHEN 'suspend_14d' THEN interval '14 days'
      ELSE interval '7 days'
    END;
    UPDATE public.users
    SET restricted_until = GREATEST(COALESCE(restricted_until, timezone('utc', now())), v_restricted_until),
        updated_at = timezone('utc', now())
    WHERE id = p_user_id;
  ELSIF v_new_total >= v_auto_30 THEN
    IF v_auto_30_action <> 'warn' THEN
      v_restricted_until := timezone('utc', now()) + CASE v_auto_30_action
        WHEN 'suspend_3d' THEN interval '3 days'
        WHEN 'suspend_7d' THEN interval '7 days'
        WHEN 'suspend_14d' THEN interval '14 days'
        ELSE interval '3 days'
      END;
      UPDATE public.users
      SET restricted_until = GREATEST(COALESCE(restricted_until, timezone('utc', now())), v_restricted_until),
          updated_at = timezone('utc', now())
      WHERE id = p_user_id;
    END IF;
  END IF;

  INSERT INTO public.user_penalties (user_id, reason, penalty_points, source_type)
  VALUES (
    p_user_id,
    v_reason,
    p_points,
    COALESCE(NULLIF(trim(p_source_type), ''), 'system')
  );

  INSERT INTO public.penalty_logs (user_id, penalty_type, points_added, reason)
  VALUES (p_user_id, COALESCE(NULLIF(trim(p_penalty_type), ''), 'auto'), p_points, v_reason);

  RETURN json_build_object(
    'ok', true,
    'applied', true,
    'user_id', p_user_id,
    'points_added', p_points,
    'penalty_total', v_new_total,
    'is_banned', v_is_banned,
    'restricted_until', v_restricted_until,
    'account_status', CASE WHEN v_is_banned THEN 'suspended' ELSE 'active' END
  );
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

REVOKE ALL ON FUNCTION public._penalty_apply_core(uuid, text, integer, text, text) FROM PUBLIC;

-- ── [자동 트랙] 시스템 감지 벌점 + 자동 정지 ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_auto_penalty(
  p_user_id uuid,
  p_reason text,
  p_points integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config jsonb;
  v_engine_enabled boolean;
  v_is_admin boolean := false;
  v_result json;
BEGIN
  IF p_user_id IS NULL OR p_points IS NULL OR p_points <= 0 THEN
    RETURN json_build_object('ok', false, 'applied', false, 'reason', 'invalid_args');
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'applied', false, 'reason', 'forbidden');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    INNER JOIN auth.users au ON lower(trim(au.email)) = lower(trim(ur.email))
    WHERE au.id = auth.uid()
      AND ur.status = 'active'
  ) INTO v_is_admin;

  IF auth.uid() <> p_user_id AND NOT v_is_admin THEN
    RETURN json_build_object('ok', false, 'applied', false, 'reason', 'forbidden');
  END IF;

  SELECT penalty_config
  INTO v_config
  FROM public.system_settings
  WHERE id = 1;

  v_engine_enabled := CASE lower(trim(COALESCE(v_config->>'engine_enabled', 'false')))
    WHEN 'true' THEN true WHEN 't' THEN true WHEN '1' THEN true ELSE false END;

  IF NOT v_engine_enabled THEN
    RETURN json_build_object('ok', true, 'applied', false, 'reason', 'engine_disabled');
  END IF;

  v_result := public._penalty_apply_core(
    p_user_id,
    p_reason,
    p_points,
    'system',
    'auto_system'
  );

  RETURN v_result;
END;
$$;

-- ── [수동 트랙] 관리자 집행 벌점 (엔진 스위치 무관) ───────────────────────────
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
  v_is_admin boolean := false;
  v_result json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'applied', false, 'reason', 'forbidden');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    INNER JOIN auth.users au ON lower(trim(au.email)) = lower(trim(ur.email))
    WHERE au.id = auth.uid()
      AND ur.status = 'active'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN json_build_object('ok', false, 'applied', false, 'reason', 'forbidden');
  END IF;

  IF p_report_id IS NOT NULL AND (p_points IS NULL OR p_points <= 0) THEN
    UPDATE public.reports
    SET status = 'dismissed',
        penalty_points = 0
    WHERE id = p_report_id;

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

  IF (v_result->>'applied')::boolean IS TRUE AND p_report_id IS NOT NULL THEN
    UPDATE public.reports
    SET status = 'sanctioned',
        penalty_points = p_points
    WHERE id = p_report_id;
  END IF;

  RETURN v_result || json_build_object('report_id', p_report_id);
END;
$$;

-- ── [수동 트랙] 유저 신고 접수 — reports INSERT 만 (벌점 없음) ────────────────
CREATE OR REPLACE FUNCTION public.submit_user_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_detail text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reporter_id uuid;
  v_reported_user_id uuid;
  v_report_id uuid;
  v_reason_label text;
BEGIN
  v_reporter_id := auth.uid();
  IF v_reporter_id IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'login_required');
  END IF;

  IF p_target_type IS NULL OR p_target_id IS NULL OR trim(p_reason) = '' THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  IF p_target_type NOT IN ('post', 'comment', 'user') THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_target_type');
  END IF;

  IF p_target_type = 'post' THEN
    SELECT author_id INTO v_reported_user_id FROM public.posts WHERE id = p_target_id;
  ELSIF p_target_type = 'comment' THEN
    SELECT user_id INTO v_reported_user_id FROM public.comments WHERE id = p_target_id;
  ELSE
    v_reported_user_id := p_target_id;
  END IF;

  IF v_reported_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'target_not_found');
  END IF;

  IF v_reported_user_id = v_reporter_id THEN
    RETURN json_build_object('ok', false, 'reason', 'cannot_report_self');
  END IF;

  v_reason_label := COALESCE(NULLIF(trim(p_detail), ''), trim(p_reason));

  INSERT INTO public.reports (
    reporter_id,
    reported_user_id,
    target_type,
    target_id,
    reason,
    status,
    penalty_points
  )
  VALUES (
    v_reporter_id,
    v_reported_user_id,
    p_target_type,
    p_target_id,
    v_reason_label,
    'pending',
    0
  )
  RETURNING id INTO v_report_id;

  RETURN json_build_object(
    'ok', true,
    'report_id', v_report_id,
    'reported_user_id', v_reported_user_id,
    'status', 'pending'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'reason', 'server_error', 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.apply_auto_penalty(uuid, text, integer) IS
  '[자동 트랙] 시스템 감지 벌점 + 누적 기준 자동 정지 (penalty_config.engine_enabled)';

COMMENT ON FUNCTION public.apply_manual_penalty(uuid, text, integer, uuid) IS
  '[수동 트랙] 관리자 신고 심사 후 벌점 집행 (엔진 스위치 무관)';

COMMENT ON FUNCTION public.submit_user_report(text, uuid, text, text) IS
  '[수동 트랙] 유저 신고 접수 — reports pending INSERT 만 (자동 벌점 없음)';

REVOKE ALL ON FUNCTION public.apply_auto_penalty(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_auto_penalty(uuid, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_manual_penalty(uuid, text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_manual_penalty(uuid, text, integer, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_user_report(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_user_report(text, uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
