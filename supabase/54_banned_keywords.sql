-- P!CKLE — AI 필터링 금칙어 (관리자 admin_ai_filter.html)

CREATE TABLE IF NOT EXISTS public.banned_keywords (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT banned_keywords_keyword_not_empty CHECK (char_length(trim(keyword)) > 0)
);

-- 기존 테이블에 created_at 없으면 추가
ALTER TABLE public.banned_keywords
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now());

CREATE UNIQUE INDEX IF NOT EXISTS idx_banned_keywords_keyword_lower
  ON public.banned_keywords (lower(trim(keyword)));

CREATE INDEX IF NOT EXISTS idx_banned_keywords_created_at
  ON public.banned_keywords (created_at DESC);

COMMENT ON TABLE public.banned_keywords IS '관리자 수동 블라인드 금칙어 (AI 필터)';

ALTER TABLE public.banned_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS banned_keywords_select_all ON public.banned_keywords;
DROP POLICY IF EXISTS banned_keywords_insert_admin ON public.banned_keywords;
DROP POLICY IF EXISTS banned_keywords_delete_admin ON public.banned_keywords;
DROP POLICY IF EXISTS banned_keywords_update_admin ON public.banned_keywords;
DROP POLICY IF EXISTS banned_keywords_allow_all ON public.banned_keywords;

CREATE POLICY banned_keywords_allow_all
  ON public.banned_keywords
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
