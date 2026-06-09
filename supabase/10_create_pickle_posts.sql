-- =============================================================================
-- pickle_posts — 유저/관리자 불판 등록용 테이블
-- Supabase SQL Editor 에서 1회 실행
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pickle_posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category          TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  option_a          TEXT NOT NULL,
  option_b          TEXT NOT NULL,
  media_mode        TEXT DEFAULT 'text'
    CHECK (media_mode IN ('single', 'vs', 'text')),
  media_orientation TEXT CHECK (media_orientation IN ('horizontal', 'vertical')),
  media_url_1       TEXT,
  media_url_2       TEXT,
  duration          TEXT DEFAULT '24h',
  start_at          TIMESTAMPTZ,
  end_at            TIMESTAMPTZ,
  hashtags          TEXT,
  author_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT pickle_posts_title_not_empty CHECK (char_length(trim(title)) > 0),
  CONSTRAINT pickle_posts_options_not_empty CHECK (
    char_length(trim(option_a)) > 0 AND char_length(trim(option_b)) > 0
  )
);

COMMENT ON TABLE public.pickle_posts IS 'P!CKLE A vs B 불판 (유저·관리자 공통 등록)';

ALTER TABLE public.pickle_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pickle_posts_select_all" ON public.pickle_posts;
CREATE POLICY "pickle_posts_select_all"
  ON public.pickle_posts FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "pickle_posts_insert_all" ON public.pickle_posts;
CREATE POLICY "pickle_posts_insert_all"
  ON public.pickle_posts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
