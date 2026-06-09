-- =============================================================================
-- pickle_posts — 빠진 컬럼 추가 (이미 테이블이 있을 때 1회 실행)
-- Supabase SQL Editor → 붙여넣기 → Run
-- =============================================================================

ALTER TABLE public.pickle_posts ADD COLUMN IF NOT EXISTS description       TEXT;
ALTER TABLE public.pickle_posts ADD COLUMN IF NOT EXISTS media_mode        TEXT DEFAULT 'text';
ALTER TABLE public.pickle_posts ADD COLUMN IF NOT EXISTS media_orientation TEXT;
ALTER TABLE public.pickle_posts ADD COLUMN IF NOT EXISTS media_url_1       TEXT;
ALTER TABLE public.pickle_posts ADD COLUMN IF NOT EXISTS media_url_2       TEXT;
ALTER TABLE public.pickle_posts ADD COLUMN IF NOT EXISTS duration          TEXT DEFAULT '24h';
ALTER TABLE public.pickle_posts ADD COLUMN IF NOT EXISTS start_at          TIMESTAMPTZ;
ALTER TABLE public.pickle_posts ADD COLUMN IF NOT EXISTS end_at            TIMESTAMPTZ;
ALTER TABLE public.pickle_posts ADD COLUMN IF NOT EXISTS hashtags          TEXT;
ALTER TABLE public.pickle_posts ADD COLUMN IF NOT EXISTS author_id         UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.pickle_posts ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now());
