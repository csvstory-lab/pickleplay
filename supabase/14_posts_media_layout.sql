-- posts — VS/듀얼 미디어 배치 형태 (horizontal: 16:9 위아래 / vertical: 9:16 좌우)

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_layout TEXT;

COMMENT ON COLUMN public.posts.media_layout IS '미디어 배치: horizontal(16:9 위아래) | vertical(9:16 좌우)';
