-- =============================================================================
-- P!CKLE — 최고의 픽클러 (Top Pickler) 랭킹 DB 셋팅
-- 선행: 31_hot_grill_ranking.sql (hot_grill_ranking VIEW)
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

-- ── 0) user_follows 보장 (팬덤 점수 A 선행) ──

CREATE TABLE IF NOT EXISTS public.user_follows (
  follower_id   UUID NOT NULL,
  following_id  UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT user_follows_not_self CHECK (follower_id <> following_id)
);

ALTER TABLE public.user_follows
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_user_follows_following
  ON public.user_follows (following_id);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower
  ON public.user_follows (follower_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_follows'::regclass
      AND conname = 'user_follows_follower_id_fkey'
  ) THEN
    ALTER TABLE public.user_follows
      ADD CONSTRAINT user_follows_follower_id_fkey
      FOREIGN KEY (follower_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_follows'::regclass
      AND conname = 'user_follows_following_id_fkey'
  ) THEN
    ALTER TABLE public.user_follows
      ADD CONSTRAINT user_follows_following_id_fkey
      FOREIGN KEY (following_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_follows_select_all" ON public.user_follows;
CREATE POLICY "user_follows_select_all"
  ON public.user_follows FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.user_follows TO anon, authenticated;

-- ── 1) users.star_score 캐시 컬럼 (옵션) ──
-- 소수점 합산(크리에이터 0.1점)을 위해 DOUBLE PRECISION 사용

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS star_score DOUBLE PRECISION NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users.star_score IS
  '최고의 픽클러 Star Score 캐시 (top_pickler_ranking VIEW와 동기화 가능)';

CREATE INDEX IF NOT EXISTS idx_users_star_score_desc
  ON public.users (star_score DESC)
  WHERE account_status = 'active';

-- ── 2) 최고의 픽클러 실시간 랭킹 VIEW ──
-- A. 팬덤: 나를 팔로우한 수 × 10
-- B. 크리에이터: 내 불판에 댓글 단 고유 유저 수 × 0.1
-- C. 명예의 전당: hot_grill_ranking Top 10 게시물당 +500
-- D. 베스트 댓글: 0 (기능 미구현 — 고정)

CREATE OR REPLACE VIEW public.top_pickler_ranking AS
WITH fandom AS (
  SELECT
    uf.following_id AS user_id,
    COUNT(*)::INTEGER AS follower_count,
    (COUNT(*) * 10.0)::DOUBLE PRECISION AS fandom_score
  FROM public.user_follows uf
  GROUP BY uf.following_id
),
creator AS (
  SELECT
    p.author_id AS user_id,
    COUNT(DISTINCT c.user_id)::INTEGER AS unique_commenter_count,
    (COUNT(DISTINCT c.user_id) * 0.1)::DOUBLE PRECISION AS creator_score
  FROM public.posts p
  INNER JOIN public.comments c ON c.post_id = p.id
  WHERE c.visibility_status = 'visible'
    AND c.user_id <> p.author_id
  GROUP BY p.author_id
),
hot_top10 AS (
  SELECT
    hgr.post_id,
    hgr.author_id
  FROM (
    SELECT
      post_id,
      author_id,
      ROW_NUMBER() OVER (
        ORDER BY hot_grill_score DESC, created_at DESC, post_id
      ) AS rank_position
    FROM public.hot_grill_ranking
  ) hgr
  WHERE hgr.rank_position <= 10
),
honor AS (
  SELECT
    ht.author_id AS user_id,
    COUNT(*)::INTEGER AS honor_post_count,
    (COUNT(*) * 500.0)::DOUBLE PRECISION AS honor_hall_score
  FROM hot_top10 ht
  WHERE ht.author_id IS NOT NULL
  GROUP BY ht.author_id
)
SELECT
  u.id AS user_id,
  u.nickname,
  u.signup_platform,
  u.account_status,
  u.points,
  COALESCE(f.follower_count, 0) AS follower_count,
  COALESCE(f.fandom_score, 0)::DOUBLE PRECISION AS fandom_score,
  COALESCE(cr.unique_commenter_count, 0) AS unique_commenter_count,
  COALESCE(cr.creator_score, 0)::DOUBLE PRECISION AS creator_score,
  COALESCE(h.honor_post_count, 0) AS honor_post_count,
  COALESCE(h.honor_hall_score, 0)::DOUBLE PRECISION AS honor_hall_score,
  0::DOUBLE PRECISION AS best_comment_score,
  (
    COALESCE(f.fandom_score, 0)
    + COALESCE(cr.creator_score, 0)
    + COALESCE(h.honor_hall_score, 0)
    + 0
  )::DOUBLE PRECISION AS star_score_total
FROM public.users u
LEFT JOIN fandom f ON f.user_id = u.id
LEFT JOIN creator cr ON cr.user_id = u.id
LEFT JOIN honor h ON h.user_id = u.id
WHERE u.account_status = 'active';

COMMENT ON VIEW public.top_pickler_ranking IS
  '최고의 픽클러 — Star=(팔로워×10)+(고유댓글유저×0.1)+(핫불판Top10×500)+베스트댓글(0)';

-- ── 3) 캐시 컬럼 star_score ← VIEW 결과 동기화 (최초 1회) ──

UPDATE public.users u
SET
  star_score = v.star_score_total,
  updated_at = timezone('utc', now())
FROM public.top_pickler_ranking v
WHERE u.id = v.user_id;

GRANT SELECT ON public.top_pickler_ranking TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
