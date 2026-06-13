-- =============================================================================
-- P!CKLE — user_follows ↔ users JOIN(PostgREST embed) 복구
-- 증상: 마이페이지 '내가 픽' / '나를 픽' → "목록을 불러오지 못했습니다"
-- 원인 후보: FK 미설정, users RLS(타 유저 프로필 차단), GRANT 누락
-- Supabase SQL Editor 에 전체 복사 후 [Run]
-- =============================================================================

-- ── 0) 유저 테이블 확인 (본 프로젝트: public.users, profiles 테이블 없음) ──

-- ── 1) user_follows 테이블 보장 ──

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

-- ── 2) 고아(orphan) 행 정리 — FK 추가 전 필수 ──

DELETE FROM public.user_follows uf
WHERE NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = uf.follower_id
  )
  OR NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = uf.following_id
  );

-- ── 3) Foreign Key — PostgREST embed 관계 인식에 필수 ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
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
    SELECT 1
    FROM pg_constraint
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

-- ── 4) users 공개 프로필 컬럼 (JOIN 시 nickname / avatar / level) ──

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS star_score DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_html TEXT;

-- ── 5) RLS — user_follows (팔로우 관계 조회 허용) ──

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

-- ── 6) RLS — users (JOIN embed 시 타 유저 nickname/avatar 읽기) ──
--     users_select_own(본인) + users_select_active_public(active 전체) 병행

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

-- ── 7) GRANT (PostgREST anon/authenticated 역할) ──

GRANT SELECT ON public.user_follows TO anon, authenticated;
GRANT INSERT, DELETE ON public.user_follows TO authenticated;

GRANT SELECT ON public.users TO anon, authenticated;

-- ── 8) PostgREST 스키마 캐시 갱신 ──

NOTIFY pgrst, 'reload schema';
