-- P!CKLE — 댓글 제재(2·3단계) 컬럼 + 관리자 벌점 부과 RPC

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS is_blind BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS restricted_until TIMESTAMPTZ;

COMMENT ON COLUMN public.comments.is_blind IS '관리자/시스템 블라인드 플래그 (2단계 제재)';
COMMENT ON COLUMN public.users.is_banned IS '영구 차단 플래그 (누적 벌점 50점 이상)';
COMMENT ON COLUMN public.users.restricted_until IS '기능 이용 정지 만료 시각 (누적 벌점 30점 이상)';

CREATE INDEX IF NOT EXISTS idx_comments_is_blind ON public.comments (is_blind) WHERE is_blind = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON public.users (is_banned) WHERE is_banned = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_restricted_until ON public.users (restricted_until)
  WHERE restricted_until IS NOT NULL;

-- 블라인드 시 is_blind 동기화
CREATE OR REPLACE FUNCTION public.admin_set_comment_visibility(p_comment_id uuid, p_status text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_comment_id IS NULL OR p_status IS NULL THEN
    RETURN FALSE;
  END IF;
  IF p_status NOT IN ('visible', 'blinded', 'deleted') THEN
    RETURN FALSE;
  END IF;
  UPDATE public.comments
  SET visibility_status = p_status,
      is_blind = (p_status = 'blinded'),
      updated_at = timezone('utc', now())
  WHERE id = p_comment_id;
  RETURN FOUND;
END;
$$;

-- 댓글 벌점 부과: 블라인드(2단계) + 벌점 10점 + 누적 제재(3단계)
CREATE OR REPLACE FUNCTION public.admin_apply_comment_penalty(
  p_comment_id uuid,
  p_penalty_points integer DEFAULT 10,
  p_reason text DEFAULT '댓글 규정 위반 (관리자 제재)'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_new_total integer;
  v_restricted_until timestamptz;
  v_is_banned boolean := FALSE;
BEGIN
  IF p_comment_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'comment_id_required');
  END IF;

  IF p_penalty_points IS NULL OR p_penalty_points < 0 THEN
    p_penalty_points := 10;
  END IF;

  SELECT c.user_id
  INTO v_user_id
  FROM public.comments c
  WHERE c.id = p_comment_id;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'comment_not_found');
  END IF;

  -- 2단계: 댓글 블라인드
  UPDATE public.comments
  SET is_blind = TRUE,
      visibility_status = 'blinded',
      updated_at = timezone('utc', now())
  WHERE id = p_comment_id;

  -- 벌점 가산
  UPDATE public.users
  SET penalty_points = penalty_points + p_penalty_points,
      updated_at = timezone('utc', now())
  WHERE id = v_user_id
  RETURNING penalty_points INTO v_new_total;

  -- 3단계: 누적 벌점별 제재
  IF v_new_total >= 50 THEN
    v_is_banned := TRUE;
    UPDATE public.users
    SET is_banned = TRUE,
        account_status = 'suspended',
        updated_at = timezone('utc', now())
    WHERE id = v_user_id;
  ELSIF v_new_total >= 30 THEN
    v_restricted_until := timezone('utc', now()) + interval '3 days';
    UPDATE public.users
    SET restricted_until = v_restricted_until,
        updated_at = timezone('utc', now())
    WHERE id = v_user_id;
  END IF;

  INSERT INTO public.user_penalties (user_id, reason, penalty_points, source_type)
  VALUES (v_user_id, COALESCE(NULLIF(trim(p_reason), ''), '댓글 규정 위반 (관리자 제재)'), p_penalty_points, 'admin');

  RETURN json_build_object(
    'ok', true,
    'comment_id', p_comment_id,
    'user_id', v_user_id,
    'penalty_added', p_penalty_points,
    'penalty_total', v_new_total,
    'is_blind', true,
    'is_banned', v_is_banned,
    'restricted_until', v_restricted_until
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_comment_penalty(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_apply_comment_penalty(uuid, integer, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
