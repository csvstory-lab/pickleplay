-- =============================================================================
-- P!CKLE — 유저 취향 분석 및 마케팅 동의 컬럼
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gender             VARCHAR(10)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS age_group          VARCHAR(10)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS region             VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS marketing_agreed   BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_info_collected  BOOLEAN      DEFAULT FALSE;

COMMENT ON COLUMN public.users.gender IS '성별 (male / female 등)';
COMMENT ON COLUMN public.users.age_group IS '연령대 (10s / 20s / 30s 등)';
COMMENT ON COLUMN public.users.region IS '거주 지역 (시·도 단위)';
COMMENT ON COLUMN public.users.marketing_agreed IS '마케팅 수신 동의 여부';
COMMENT ON COLUMN public.users.is_info_collected IS '취향 정보 수집 모달을 완료했는지 여부 (true면 다시 안 띄움)';

-- 기존 marketing_consent 값이 있으면 marketing_agreed로 이전
UPDATE public.users
SET marketing_agreed = marketing_consent
WHERE marketing_consent IS TRUE
  AND (marketing_agreed IS NULL OR marketing_agreed IS FALSE);

NOTIFY pgrst, 'reload schema';
