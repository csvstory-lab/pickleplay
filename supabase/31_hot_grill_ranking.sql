-- =============================================================================
-- P!CKLE — 핫 불판 (Hot Grill) 랭킹 DB 셋팅
-- 대상 테이블: public.posts (메인 불판)
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

-- ── 0-a) post_views (조회 로그 — backfill·view_count 선행 테이블) ──

CREATE TABLE IF NOT EXISTS public.post_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  viewer_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  viewer_key  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT post_views_actor_required CHECK (
    user_id IS NOT NULL
    OR viewer_id IS NOT NULL
    OR (viewer_key IS NOT NULL AND trim(viewer_key) <> '')
  )
);

COMMENT ON TABLE public.post_views IS '불판 조회(재생) 로그 — 핫 불판 view_count 집계용';
COMMENT ON COLUMN public.post_views.user_id IS '조회한 회원 UUID (비회원 NULL)';
COMMENT ON COLUMN public.post_views.viewer_id IS '조회 회원 UUID — JS(pickle-ranking-events) 호환 alias';
COMMENT ON COLUMN public.post_views.viewer_key IS '비회원·기기 식별 키 (중복 조회 방지)';

CREATE OR REPLACE FUNCTION public.trg_post_views_sync_user_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.viewer_id IS NOT NULL AND NEW.user_id IS NULL THEN
    NEW.user_id := NEW.viewer_id;
  ELSIF NEW.user_id IS NOT NULL AND NEW.viewer_id IS NULL THEN
    NEW.viewer_id := NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_views_sync_user_columns ON public.post_views;
CREATE TRIGGER trg_post_views_sync_user_columns
  BEFORE INSERT OR UPDATE ON public.post_views
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_post_views_sync_user_columns();

CREATE INDEX IF NOT EXISTS idx_post_views_post_id
  ON public.post_views (post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_views_user_id
  ON public.post_views (user_id)
  WHERE user_id IS NOT NULL;

-- 회원: 동일 불판 1인 1회만 집계 (user_id · viewer_id 동기화 후 user_id 기준)
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_views_unique_member
  ON public.post_views (post_id, user_id)
  WHERE user_id IS NOT NULL;

-- 비회원: viewer_key 기준 1회만 집계
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_views_unique_guest
  ON public.post_views (post_id, viewer_key)
  WHERE user_id IS NULL AND viewer_key IS NOT NULL;

ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT, INSERT ON public.post_views TO anon, authenticated;

-- 25_ranking_scores.sql 선행 실행 시 컬럼 보강
ALTER TABLE public.post_views
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.post_views
  ADD COLUMN IF NOT EXISTS viewer_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.post_views
  ADD COLUMN IF NOT EXISTS viewer_key TEXT;

-- ── 0-b) post_shares (공유 로그 — share_count backfill 선행 테이블) ──

CREATE TABLE IF NOT EXISTS public.post_shares (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  share_channel  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.post_shares IS '불판 공유 로그 — 핫 불판 share_count 집계용';

CREATE INDEX IF NOT EXISTS idx_post_shares_post_id
  ON public.post_shares (post_id, created_at DESC);

ALTER TABLE public.post_shares ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT, INSERT ON public.post_shares TO anon, authenticated;

-- ── 1) 필수 카운트 컬럼 추가 ──

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS vote_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.posts.vote_count IS '핫 불판 — 누적 투표 수 (캐시)';
COMMENT ON COLUMN public.posts.view_count IS '핫 불판 — 누적 조회 수 (캐시)';
COMMENT ON COLUMN public.posts.comment_count IS '핫 불판 — 누적 댓글 수 (캐시)';
COMMENT ON COLUMN public.posts.share_count IS '핫 불판 — 누적 공유 수 (캐시)';

-- ── 1-b) 기존 데이터 카운트 backfill (최초 1회) ──

UPDATE public.posts p
SET vote_count = COALESCE(v.cnt, 0)
FROM (
  SELECT post_id, COUNT(*)::INTEGER AS cnt
  FROM public.votes
  GROUP BY post_id
) v
WHERE p.id = v.post_id;

UPDATE public.posts p
SET comment_count = COALESCE(c.cnt, 0)
FROM (
  SELECT post_id, COUNT(*)::INTEGER AS cnt
  FROM public.comments
  GROUP BY post_id
) c
WHERE p.id = c.post_id;

UPDATE public.posts p
SET view_count = COALESCE(vw.cnt, 0)
FROM (
  SELECT post_id, COUNT(*)::INTEGER AS cnt
  FROM public.post_views
  GROUP BY post_id
) vw
WHERE p.id = vw.post_id;

UPDATE public.posts p
SET share_count = COALESCE(sh.cnt, 0)
FROM (
  SELECT post_id, COUNT(*)::INTEGER AS cnt
  FROM public.post_shares
  GROUP BY post_id
) sh
WHERE p.id = sh.post_id;

-- ── 2) 핫 불판 실시간 랭킹 VIEW ──
-- raw_hot_score = (투표×1) + (조회×0.1) + (댓글×3) + (공유×5)
-- time_decay    = 1 / (1 + 경과시간(시간)/24)^1.35  → 최신 글 가중
-- hot_grill_score = raw_hot_score × time_decay

CREATE OR REPLACE VIEW public.hot_grill_ranking AS
SELECT
  p.id AS post_id,
  p.author_id,
  p.title,
  p.category,
  p.visibility_status,
  p.created_at,
  p.vote_count,
  p.view_count,
  p.comment_count,
  p.share_count,
  (
    (p.vote_count * 1.0)
    + (p.view_count * 0.1)
    + (p.comment_count * 3.0)
    + (p.share_count * 5.0)
  )::DOUBLE PRECISION AS raw_hot_score,
  (
    1.0 / POWER(
      1.0 + (
        GREATEST(
          EXTRACT(EPOCH FROM (timezone('utc', now()) - p.created_at)) / 3600.0,
          0.0
        ) / 24.0
      ),
      1.35
    )
  )::DOUBLE PRECISION AS time_decay_factor,
  (
    (
      (p.vote_count * 1.0)
      + (p.view_count * 0.1)
      + (p.comment_count * 3.0)
      + (p.share_count * 5.0)
    )
    * (
      1.0 / POWER(
        1.0 + (
          GREATEST(
            EXTRACT(EPOCH FROM (timezone('utc', now()) - p.created_at)) / 3600.0,
            0.0
          ) / 24.0
        ),
        1.35
      )
    )
  )::DOUBLE PRECISION AS hot_grill_score
FROM public.posts p
WHERE p.visibility_status = 'visible';

COMMENT ON VIEW public.hot_grill_ranking IS
  '핫 불판 랭킹 — raw=(vote×1+view×0.1+comment×3+share×5), decay=1/(1+hours/24)^1.35';

CREATE INDEX IF NOT EXISTS idx_posts_vote_count_desc
  ON public.posts (vote_count DESC)
  WHERE visibility_status = 'visible';

CREATE INDEX IF NOT EXISTS idx_posts_view_count_desc
  ON public.posts (view_count DESC)
  WHERE visibility_status = 'visible';

CREATE INDEX IF NOT EXISTS idx_posts_comment_count_desc
  ON public.posts (comment_count DESC)
  WHERE visibility_status = 'visible';

CREATE INDEX IF NOT EXISTS idx_posts_share_count_desc
  ON public.posts (share_count DESC)
  WHERE visibility_status = 'visible';

GRANT SELECT ON public.hot_grill_ranking TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
