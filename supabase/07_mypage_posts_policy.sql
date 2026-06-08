-- =============================================================================
-- 마이페이지: 내가 만든 불판은 본인에게 모두 보이도록 (노출/블라인드 포함)
-- SQL Editor에서 Run (01 실행 후, 1회)
-- =============================================================================

DROP POLICY IF EXISTS "posts_select_own" ON public.posts;
CREATE POLICY "posts_select_own"
  ON public.posts FOR SELECT
  TO authenticated
  USING (auth.uid() = author_id);
