-- =============================================================================
-- posts 테이블에 투표 주제(제목) 컬럼 추가
-- SQL Editor에서 Run (01 실행 후, 1회만)
-- =============================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS title TEXT;

COMMENT ON COLUMN public.posts.title IS '투표 주제 (한 줄 제목)';

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_title_length;
ALTER TABLE public.posts ADD CONSTRAINT posts_title_length CHECK (
  title IS NULL OR char_length(trim(title)) BETWEEN 2 AND 80
);
