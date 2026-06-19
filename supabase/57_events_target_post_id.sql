-- =============================================================================
-- P!CKLE — events.target_post_id (투표/댓글 조건부 이벤트 대상 불판)
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS target_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.events.target_post_id IS
  'join_type이 vote/reply일 때 참여 조건으로 연결되는 불판(posts.id)';

CREATE INDEX IF NOT EXISTS idx_events_target_post_id
  ON public.events (target_post_id)
  WHERE target_post_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
