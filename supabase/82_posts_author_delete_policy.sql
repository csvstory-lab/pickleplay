-- =============================================================================
-- 마이페이지: 작성자 본인 불판 삭제 허용
-- SQL Editor에서 Run (01, 07 실행 후 1회)
-- =============================================================================

DROP POLICY IF EXISTS "posts_delete_own" ON public.posts;
CREATE POLICY "posts_delete_own"
  ON public.posts FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id);

GRANT DELETE ON public.posts TO authenticated;
