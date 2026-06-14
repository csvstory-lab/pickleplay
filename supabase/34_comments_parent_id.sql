-- comments — 대댓글(parent_id) 지원
-- Supabase SQL Editor에서 실행

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.comments.parent_id IS '부모 댓글 ID (NULL이면 최상위 댓글)';

CREATE INDEX IF NOT EXISTS idx_comments_parent_id
  ON public.comments (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_post_parent
  ON public.comments (post_id, parent_id, created_at DESC);
