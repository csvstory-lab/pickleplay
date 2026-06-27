-- =============================================================================
-- posts — 텍스트 카드(컬러박스) 미디어 여부 플래그
-- Supabase SQL Editor → 붙여넣기 → Run
-- =============================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_is_text_card BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.posts.media_is_text_card IS
  'true: 생성 시 텍스트 카드(컬러박스)로 렌더된 A/B 이미지 | false: 일반 사진·영상';

ALTER TABLE public.pickle_posts
  ADD COLUMN IF NOT EXISTS media_is_text_card BOOLEAN NOT NULL DEFAULT false;
