-- =============================================================================
-- P!CKLE — star_score(랭킹 포인트) 가이드 기반 지급 RPC + 게시물 좋아요
-- 선행: 25_ranking_scores.sql
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

-- 게시물 좋아요 (핫 불판 좋아요 마일스톤용)
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (post_id, user_id)
);

COMMENT ON TABLE public.post_likes IS '불판 좋아요 — 10개 단위 시 작성자 star_score +2';

CREATE INDEX IF NOT EXISTS idx_post_likes_post_id
  ON public.post_likes (post_id, created_at DESC);

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.posts.like_count IS '불판 좋아요 수 (캐시)';

-- 중복 지급 방지 로그
CREATE TABLE IF NOT EXISTS public.star_score_action_log (
  beneficiary_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action_type    TEXT NOT NULL,
  dedupe_key     TEXT NOT NULL,
  delta          DOUBLE PRECISION NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (beneficiary_id, action_type, dedupe_key)
);

COMMENT ON TABLE public.star_score_action_log IS 'star_score 가이드 지급 중복 방지';

-- post_likes → like_count 동기화
CREATE OR REPLACE FUNCTION public.trg_fn_post_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET like_count = like_count + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET like_count = GREATEST(0, like_count - 1)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_likes_count ON public.post_likes;
CREATE TRIGGER trg_post_likes_count
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_post_likes_count();

-- 팔로우 +10 은 RPC 단일 경로로 통일 (이중 지급 방지)
DROP TRIGGER IF EXISTS trg_user_follows_star_score ON public.user_follows;

-- RLS (post_likes)
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS post_likes_select_all ON public.post_likes;
CREATE POLICY post_likes_select_all
  ON public.post_likes FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS post_likes_insert_own ON public.post_likes;
CREATE POLICY post_likes_insert_own
  ON public.post_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS post_likes_delete_own ON public.post_likes;
CREATE POLICY post_likes_delete_own
  ON public.post_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;
GRANT SELECT ON public.post_likes TO anon;

-- star_score 가이드 지급 RPC
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

  PERFORM public.pickle_bump_user_star_score(p_target_user_id, v_delta);

  RETURN jsonb_build_object(
    'ok', true,
    'awarded', true,
    'action', v_action,
    'delta', v_delta,
    'user_id', p_target_user_id
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

COMMENT ON FUNCTION public.award_star_score(uuid, text, jsonb) IS
  '랭킹 포인트 가이드 기준 star_score 지급 (VOTE/COMMENT/SHARE/PICK_ME/LIKE_MILESTONE)';

REVOKE ALL ON FUNCTION public.award_star_score(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_star_score(uuid, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
