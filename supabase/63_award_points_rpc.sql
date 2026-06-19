-- P!CKLE — 포인트 지급 RPC (SECURITY DEFINER, RLS 우회)
-- Supabase SQL Editor → 전체 복사 → Run

CREATE OR REPLACE FUNCTION public.award_points(p_user_id uuid, p_action text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config jsonb;
  v_engine_enabled boolean;
  v_amount integer := 0;
  v_config_key text;
  v_current_points integer;
  v_next_points integer;
  v_daily_cap integer;
  v_earned_today integer;
  v_log_reason text;
BEGIN
  IF p_user_id IS NULL OR p_action IS NULL OR trim(p_action) = '' THEN
    RETURN json_build_object('ok', false, 'awarded', false, 'reason', 'invalid_args');
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RETURN json_build_object('ok', false, 'awarded', false, 'reason', 'forbidden');
  END IF;

  v_config_key := CASE trim(p_action)
    WHEN 'signup' THEN 'signup_welcome'
    WHEN 'vote' THEN 'event_participate'
    WHEN 'comment' THEN 'ugc_comment'
    WHEN 'post' THEN 'ugc_post'
    WHEN 'event_share' THEN 'event_share'
    WHEN 'referral_inviter' THEN 'referral_inviter'
    WHEN 'referral_invitee' THEN 'referral_invitee'
    WHEN 'honor_weekly_best' THEN 'honor_weekly_best'
    WHEN 'honor_best_comment' THEN 'honor_best_comment'
    ELSE NULL
  END;

  IF v_config_key IS NULL THEN
    RETURN json_build_object('ok', false, 'awarded', false, 'reason', 'unknown_action');
  END IF;

  SELECT point_config
  INTO v_config
  FROM public.system_settings
  WHERE id = 1;

  IF v_config IS NULL THEN
    RETURN json_build_object('ok', false, 'awarded', false, 'reason', 'config_missing');
  END IF;

  v_engine_enabled := COALESCE((v_config->>'engine_enabled')::boolean, false);
  IF NOT v_engine_enabled THEN
    RETURN json_build_object('ok', true, 'awarded', false, 'reason', 'engine_disabled');
  END IF;

  v_log_reason := CASE trim(p_action)
    WHEN 'signup' THEN '가입 환영 보너스'
    WHEN 'vote' THEN '투표 참여'
    WHEN 'comment' THEN '댓글 작성'
    WHEN 'post' THEN '불판 등록'
    WHEN 'event_share' THEN '이벤트 공유'
    WHEN 'referral_inviter' THEN '친구 초대 (초대자)'
    WHEN 'referral_invitee' THEN '친구 초대 (피초대자)'
    WHEN 'honor_weekly_best' THEN '주간 베스트'
    WHEN 'honor_best_comment' THEN '베스트 댓글'
    ELSE trim(p_action)
  END;

  IF trim(p_action) = 'signup' THEN
    IF EXISTS (
      SELECT 1
      FROM public.point_logs pl
      WHERE pl.user_id = p_user_id
        AND pl.reason = v_log_reason
      LIMIT 1
    ) THEN
      RETURN json_build_object('ok', true, 'awarded', false, 'reason', 'already_awarded');
    END IF;
  END IF;

  v_amount := COALESCE((v_config->>v_config_key)::integer, 0);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN json_build_object('ok', true, 'awarded', false, 'reason', 'zero_amount');
  END IF;

  v_daily_cap := COALESCE((v_config->>'daily_cap')::integer, 0);
  IF v_daily_cap > 0 AND trim(p_action) NOT IN ('signup', 'referral_inviter', 'referral_invitee') THEN
    SELECT COALESCE(SUM(pl.amount), 0)::integer
    INTO v_earned_today
    FROM public.point_logs pl
    WHERE pl.user_id = p_user_id
      AND pl.amount > 0
      AND pl.created_at >= date_trunc('day', timezone('utc', now()))
      AND pl.reason NOT IN (
        '가입 환영 보너스',
        '친구 초대 (초대자)',
        '친구 초대 (피초대자)'
      );

    IF v_earned_today + v_amount > v_daily_cap THEN
      RETURN json_build_object('ok', true, 'awarded', false, 'reason', 'daily_cap_reached');
    END IF;
  END IF;

  SELECT u.points
  INTO v_current_points
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'awarded', false, 'reason', 'user_not_found');
  END IF;

  v_next_points := v_current_points + v_amount;

  UPDATE public.users
  SET points = v_next_points,
      updated_at = timezone('utc', now())
  WHERE id = p_user_id;

  INSERT INTO public.point_logs (user_id, amount, reason, balance_after)
  VALUES (p_user_id, v_amount, v_log_reason, v_next_points);

  RETURN json_build_object(
    'ok', true,
    'awarded', true,
    'amount', v_amount,
    'balance', v_next_points,
    'label', v_log_reason
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'ok', false,
      'awarded', false,
      'reason', 'server_error',
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.award_points(uuid, text) IS
  'system_settings.point_config 기반 포인트 지급 (본인 계정만, SECURITY DEFINER)';

REVOKE ALL ON FUNCTION public.award_points(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_points(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
