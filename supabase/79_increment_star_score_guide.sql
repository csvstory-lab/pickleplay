-- =============================================================================
-- P!CKLE — 랭킹 포인트 가이드 공식 increment_star_score v2
-- 선행: 25_ranking_scores.sql, 76_award_star_score_rpc.sql (star_score_action_log)
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

-- 이전 시그니처 정리 (사용자/마이그레이션별 오버로드 제거)
DROP FUNCTION IF EXISTS public.increment_star_score(UUID, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS public.increment_star_score(INTEGER);
DROP FUNCTION IF EXISTS public.increment_star_score(INTEGER, UUID);

-- ── 1) 가이드 기반 점수 증가 RPC ──
-- 본인: 투표 +1 · 댓글 +3 · 공유 +5
-- 타인: 나를 픽(팔로우) +10 (팔로우 관계 검증)
CREATE OR REPLACE FUNCTION public.increment_star_score(
  p_amount    INTEGER,
  p_target_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor     UUID := auth.uid();
  v_target    UUID := COALESCE(p_target_id, v_actor);
  v_new_score DOUBLE PRECISION;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  IF p_amount > 500 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_too_large');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_target) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  IF v_target = v_actor THEN
    -- 본인 활동: 가이드 허용 수치만
    IF p_amount NOT IN (1, 3, 5) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'self_amount_denied');
    END IF;
  ELSE
    -- 타인 지급: 나를 픽 +10 만 허용, 팔로우 관계 필수
    IF p_amount <> 10 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'cross_user_amount_denied');
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_follows uf
      WHERE uf.follower_id = v_actor
        AND uf.following_id = v_target
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'follow_required');
    END IF;
  END IF;

  UPDATE public.users
  SET star_score = GREATEST(0, COALESCE(star_score, 0) + p_amount)
  WHERE id = v_target
  RETURNING star_score INTO v_new_score;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_target,
    'amount', p_amount,
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

COMMENT ON FUNCTION public.increment_star_score(INTEGER, UUID) IS
  '랭킹 포인트 가이드 — 본인(1/3/5) 또는 픽받은 유저(+10)';

REVOKE ALL ON FUNCTION public.increment_star_score(INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_star_score(INTEGER, UUID) TO authenticated;

-- 팔로우 이중 지급 방지 (RPC 단일 경로)
DROP TRIGGER IF EXISTS trg_user_follows_star_score ON public.user_follows;

-- ── 2) 좋아요 10·20·30… 마일스톤 (+2, 작성자) ──
CREATE OR REPLACE FUNCTION public.award_post_like_milestone(
  p_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id   UUID := auth.uid();
  v_author_id  UUID;
  v_like_count INTEGER;
  v_dedupe_key TEXT;
  v_bump       DOUBLE PRECISION;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'auth_required');
  END IF;

  IF p_post_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'post_id_required');
  END IF;

  SELECT p.author_id, p.like_count
  INTO v_author_id, v_like_count
  FROM public.posts p
  WHERE p.id = p_post_id;

  IF v_author_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'post_not_found');
  END IF;

  IF v_like_count < 10 OR v_like_count % 10 <> 0 THEN
    RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'not_milestone');
  END IF;

  v_dedupe_key := 'post_like:' || p_post_id::text || ':' || v_like_count::text;

  BEGIN
    INSERT INTO public.star_score_action_log (beneficiary_id, action_type, dedupe_key, delta)
    VALUES (v_author_id, 'LIKE_MILESTONE', v_dedupe_key, 2);
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'already_awarded');
  END;

  UPDATE public.users
  SET star_score = GREATEST(0, COALESCE(star_score, 0) + 2)
  WHERE id = v_author_id
  RETURNING star_score INTO v_bump;

  RETURN jsonb_build_object(
    'ok', true,
    'awarded', true,
    'action', 'LIKE_MILESTONE',
    'delta', 2,
    'user_id', v_author_id,
    'star_score', v_bump
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

COMMENT ON FUNCTION public.award_post_like_milestone(UUID) IS
  '불판 좋아요 10개 단위 시 작성자 star_score +2 (중복 방지)';

REVOKE ALL ON FUNCTION public.award_post_like_milestone(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_post_like_milestone(UUID) TO authenticated;

-- ── 3) 고도화 점수 (서버 트리거·배치 — 재확인) ──
-- · Top10(명예의 전당) +500: posts.honor_notified_at 설정 시 trg_posts_honor_star_bonus
-- · 베스트 댓글 +50: comment_likes 50개 시 trg_comment_likes_best_comment
-- · 마감 배치: pickle_process_due_post_notifications() → pickle_try_honor_notification()

CREATE OR REPLACE FUNCTION public.trg_fn_posts_honor_star_bonus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.honor_notified_at IS NULL
     AND NEW.honor_notified_at IS NOT NULL
     AND NEW.author_id IS NOT NULL THEN
    PERFORM public.pickle_bump_user_star_score(NEW.author_id, 500);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_honor_star_bonus ON public.posts;
CREATE TRIGGER trg_posts_honor_star_bonus
  AFTER UPDATE OF honor_notified_at ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_posts_honor_star_bonus();

CREATE OR REPLACE FUNCTION public.trg_fn_comment_likes_best_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment RECORD;
  v_new_count INTEGER;
BEGIN
  UPDATE public.comments
  SET like_count = like_count + 1
  WHERE id = NEW.comment_id
  RETURNING id, user_id, like_count, best_comment_star_awarded, visibility_status
  INTO v_comment;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_new_count := v_comment.like_count;

  IF v_new_count >= 50
     AND NOT v_comment.best_comment_star_awarded
     AND v_comment.visibility_status = 'visible'
     AND v_comment.user_id IS NOT NULL THEN
    UPDATE public.comments
    SET best_comment_star_awarded = TRUE
    WHERE id = v_comment.id;

    PERFORM public.pickle_bump_user_star_score(v_comment.user_id, 50);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_likes_best_comment ON public.comment_likes;
CREATE TRIGGER trg_comment_likes_best_comment
  AFTER INSERT ON public.comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_comment_likes_best_comment();

NOTIFY pgrst, 'reload schema';
