-- =============================================================================
-- P!CKLE 마스터 통합 SQL — 마이페이지 '내가 픽' / '나를 픽' JOIN 복구
-- Supabase SQL Editor → 전체 복사 → Run (한 번에 실행)
-- 해결: ① FK 미적용  ② 컬럼 누락  ③ RLS/GRANT 거부
-- =============================================================================

-- ── A) users — 누락 컬럼 안전 추가 ──

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS star_score DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_html TEXT;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN public.users.star_score IS '최고의 픽클러 랭킹 점수';
COMMENT ON COLUMN public.users.avatar_html IS '프로필 아바타 HTML/이모지 (공개 표시)';
COMMENT ON COLUMN public.users.avatar_url IS '프로필 아바타 이미지 URL (공개 표시)';

-- 기존 게시글 스냅샷으로 avatar_html backfill
UPDATE public.users u
SET avatar_html = sub.author_avatar_html
FROM (
  SELECT DISTINCT ON (author_id)
    author_id,
    author_avatar_html
  FROM public.posts
  WHERE author_avatar_html IS NOT NULL
    AND trim(author_avatar_html) <> ''
  ORDER BY author_id, created_at DESC
) sub
WHERE u.id = sub.author_id
  AND (u.avatar_html IS NULL OR trim(u.avatar_html) = '');

-- ── B) user_follows — 테이블·인덱스 보장 ──

CREATE TABLE IF NOT EXISTS public.user_follows (
  follower_id   UUID NOT NULL,
  following_id  UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT user_follows_not_self CHECK (follower_id <> following_id)
);

ALTER TABLE public.user_follows
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

UPDATE public.user_follows
SET id = gen_random_uuid()
WHERE id IS NULL;

-- FK 추가 전 고아 행 제거
DELETE FROM public.user_follows uf
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = uf.follower_id)
   OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = uf.following_id);

-- ── C) user_follows — Foreign Key (PostgREST embed 필수) ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_follows'::regclass
      AND conname = 'user_follows_follower_id_fkey'
  ) THEN
    ALTER TABLE public.user_follows
      ADD CONSTRAINT user_follows_follower_id_fkey
      FOREIGN KEY (follower_id)
      REFERENCES public.users (id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_follows'::regclass
      AND conname = 'user_follows_following_id_fkey'
  ) THEN
    ALTER TABLE public.user_follows
      ADD CONSTRAINT user_follows_following_id_fkey
      FOREIGN KEY (following_id)
      REFERENCES public.users (id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_follows_follower
  ON public.user_follows (follower_id);

CREATE INDEX IF NOT EXISTS idx_user_follows_following
  ON public.user_follows (following_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_follows_id
  ON public.user_follows (id);

CREATE INDEX IF NOT EXISTS idx_users_star_score_desc
  ON public.users (star_score DESC)
  WHERE account_status = 'active';

-- ── D) RLS — user_follows (목록 SELECT 전체 허용) ──

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_follows_select_all" ON public.user_follows;
CREATE POLICY "user_follows_select_all"
  ON public.user_follows
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "user_follows_insert_own" ON public.user_follows;
CREATE POLICY "user_follows_insert_own"
  ON public.user_follows
  FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS "user_follows_delete_own" ON public.user_follows;
CREATE POLICY "user_follows_delete_own"
  ON public.user_follows
  FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid());

-- ── E) RLS — users (타 유저 프로필 JOIN embed 허용) ──

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_select_active_public" ON public.users;
CREATE POLICY "users_select_active_public"
  ON public.users
  FOR SELECT
  TO anon, authenticated
  USING (account_status = 'active');

-- ── F) GRANT — PostgREST 역할 권한 ──

GRANT SELECT ON public.user_follows TO anon, authenticated;
GRANT INSERT, DELETE ON public.user_follows TO authenticated;

GRANT SELECT ON public.users TO anon, authenticated;

-- ── G) PostgREST 스키마 캐시 갱신 ──

NOTIFY pgrst, 'reload schema';
