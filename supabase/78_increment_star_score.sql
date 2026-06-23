-- =============================================================================
-- P!CKLE — increment_star_score (RLS 우회 점수 bump) + award_star_score 연동
-- 선행: 25_ranking_scores.sql, 76_award_star_score_rpc.sql
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

-- ── 1) 저수준 star_score 증가 RPC (SECURITY DEFINER → users RLS 우회) ──
CREATE OR REPLACE FUNCTION public.increment_star_score(
  p_user_id UUID,
  p_delta   DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_score DOUBLE PRECISION;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_user');
  END IF;

  IF p_delta IS NULL OR p_delta = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_delta');
  END IF;

  IF ABS(p_delta) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'delta_too_large');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  UPDATE public.users
  SET star_score = GREATEST(0, COALESCE(star_score, 0) + p_delta)
  WHERE id = p_user_id
  RETURNING star_score INTO v_new_score;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'delta', p_delta,
    'star_score', v_new_score
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'server_error',
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.increment_star_score(UUID, DOUBLE PRECISION) IS
  'users.star_score에 p_delta를 더함 (SECURITY DEFINER). award_star_score에서 호출.';

REVOKE ALL ON FUNCTION public.increment_star_score(UUID, DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_star_score(UUID, DOUBLE PRECISION) TO authenticated;

-- ── 2) award_star_score → increment_star_score 사용 (pickle_bump 대체) ──
CREATE OR REPLACE FUNCTION public.award_star_score(
  p_target_user_id UUID,
  p_action         TEXT,
  p_extra          JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id      UUID := auth.uid();
  v_action        TEXT := upper(trim(COALESCE(p_action, '')));
  v_delta         DOUBLE PRECISION := 0;
  v_dedupe_key    TEXT;
  v_post_id       UUID;
  v_comment_id    UUID;
  v_current_likes INTEGER;
  v_author_id     UUID;
  v_bump          JSONB;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'auth_required');
  END IF;

  IF p_target_user_id IS NULL OR v_action = '' THEN
    RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'invalid_args');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_target_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'user_not_found');
  END IF;

  v_post_id := NULLIF(trim(COALESCE(p_extra->>'postId', p_extra->>'post_id', '')), '')::uuid;
  v_comment_id := NULLIF(trim(COALESCE(p_extra->>'commentId', p_extra->>'comment_id', '')), '')::uuid;

  IF v_action = 'VOTE' THEN
    v_delta := 1;
    IF v_post_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'post_id_required');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.votes v
      WHERE v.post_id = v_post_id AND v.user_id = v_actor_id
    ) THEN
      RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'vote_not_found');
    END IF;
    SELECT p.author_id INTO v_author_id FROM public.posts p WHERE p.id = v_post_id;
    IF v_author_id IS DISTINCT FROM p_target_user_id THEN
      RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'author_mismatch');
    END IF;
    v_dedupe_key := 'vote:' || v_post_id::text || ':' || v_actor_id::text;

  ELSIF v_action = 'COMMENT' THEN
    v_delta := 3;
    IF v_comment_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.comments c
        WHERE c.id = v_comment_id AND c.user_id = v_actor_id
      ) THEN
        RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'comment_not_found');
      END IF;
      SELECT c.post_id, p.author_id
      INTO v_post_id, v_author_id
      FROM public.comments c
      JOIN public.posts p ON p.id = c.post_id
      WHERE c.id = v_comment_id;
    ELSIF v_post_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.comments c
        WHERE c.post_id = v_post_id AND c.user_id = v_actor_id
        ORDER BY c.created_at DESC
        LIMIT 1
      ) THEN
        RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'comment_not_found');
      END IF;
      SELECT p.author_id INTO v_author_id FROM public.posts p WHERE p.id = v_post_id;
      SELECT c.id INTO v_comment_id
      FROM public.comments c
      WHERE c.post_id = v_post_id AND c.user_id = v_actor_id
      ORDER BY c.created_at DESC
      LIMIT 1;
    ELSE
      RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'comment_ref_required');
    END IF;
    IF v_author_id IS DISTINCT FROM p_target_user_id THEN
      RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'author_mismatch');
    END IF;
    v_dedupe_key := 'comment:' || v_comment_id::text;

  ELSIF v_action = 'SHARE' THEN
    v_delta := 5;
    IF v_post_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'post_id_required');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.post_shares ps
      WHERE ps.post_id = v_post_id
        AND (ps.user_id = v_actor_id OR ps.user_id IS NULL)
        AND ps.created_at > timezone('utc', now()) - interval '10 minutes'
    ) THEN
      RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'share_not_found');
    END IF;
    SELECT p.author_id INTO v_author_id FROM public.posts p WHERE p.id = v_post_id;
    IF v_author_id IS DISTINCT FROM p_target_user_id THEN
      RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'author_mismatch');
    END IF;
    SELECT ps.id::text INTO v_dedupe_key
    FROM public.post_shares ps
    WHERE ps.post_id = v_post_id
      AND (ps.user_id = v_actor_id OR ps.user_id IS NULL)
    ORDER BY ps.created_at DESC
    LIMIT 1;
    v_dedupe_key := 'share:' || COALESCE(v_dedupe_key, v_post_id::text || ':' || v_actor_id::text);

  ELSIF v_action = 'PICK_ME' THEN
    v_delta := 10;
    IF NOT EXISTS (
      SELECT 1 FROM public.user_follows uf
      WHERE uf.follower_id = v_actor_id AND uf.following_id = p_target_user_id
    ) THEN
      RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'follow_not_found');
    END IF;
    IF p_target_user_id = v_actor_id THEN
      RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'self_follow');
    END IF;
    v_dedupe_key := 'follow:' || v_actor_id::text;

  ELSIF v_action = 'LIKE_MILESTONE' THEN
    v_current_likes := COALESCE(
      NULLIF(trim(COALESCE(p_extra->>'currentLikes', p_extra->>'current_likes', '')), '')::integer,
      0
    );
    IF v_post_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'post_id_required');
    END IF;
    IF v_current_likes < 10 OR v_current_likes % 10 <> 0 THEN
      RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'not_milestone');
    END IF;
    SELECT p.author_id, p.like_count
    INTO v_author_id, v_current_likes
    FROM public.posts p
    WHERE p.id = v_post_id;
    IF v_author_id IS DISTINCT FROM p_target_user_id THEN
      RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'author_mismatch');
    END IF;
    IF v_current_likes < 10 OR v_current_likes % 10 <> 0 THEN
      RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'count_mismatch');
    END IF;
    v_delta := 2;
    v_dedupe_key := 'post_like:' || v_post_id::text || ':' || v_current_likes::text;

  ELSE
    RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'unknown_action');
  END IF;

  IF v_delta <= 0 OR v_dedupe_key IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'zero_delta');
  END IF;

  BEGIN
    INSERT INTO public.star_score_action_log (beneficiary_id, action_type, dedupe_key, delta)
    VALUES (p_target_user_id, v_action, v_dedupe_key, v_delta);
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'already_awarded');
  END;

  v_bump := public.increment_star_score(p_target_user_id, v_delta);
  IF COALESCE((v_bump->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'awarded', false,
      'reason', COALESCE(v_bump->>'reason', 'increment_failed'),
      'error', v_bump->>'error'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'awarded', true,
    'action', v_action,
    'delta', v_delta,
    'user_id', p_target_user_id,
    'star_score', (v_bump->>'star_score')::double precision
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'awarded', false,
      'reason', 'server_error',
      'error', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.award_star_score(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_star_score(uuid, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
