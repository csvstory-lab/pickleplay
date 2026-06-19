-- =============================================================================
-- Storage: event_images 버킷 정책
-- ⚠️ 먼저 대시보드에서 버킷 event_images 를 PUBLIC 으로 만든 뒤 Run
-- =============================================================================

DROP POLICY IF EXISTS event_images_public_read ON storage.objects;
DROP POLICY IF EXISTS event_images_anon_insert ON storage.objects;
DROP POLICY IF EXISTS event_images_anon_update ON storage.objects;
DROP POLICY IF EXISTS event_images_anon_delete ON storage.objects;

CREATE POLICY event_images_public_read
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event_images');

CREATE POLICY event_images_anon_insert
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'event_images');

CREATE POLICY event_images_anon_update
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'event_images')
  WITH CHECK (bucket_id = 'event_images');

CREATE POLICY event_images_anon_delete
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'event_images');
