-- =============================================================================
-- P!CKLE — system_settings.general_config (기본 설정) 안내
-- 별도 key/value 테이블 대신 singleton 행(id=1)의 JSONB 컬럼을 사용합니다.
-- 관리자 UI ID ↔ general_config 키 매핑 예:
--   gen_maintenanceEnabled  → maintenance_enabled (boolean)
--   gen_metaTitle           → meta_title
--   gen_ogImageUrl          → og_image_url
--   gen_snsYoutube          → sns_youtube
-- 초기 스키마·시드: supabase/61_system_settings.sql
-- Storage 버킷: system_assets (PUBLIC) + 62_storage_system_assets.sql
-- =============================================================================

-- 이미 61에서 생성됨. 재실행 시 general_config 기본값만 병합하고 싶다면:
UPDATE public.system_settings
SET general_config = general_config || '{
  "meta_title": "픽클 (P!CKLE) - 도파민 터지는 투표 커뮤니티",
  "meta_description": "세상의 모든 논쟁거리, 픽클에서 투표하고 이야기하세요!"
}'::jsonb
WHERE id = 1
  AND (general_config->>'meta_title') IS NULL;

NOTIFY pgrst, 'reload schema';
