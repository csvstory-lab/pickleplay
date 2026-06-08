-- =============================================================================
-- Storage: post_media 버킷 정책
-- ⚠️ 먼저 대시보드에서 버킷 post_media 를 PUBLIC 으로 만든 뒤 Run
-- =============================================================================

-- 기존 정책이 있으면 제거 후 재생성 (재실행 안전)
DROP POLICY IF EXISTS "post_media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "post_media_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "post_media_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "post_media_auth_delete" ON storage.objects;

-- 누구나 이미지 조회 (공개 피드용)
CREATE POLICY "post_media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post_media');

-- 로그인 유저: 자신의 UID 폴더에만 업로드 (경로: {userId}/파일명)
CREATE POLICY "post_media_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'post_media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "post_media_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'post_media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "post_media_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'post_media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
