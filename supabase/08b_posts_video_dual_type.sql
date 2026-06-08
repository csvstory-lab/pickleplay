-- =============================================================================
-- media_type 에 video_dual (A/B 동영상 URL 대결) 추가
-- 08 실행 후 1회 Run
-- =============================================================================

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_media_type_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_media_type_check
  CHECK (media_type IN ('none', 'single', 'dual', 'video', 'video_dual'));

COMMENT ON COLUMN public.posts.media_url_1 IS '이미지/동영상 A측 URL (단일·듀얼·video·video_dual)';
COMMENT ON COLUMN public.posts.media_url_2 IS '이미지/동영상 B측 URL (듀얼·video_dual)';
