-- posts — 진행 기간·마감 시각 (게릴라 불판 / 직접 선택 지원)

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS duration TEXT DEFAULT '24h';

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;

COMMENT ON COLUMN public.posts.duration IS '진행 기간 프리셋: 24h, 3, 7, custom';
COMMENT ON COLUMN public.posts.start_at IS '불판 시작 시각 (UTC)';
COMMENT ON COLUMN public.posts.end_at IS '불판 마감 시각 (UTC) — 직접 선택 시 분 단위 반영';
