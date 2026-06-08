-- =============================================================================
-- P!CKLE (픽클) — 커뮤니티·CS·AI 필터 테이블 생성 스크립트
-- Supabase SQL Editor 에 전체 복사 후 [Run] 클릭
--
-- ⚠️ 선행 조건: 01_create_core_tables.sql 을 먼저 실행했는지 확인하세요.
--    (users, posts 테이블이 있어야 comments 외래키가 연결됩니다)
-- =============================================================================

-- =============================================================================
-- 1) comments (불판 댓글)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  post_id           UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  content           TEXT NOT NULL,
  filtered_content  TEXT,
  ai_filter_status  TEXT NOT NULL DEFAULT 'pending'
    CHECK (ai_filter_status IN ('pending', 'passed', 'masked', 'blocked')),
  ai_filter_reason  TEXT,
  visibility_status TEXT NOT NULL DEFAULT 'visible'
    CHECK (visibility_status IN ('visible', 'blinded', 'deleted')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT comments_content_not_empty CHECK (char_length(trim(content)) > 0),
  CONSTRAINT comments_content_max_length CHECK (char_length(content) <= 2000)
);

COMMENT ON TABLE public.comments IS '불판(posts)에 달린 댓글 — 작성자(users)와 불판(posts)에 연결';
COMMENT ON COLUMN public.comments.user_id IS '댓글 작성 회원 → users.id';
COMMENT ON COLUMN public.comments.post_id IS '댓글이 달린 불판 → posts.id';
COMMENT ON COLUMN public.comments.content IS '유저가 입력한 원문';
COMMENT ON COLUMN public.comments.filtered_content IS 'AI 필터 적용 후 화면에 보여줄 문구 (마스킹 등)';
COMMENT ON COLUMN public.comments.ai_filter_status IS 'AI 검사 결과: pending/passed/masked/blocked';
COMMENT ON COLUMN public.comments.ai_filter_reason IS '차단·마스킹 사유 (금칙어, 스팸 링크 등)';
COMMENT ON COLUMN public.comments.visibility_status IS '노출 상태: visible/blinded(관리자 블라인드)/deleted';

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_visibility ON public.comments (visibility_status);
CREATE INDEX IF NOT EXISTS idx_comments_ai_filter_status ON public.comments (ai_filter_status);

DROP TRIGGER IF EXISTS trg_comments_updated_at ON public.comments;
CREATE TRIGGER trg_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 2) faqs (자주 묻는 질문)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.faqs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT faqs_question_not_empty CHECK (char_length(trim(question)) > 0),
  CONSTRAINT faqs_answer_not_empty CHECK (char_length(trim(answer)) > 0),
  CONSTRAINT faqs_display_order_non_negative CHECK (display_order >= 0)
);

COMMENT ON TABLE public.faqs IS '고객센터 FAQ — 유저 앱 노출 순서(display_order)로 정렬';
COMMENT ON COLUMN public.faqs.question IS '질문';
COMMENT ON COLUMN public.faqs.answer IS '답변';
COMMENT ON COLUMN public.faqs.display_order IS '노출 순서 (숫자가 작을수록 위에 표시)';
COMMENT ON COLUMN public.faqs.is_published IS '유저 앱에 공개 여부';

CREATE INDEX IF NOT EXISTS idx_faqs_published_order ON public.faqs (is_published, display_order ASC);

DROP TRIGGER IF EXISTS trg_faqs_updated_at ON public.faqs;
CREATE TRIGGER trg_faqs_updated_at
  BEFORE UPDATE ON public.faqs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 3) banned_words (금칙어 · 스팸 링크 패턴 · AI 필터 전역 설정)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.banned_words (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type      TEXT NOT NULL DEFAULT 'word'
    CHECK (entry_type IN ('word', 'url_pattern', 'system_setting')),
  term            TEXT NOT NULL,
  match_mode      TEXT NOT NULL DEFAULT 'contains'
    CHECK (match_mode IN ('exact', 'contains', 'regex')),
  filter_category TEXT NOT NULL DEFAULT 'profanity'
    CHECK (filter_category IN ('profanity', 'insult', 'spam_link', 'other')),
  severity        SMALLINT NOT NULL DEFAULT 2
    CHECK (severity BETWEEN 1 AND 3),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  admin_note      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT banned_words_term_not_empty CHECK (char_length(trim(term)) > 0),
  CONSTRAINT banned_words_system_setting_shape CHECK (
    entry_type <> 'system_setting'
    OR (filter_category = 'other' AND match_mode = 'exact')
  )
);

COMMENT ON TABLE public.banned_words IS '욕설/비방 금칙어, 스팸 URL 패턴, AI 필터 전역 강도 설정';
COMMENT ON COLUMN public.banned_words.entry_type IS 'word(단어) / url_pattern(링크 패턴) / system_setting(전역 설정 1건)';
COMMENT ON COLUMN public.banned_words.term IS '금칙어·정규식 패턴·설정 키(link_block_strength 등)';
COMMENT ON COLUMN public.banned_words.match_mode IS '매칭 방식: exact / contains / regex';
COMMENT ON COLUMN public.banned_words.filter_category IS 'profanity / insult / spam_link / other';
COMMENT ON COLUMN public.banned_words.severity IS '차단 강도 1(약)~3(강) — 스팸 링크·욕설 공통 스케일';
COMMENT ON COLUMN public.banned_words.is_active IS '사용 여부 (끄면 필터에서 제외)';

-- 금칙어·URL 패턴은 term 중복 방지 (설정 행은 별도 유니크)
CREATE UNIQUE INDEX IF NOT EXISTS idx_banned_words_unique_term
  ON public.banned_words (lower(trim(term)), entry_type, filter_category)
  WHERE entry_type IN ('word', 'url_pattern');

-- 전역 설정: 스팸 링크 차단 강도 (기획안 — AI 필터 강도 조절)
CREATE UNIQUE INDEX IF NOT EXISTS idx_banned_words_unique_system_key
  ON public.banned_words (term)
  WHERE entry_type = 'system_setting';

CREATE INDEX IF NOT EXISTS idx_banned_words_active_category
  ON public.banned_words (is_active, filter_category, entry_type);

DROP TRIGGER IF EXISTS trg_banned_words_updated_at ON public.banned_words;
CREATE TRIGGER trg_banned_words_updated_at
  BEFORE UPDATE ON public.banned_words
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 기본 전역 설정 + 예시 (재실행해도 중복 삽입 안 됨 — 배포 전 예시 행은 삭제 가능)
INSERT INTO public.banned_words (entry_type, term, match_mode, filter_category, severity, admin_note)
SELECT 'system_setting', 'link_block_strength', 'exact', 'other', 2,
       '스팸 링크 차단 강도 (1=약, 2=보통, 3=강). severity 컬럼 값으로 조절'
WHERE NOT EXISTS (
  SELECT 1 FROM public.banned_words
  WHERE entry_type = 'system_setting' AND term = 'link_block_strength'
);

INSERT INTO public.banned_words (entry_type, term, match_mode, filter_category, severity, admin_note)
SELECT 'url_pattern', '(https?://|www\.)', 'regex', 'spam_link', 2, '외부 링크 기본 탐지 패턴'
WHERE NOT EXISTS (
  SELECT 1 FROM public.banned_words
  WHERE entry_type = 'url_pattern'
    AND lower(trim(term)) = lower('(https?://|www\.)')
);

INSERT INTO public.banned_words (entry_type, term, match_mode, filter_category, severity, admin_note)
SELECT 'word', '예시금칙어', 'contains', 'profanity', 2, '배포 전 실제 금칙어로 교체·삭제하세요'
WHERE NOT EXISTS (
  SELECT 1 FROM public.banned_words
  WHERE entry_type = 'word' AND lower(trim(term)) = lower('예시금칙어')
);

-- =============================================================================
-- 4) Row Level Security (RLS)
-- =============================================================================
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_words ENABLE ROW LEVEL SECURITY;

-- comments: 노출된 불판의 공개·통과 댓글 읽기
DROP POLICY IF EXISTS "comments_select_visible" ON public.comments;
CREATE POLICY "comments_select_visible"
  ON public.comments FOR SELECT
  TO anon, authenticated
  USING (
    visibility_status = 'visible'
    AND ai_filter_status IN ('passed', 'masked')
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = comments.post_id
        AND p.visibility_status = 'visible'
    )
  );

-- comments: 로그인 유저 본인 댓글 작성
DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
CREATE POLICY "comments_insert_own"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.account_status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_id
        AND p.visibility_status = 'visible'
    )
  );

-- comments: 본인 댓글 수정 (내용만, 삭제는 visibility_status 로 처리)
DROP POLICY IF EXISTS "comments_update_own" ON public.comments;
CREATE POLICY "comments_update_own"
  ON public.comments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- faqs: 공개된 FAQ만 앱에서 읽기
DROP POLICY IF EXISTS "faqs_select_published" ON public.faqs;
CREATE POLICY "faqs_select_published"
  ON public.faqs FOR SELECT
  TO anon, authenticated
  USING (is_published = TRUE);

-- banned_words: 앱·댓글 필터용 읽기 전용 (활성 항목만)
DROP POLICY IF EXISTS "banned_words_select_active" ON public.banned_words;
CREATE POLICY "banned_words_select_active"
  ON public.banned_words FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);

-- =============================================================================
-- 완료. Table Editor에서 comments / faqs / banned_words 확인하세요.
-- (관리자 백오피스의 FAQ·금칙어 등록/수정은 service_role 또는 추후 admin 정책 추가)
-- =============================================================================
