-- =============================================================================
-- P!CKLE — 투트랙 랭킹 (star_score · fire_score) + 자동 트리거
-- 선행: 01~24 마이그레이션 실행 완료
--
-- [최고의 픽클러] users.star_score
--   · 팔로워 1명 +10  · 내 불판 참여 유저(투표/댓글) 1명 +0.1
--   · 명예의 전당 등록 +500  · 베스트 댓글(좋아요 50+) +50
-- [핫 불판] posts.fire_score
--   · 투표 +1  · 조회 +0.1  · 댓글 +3  · 공유 +5
-- =============================================================================

-- ── 1) 스코어 컬럼 ──
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS star_score DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS fire_score DOUBLE PRECISION NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users.star_score IS '최고의 픽클러 랭킹 점수 (자동 누적)';
COMMENT ON COLUMN public.posts.fire_score IS '핫 불판 랭킹 점수 (자동 누적)';

CREATE INDEX IF NOT EXISTS idx_users_star_score_desc
  ON public.users (star_score DESC)
  WHERE account_status = 'active';

CREATE INDEX IF NOT EXISTS idx_posts_fire_score_desc
  ON public.posts (fire_score DESC)
  WHERE visibility_status = 'visible';

-- ── 2) 보조 테이블 (팔로우 · 조회 · 공유 · 댓글 좋아요 · 크리에이터 참여 추적) ──

CREATE TABLE IF NOT EXISTS public.user_follows (
  follower_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  following_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT user_follows_not_self CHECK (follower_id <> following_id)
);

COMMENT ON TABLE public.user_follows IS '맞픽(팔로우) — follower가 following을 팔로우';

CREATE INDEX IF NOT EXISTS idx_user_follows_following
  ON public.user_follows (following_id);

CREATE TABLE IF NOT EXISTS public.post_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  viewer_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  viewer_key  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.post_views IS '불판 조회(재생) — fire_score +0.1/회';

CREATE INDEX IF NOT EXISTS idx_post_views_post_id
  ON public.post_views (post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.post_shares (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  share_channel  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.post_shares IS '불판 공유 — fire_score +5/회';

CREATE INDEX IF NOT EXISTS idx_post_shares_post_id
  ON public.post_shares (post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.comment_likes (
  comment_id  UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (comment_id, user_id)
);

COMMENT ON TABLE public.comment_likes IS '댓글 좋아요 — 50개 이상 시 작성자 star_score +50';

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment
  ON public.comment_likes (comment_id);

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_comment_star_awarded BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.comments.like_count IS '댓글 좋아요 수 (캐시)';
COMMENT ON COLUMN public.comments.best_comment_star_awarded IS '베스트 댓글 star_score +50 지급 여부';

CREATE TABLE IF NOT EXISTS public.author_participants (
  author_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  participant_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (author_id, participant_id),
  CONSTRAINT author_participants_not_self CHECK (author_id <> participant_id)
);

COMMENT ON TABLE public.author_participants IS '크리에이터별 고유 참여 유저 (투표/댓글) — star_score +0.1/명';

-- ── 3) 점수 bump 헬퍼 ──

CREATE OR REPLACE FUNCTION public.pickle_bump_user_star_score(
  p_user_id UUID,
  p_delta   DOUBLE PRECISION
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
    RETURN;
  END IF;
  UPDATE public.users
  SET star_score = GREATEST(0, star_score + p_delta)
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pickle_bump_post_fire_score(
  p_post_id UUID,
  p_delta   DOUBLE PRECISION
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_post_id IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
    RETURN;
  END IF;
  UPDATE public.posts
  SET fire_score = GREATEST(0, fire_score + p_delta)
  WHERE id = p_post_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pickle_bump_user_star_score(UUID, DOUBLE PRECISION) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pickle_bump_post_fire_score(UUID, DOUBLE PRECISION) FROM PUBLIC;

-- ── 4) 크리에이터 참여 (+0.1) ──

CREATE OR REPLACE FUNCTION public.pickle_try_award_author_participant(
  p_post_id         UUID,
  p_participant_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id UUID;
  v_inserted  BOOLEAN := FALSE;
BEGIN
  IF p_post_id IS NULL OR p_participant_id IS NULL THEN
    RETURN;
  END IF;

  SELECT author_id INTO v_author_id
  FROM public.posts
  WHERE id = p_post_id;

  IF v_author_id IS NULL OR v_author_id = p_participant_id THEN
    RETURN;
  END IF;

  WITH ins AS (
    INSERT INTO public.author_participants (author_id, participant_id)
    VALUES (v_author_id, p_participant_id)
    ON CONFLICT (author_id, participant_id) DO NOTHING
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM ins) INTO v_inserted;

  IF v_inserted THEN
    PERFORM public.pickle_bump_user_star_score(v_author_id, 0.1);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.pickle_try_award_author_participant(UUID, UUID) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════
-- fire_score 트리거
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_fn_votes_fire_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.pickle_bump_post_fire_score(NEW.post_id, 1);
  PERFORM public.pickle_try_award_author_participant(NEW.post_id, NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_votes_fire_score ON public.votes;
CREATE TRIGGER trg_votes_fire_score
  AFTER INSERT ON public.votes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_votes_fire_score();

CREATE OR REPLACE FUNCTION public.trg_fn_comments_fire_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.visibility_status IS DISTINCT FROM 'visible' THEN
    RETURN NEW;
  END IF;
  IF NEW.ai_filter_status = 'blocked' THEN
    RETURN NEW;
  END IF;

  PERFORM public.pickle_bump_post_fire_score(NEW.post_id, 3);
  PERFORM public.pickle_try_award_author_participant(NEW.post_id, NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_fire_score ON public.comments;
CREATE TRIGGER trg_comments_fire_score
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_comments_fire_score();

CREATE OR REPLACE FUNCTION public.trg_fn_post_views_fire_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.pickle_bump_post_fire_score(NEW.post_id, 0.1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_views_fire_score ON public.post_views;
CREATE TRIGGER trg_post_views_fire_score
  AFTER INSERT ON public.post_views
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_post_views_fire_score();

CREATE OR REPLACE FUNCTION public.trg_fn_post_shares_fire_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.pickle_bump_post_fire_score(NEW.post_id, 5);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_shares_fire_score ON public.post_shares;
CREATE TRIGGER trg_post_shares_fire_score
  AFTER INSERT ON public.post_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_post_shares_fire_score();

-- ═══════════════════════════════════════════════════════════════
-- star_score 트리거
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_fn_user_follows_star_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.pickle_bump_user_star_score(NEW.following_id, 10);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.pickle_bump_user_star_score(OLD.following_id, -10);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_follows_star_score ON public.user_follows;
CREATE TRIGGER trg_user_follows_star_score
  AFTER INSERT OR DELETE ON public.user_follows
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_user_follows_star_score();

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

CREATE OR REPLACE FUNCTION public.trg_fn_comment_likes_unlike()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.comments
  SET like_count = GREATEST(0, like_count - 1)
  WHERE id = OLD.comment_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_likes_unlike ON public.comment_likes;
CREATE TRIGGER trg_comment_likes_unlike
  AFTER DELETE ON public.comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_comment_likes_unlike();

-- ═══════════════════════════════════════════════════════════════
-- 기존 데이터 백필 (1회)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pickle_backfill_ranking_scores()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  UPDATE public.users SET star_score = 0;
  UPDATE public.posts SET fire_score = 0;
  TRUNCATE public.author_participants;

  -- fire_score: 투표
  UPDATE public.posts p
  SET fire_score = fire_score + COALESCE(v.cnt, 0)
  FROM (
    SELECT post_id, COUNT(*)::DOUBLE PRECISION AS cnt
    FROM public.votes
    GROUP BY post_id
  ) v
  WHERE p.id = v.post_id;

  -- fire_score: 댓글
  UPDATE public.posts p
  SET fire_score = fire_score + COALESCE(c.cnt, 0) * 3
  FROM (
    SELECT post_id, COUNT(*)::DOUBLE PRECISION AS cnt
    FROM public.comments
    WHERE visibility_status = 'visible'
      AND ai_filter_status <> 'blocked'
    GROUP BY post_id
  ) c
  WHERE p.id = c.post_id;

  -- fire_score: 조회
  UPDATE public.posts p
  SET fire_score = fire_score + COALESCE(vw.cnt, 0) * 0.1
  FROM (
    SELECT post_id, COUNT(*)::DOUBLE PRECISION AS cnt
    FROM public.post_views
    GROUP BY post_id
  ) vw
  WHERE p.id = vw.post_id;

  -- fire_score: 공유
  UPDATE public.posts p
  SET fire_score = fire_score + COALESCE(sh.cnt, 0) * 5
  FROM (
    SELECT post_id, COUNT(*)::DOUBLE PRECISION AS cnt
    FROM public.post_shares
    GROUP BY post_id
  ) sh
  WHERE p.id = sh.post_id;

  -- author_participants + star_score creator
  INSERT INTO public.author_participants (author_id, participant_id)
  SELECT DISTINCT p.author_id, v.user_id
  FROM public.votes v
  JOIN public.posts p ON p.id = v.post_id
  WHERE p.author_id IS NOT NULL
    AND v.user_id IS NOT NULL
    AND p.author_id <> v.user_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.author_participants (author_id, participant_id)
  SELECT DISTINCT p.author_id, c.user_id
  FROM public.comments c
  JOIN public.posts p ON p.id = c.post_id
  WHERE p.author_id IS NOT NULL
    AND c.user_id IS NOT NULL
    AND p.author_id <> c.user_id
    AND c.visibility_status = 'visible'
    AND c.ai_filter_status <> 'blocked'
  ON CONFLICT DO NOTHING;

  UPDATE public.users u
  SET star_score = star_score + COALESCE(ap.cnt, 0) * 0.1
  FROM (
    SELECT author_id, COUNT(*)::DOUBLE PRECISION AS cnt
    FROM public.author_participants
    GROUP BY author_id
  ) ap
  WHERE u.id = ap.author_id;

  -- star_score: 팔로워
  UPDATE public.users u
  SET star_score = star_score + COALESCE(f.cnt, 0) * 10
  FROM (
    SELECT following_id, COUNT(*)::DOUBLE PRECISION AS cnt
    FROM public.user_follows
    GROUP BY following_id
  ) f
  WHERE u.id = f.following_id;

  -- star_score: 명예의 전당
  UPDATE public.users u
  SET star_score = star_score + COALESCE(h.cnt, 0) * 500
  FROM (
    SELECT author_id, COUNT(*)::DOUBLE PRECISION AS cnt
    FROM public.posts
    WHERE honor_notified_at IS NOT NULL
      AND author_id IS NOT NULL
    GROUP BY author_id
  ) h
  WHERE u.id = h.author_id;

  -- like_count 동기화 (베스트 댓글 판정 전)
  UPDATE public.comments c
  SET like_count = COALESCE(l.cnt, 0)
  FROM (
    SELECT comment_id, COUNT(*)::INTEGER AS cnt
    FROM public.comment_likes
    GROUP BY comment_id
  ) l
  WHERE c.id = l.comment_id;

  -- star_score: 베스트 댓글 (like_count >= 50)
  UPDATE public.comments c
  SET best_comment_star_awarded = TRUE
  WHERE c.like_count >= 50
    AND c.visibility_status = 'visible'
    AND c.user_id IS NOT NULL
    AND NOT c.best_comment_star_awarded;

  UPDATE public.users u
  SET star_score = star_score + 50
  FROM public.comments c
  WHERE c.user_id = u.id
    AND c.best_comment_star_awarded = TRUE
    AND c.like_count >= 50;
END;
$$;

REVOKE ALL ON FUNCTION public.pickle_backfill_ranking_scores() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pickle_backfill_ranking_scores() TO service_role;

-- ── 5) RLS ──

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_follows_select_all" ON public.user_follows;
CREATE POLICY "user_follows_select_all"
  ON public.user_follows FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "user_follows_insert_own" ON public.user_follows;
CREATE POLICY "user_follows_insert_own"
  ON public.user_follows FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS "user_follows_delete_own" ON public.user_follows;
CREATE POLICY "user_follows_delete_own"
  ON public.user_follows FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid());

DROP POLICY IF EXISTS "post_views_insert_all" ON public.post_views;
CREATE POLICY "post_views_insert_all"
  ON public.post_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "post_views_select_all" ON public.post_views;
CREATE POLICY "post_views_select_all"
  ON public.post_views FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "post_shares_insert_all" ON public.post_shares;
CREATE POLICY "post_shares_insert_all"
  ON public.post_shares FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "post_shares_select_all" ON public.post_shares;
CREATE POLICY "post_shares_select_all"
  ON public.post_shares FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "comment_likes_select_all" ON public.comment_likes;
CREATE POLICY "comment_likes_select_all"
  ON public.comment_likes FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "comment_likes_insert_own" ON public.comment_likes;
CREATE POLICY "comment_likes_insert_own"
  ON public.comment_likes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "comment_likes_delete_own" ON public.comment_likes;
CREATE POLICY "comment_likes_delete_own"
  ON public.comment_likes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "author_participants_select_all" ON public.author_participants;
CREATE POLICY "author_participants_select_all"
  ON public.author_participants FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.user_follows TO anon, authenticated;
GRANT INSERT, DELETE ON public.user_follows TO authenticated;
GRANT SELECT, INSERT ON public.post_views TO anon, authenticated;
GRANT SELECT, INSERT ON public.post_shares TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.comment_likes TO authenticated;
GRANT SELECT ON public.comment_likes TO anon;
GRANT SELECT ON public.author_participants TO authenticated;

NOTIFY pgrst, 'reload schema';
