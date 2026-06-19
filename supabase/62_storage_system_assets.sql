-- =============================================================================
-- Storage: system_assets 버킷 정책 (파비콘·OG 이미지 등 시스템 에셋)
-- ⚠️ 먼저 대시보드에서 버킷 system_assets 를 PUBLIC 으로 만든 뒤 Run
-- =============================================================================

DROP POLICY IF EXISTS system_assets_public_read ON storage.objects;
DROP POLICY IF EXISTS system_assets_anon_insert ON storage.objects;
DROP POLICY IF EXISTS system_assets_anon_update ON storage.objects;
DROP POLICY IF EXISTS system_assets_anon_delete ON storage.objects;

CREATE POLICY system_assets_public_read
  ON storage.objects FOR SELECT
  USING (bucket_id = 'system_assets');

CREATE POLICY system_assets_anon_insert
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'system_assets');

CREATE POLICY system_assets_anon_update
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'system_assets')
  WITH CHECK (bucket_id = 'system_assets');

CREATE POLICY system_assets_anon_delete
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'system_assets');
