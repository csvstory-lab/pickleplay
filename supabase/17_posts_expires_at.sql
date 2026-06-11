-- posts — 마감 시각 (expires_at) 단일 기준
-- 피드·상세 남은 시간 계산의 SSOT

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.posts.expires_at IS '불판 마감 시각 (UTC) — 직접 선택·프리셋 모두 이 컬럼 기준';
