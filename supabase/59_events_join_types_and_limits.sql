-- =============================================================================
-- P!CKLE — 이벤트 참여 조건 확장 + 선착순/투표 목표 컬럼
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS max_participants   INTEGER,
  ADD COLUMN IF NOT EXISTS target_vote_count  INTEGER;

COMMENT ON COLUMN public.events.max_participants IS '선착순(first_come) 이벤트 목표 인원';
COMMENT ON COLUMN public.events.target_vote_count IS '투표 N회 달성(vote_count) 이벤트 목표 횟수';

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_join_type_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_join_type_check
  CHECK (join_type IN (
    'vote', 'reply', 'click',
    'first_come', 'vote_count', 'profile_complete'
  ));

NOTIFY pgrst, 'reload schema';
