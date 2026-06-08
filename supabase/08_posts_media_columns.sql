-- =============================================================================
-- posts — 다이내믹 미디어 컬럼 추가
-- SQL Editor에서 Run (01·06 실행 후, 1회만)
-- =============================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'none'
    CHECK (media_type IN ('none', 'single', 'dual', 'video', 'video_dual'));

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_url_1 TEXT;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_url_2 TEXT;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS layout_style TEXT
    CHECK (layout_style IS NULL OR layout_style IN ('horizontal', 'vertical'));

COMMENT ON COLUMN public.posts.media_type IS 'none | single(1장) | dual(2장 A/B) | video(유튜브·틱톡 URL)';
COMMENT ON COLUMN public.posts.media_url_1 IS '단일 이미지 URL 또는 동영상 원본/임베드 URL';
COMMENT ON COLUMN public.posts.media_url_2 IS '듀얼 이미지 시 B측 URL';
COMMENT ON COLUMN public.posts.layout_style IS 'dual 일 때 horizontal(좌우) | vertical(상하)';

CREATE INDEX IF NOT EXISTS idx_posts_media_type ON public.posts (media_type);
