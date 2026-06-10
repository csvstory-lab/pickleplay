-- =============================================================================
-- posts — 리스트 노출용 썸네일 URL
-- SQL Editor에서 Run (01 실행 후, 1회)
-- =============================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

COMMENT ON COLUMN public.posts.thumbnail_url IS '메인 피드·킹왕짱 리스트용 16:9 썸네일 이미지 URL (Storage post_media)';
