-- P!CKLE — user_follows id 컬럼 보강 (25_ranking_scores.sql 선행)
-- 요구 스키마: id, follower_id, following_id, created_at

ALTER TABLE public.user_follows
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

UPDATE public.user_follows
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.user_follows
  ALTER COLUMN id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_follows_id
  ON public.user_follows (id);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower
  ON public.user_follows (follower_id);

COMMENT ON COLUMN public.user_follows.id IS '팔로우 관계 고유 ID';
COMMENT ON COLUMN public.user_follows.follower_id IS '픽을 한 사람 (팔로워)';
COMMENT ON COLUMN public.user_follows.following_id IS '픽을 받은 사람 (팔로잉 대상)';

NOTIFY pgrst, 'reload schema';
