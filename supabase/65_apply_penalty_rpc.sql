-- =============================================================================
-- P!CKLE — 벌점 부여 엔진 (apply_penalty) + 유저 신고 접수 (submit_user_report)
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

-- penalty_config 확장 필드 병합 (기존 행 유지)
UPDATE public.system_settings
SET penalty_config = COALESCE(penalty_config, '{}'::jsonb) || '{
  "engine_enabled": true,
  "report_post_points": 10,
  "report_comment_points": 10,
  "admin_delete_points": 30
}'::jsonb
WHERE id = 1;

-- 유저 신고 INSERT (본인 신고만)
DROP POLICY IF EXISTS reports_insert_authenticated ON public.reports;
CREATE POLICY reports_insert_authenticated
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

GRANT INSERT ON public.reports TO authenticated;

-- ── 벌점 부여 (SECURITY DEFINER) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_penalty(
  p_user_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_invoke_source text DEFAULT 'client'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config jsonb;
  v_engine_enabled boolean;
  v_points integer := 0;
  v_new_total integer;
  v_reason text;
  v_penalty_type text;
  v_restricted_until timestamptz;
  v_is_banned boolean := false;
  v_auto_30 integer;
  v_auto_50 integer;
  v_auto_100 integer;
  v_auto_30_action text;
  v_auto_50_action text;
  v_is_admin boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_action IS NULL OR trim(p_action) = '' THEN
    RETURN json_build_object('ok', false, 'applied', false, 'reason', 'invalid_args');
  END IF;

  IF auth.uid() IS NULL AND COALESCE(p_invoke_source, 'client') <> 'submit_report' THEN
    RETURN json_build_object('ok', false, 'applied', false, 'reason', 'forbidden');
  END IF;

  -- 신고 접수 경로가 아닌 클라이언트 직접 호출 시 권한 검사
  IF COALESCE(p_invoke_source, 'client') = 'client' THEN
    IF trim(p_action) IN ('report_post', 'report_comment') THEN
      RETURN json_build_object('ok', false, 'applied', false, 'reason', 'use_submit_user_report');
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
  END IF;

  SELECT penalty_config
  INTO v_config
  FROM public.system_settings
  WHERE id = 1;

  IF v_config IS NULL THEN
    RETURN json_build_object('ok', true, 'applied', false, 'reason', 'engine_disabled');
  END IF;

  v_engine_enabled := CASE lower(trim(COALESCE(v_config->>'engine_enabled', 'false')))
    WHEN 'true' THEN true WHEN 't' THEN true WHEN '1' THEN true ELSE false END;

  IF NOT v_engine_enabled THEN
    RETURN json_build_object('ok', true, 'applied', false, 'reason', 'engine_disabled');
  END IF;

  v_points := CASE trim(p_action)
    WHEN 'report_post' THEN COALESCE((v_config->>'report_post_points')::integer, (v_config->>'score_abuse')::integer, 10)
    WHEN 'report_comment' THEN COALESCE((v_config->>'report_comment_points')::integer, (v_config->>'score_abuse')::integer, 10)
    WHEN 'admin_delete' THEN COALESCE((v_config->>'admin_delete_points')::integer, (v_config->>'score_spam')::integer, 30)
    WHEN 'abuse' THEN COALESCE((v_config->>'score_abuse')::integer, 10)
    WHEN 'spam' THEN COALESCE((v_config->>'score_spam')::integer, 30)
    WHEN 'illegal' THEN COALESCE((v_config->>'score_illegal')::integer, 50)
    WHEN 'nsfw' THEN COALESCE((v_config->>'score_illegal')::integer, 50)
  END;

  IF v_points IS NULL OR v_points <= 0 THEN
    RETURN json_build_object('ok', true, 'applied', false, 'reason', 'zero_points');
  END IF;

  v_penalty_type := trim(p_action);
  v_reason := COALESCE(
    NULLIF(trim(p_reason), ''),
    CASE trim(p_action)
      WHEN 'report_post' THEN '불판 신고 접수'
      WHEN 'report_comment' THEN '댓글 신고 접수'
      WHEN 'admin_delete' THEN '관리자 콘텐츠 삭제'
      WHEN 'abuse' THEN '욕설/비방/어그로'
      WHEN 'spam' THEN '광고/도배'
      WHEN 'illegal' THEN '음란/불법/혐오물'
      WHEN 'nsfw' THEN '음란/선정성'
      ELSE trim(p_action)
    END
  );

  SELECT u.penalty_points
  INTO v_new_total
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'applied', false, 'reason', 'user_not_found');
  END IF;

  v_new_total := v_new_total + v_points;

  UPDATE public.users
  SET penalty_points = v_new_total,
      updated_at = timezone('utc', now())
  WHERE id = p_user_id;

  v_auto_30 := COALESCE((v_config->>'auto_30_points')::integer, 30);
  v_auto_50 := COALESCE((v_config->>'auto_50_points')::integer, 50);
  v_auto_100 := COALESCE((v_config->>'auto_100_points')::integer, 100);
  v_auto_30_action := COALESCE(v_config->>'auto_30_action', 'suspend_3d');
  v_auto_50_action := COALESCE(v_config->>'auto_50_action', 'suspend_7d');

  -- 자동 제재 (높은 단계 우선)
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
    v_points,
    CASE
      WHEN trim(p_action) IN ('report_post', 'report_comment') THEN 'report'
      WHEN trim(p_action) = 'admin_delete' THEN 'admin'
      ELSE 'system'
    END
  );

  INSERT INTO public.penalty_logs (user_id, penalty_type, points_added, reason)
  VALUES (p_user_id, v_penalty_type, v_points, v_reason);

  RETURN json_build_object(
    'ok', true,
    'applied', true,
    'user_id', p_user_id,
    'action', trim(p_action),
    'points_added', v_points,
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

-- ── 유저 신고 접수 + 피신고자 벌점 ─────────────────────────────────────────
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
  v_penalty_action text;
  v_score_action text;
  v_report_id uuid;
  v_penalty_result json;
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
    v_penalty_action := 'report_post';
  ELSIF p_target_type = 'comment' THEN
    SELECT user_id INTO v_reported_user_id FROM public.comments WHERE id = p_target_id;
    v_penalty_action := 'report_comment';
  ELSE
    v_reported_user_id := p_target_id;
    v_penalty_action := 'report_post';
  END IF;

  IF v_reported_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'target_not_found');
  END IF;

  IF v_reported_user_id = v_reporter_id THEN
    RETURN json_build_object('ok', false, 'reason', 'cannot_report_self');
  END IF;

  v_score_action := CASE lower(trim(p_reason))
    WHEN 'spam' THEN 'spam'
    WHEN 'abuse' THEN 'abuse'
    WHEN 'nsfw' THEN 'nsfw'
    WHEN 'legal' THEN 'illegal'
    ELSE 'abuse'
  END;

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

  v_penalty_result := public.apply_penalty(
    v_reported_user_id,
    v_penalty_action,
    v_reason_label,
    p_target_type,
    p_target_id,
    'submit_report'
  );

  IF (v_penalty_result->>'applied')::boolean IS TRUE THEN
    UPDATE public.reports
    SET penalty_points = COALESCE((v_penalty_result->>'points_added')::integer, 0),
        status = 'sanctioned'
    WHERE id = v_report_id;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'report_id', v_report_id,
    'reported_user_id', v_reported_user_id,
    'penalty', v_penalty_result
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'reason', 'server_error', 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.apply_penalty(uuid, text, text, text, uuid, text) IS
  'system_settings.penalty_config 기반 벌점 부여 + 자동 제재';

COMMENT ON FUNCTION public.submit_user_report(text, uuid, text, text) IS
  '유저 신고 접수 후 피신고자에게 벌점 부여';

REVOKE ALL ON FUNCTION public.apply_penalty(uuid, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_penalty(uuid, text, text, text, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_user_report(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_user_report(text, uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
