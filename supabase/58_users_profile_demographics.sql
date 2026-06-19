-- =============================================================================
-- P!CKLE — users 프로필 인구통계·동의 컬럼 (마이페이지 프로필 편집)
-- Supabase SQL Editor → 전체 복사 → Run
-- (gender / age_group / region / marketing_agreed 는 39_users_taste_preferences.sql 과 중복 안전)
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gender             TEXT,
  ADD COLUMN IF NOT EXISTS age_group          TEXT,
  ADD COLUMN IF NOT EXISTS region             TEXT,
  ADD COLUMN IF NOT EXISTS is_over_14         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marketing_agreed   BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.users.gender IS '성별 (남자 / 여자)';
COMMENT ON COLUMN public.users.age_group IS '연령대 (10대 / 20대 / 30대 / 40대 / 50대이상)';
COMMENT ON COLUMN public.users.region IS '거주 지역 (시·도 단위)';
COMMENT ON COLUMN public.users.is_over_14 IS '만 14세 이상 동의 여부';
COMMENT ON COLUMN public.users.marketing_agreed IS '마케팅·이벤트 혜택 알림 수신 동의';

-- 기존 marketing_consent 값이 있으면 marketing_agreed 로 이전
UPDATE public.users
SET marketing_agreed = marketing_consent
WHERE marketing_consent IS TRUE
  AND marketing_agreed IS NOT TRUE;

NOTIFY pgrst, 'reload schema';
