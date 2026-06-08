-- =============================================================================
-- P!CKLE (픽클) — 핵심 테이블 생성 스크립트
-- Supabase 대시보드 → SQL Editor 에 전체 복사 후 [Run] 클릭
-- 기획안(pickle_plan.txt) 기준: users, posts, votes, inquiries
-- =============================================================================

-- 1) 공통: updated_at 자동 갱신 함수
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 2) users (회원)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname        TEXT NOT NULL,
  signup_platform TEXT NOT NULL DEFAULT 'unknown'
    CHECK (signup_platform IN ('kakao', 'google', 'apple', 'email', 'guest', 'unknown')),
  points          INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  penalty_points  INTEGER NOT NULL DEFAULT 0 CHECK (penalty_points >= 0),
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  account_status  TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT users_nickname_length CHECK (char_length(trim(nickname)) BETWEEN 2 AND 30)
);

COMMENT ON TABLE public.users IS 'P!CKLE 회원 프로필 (Supabase Auth 계정과 1:1 연결)';
COMMENT ON COLUMN public.users.id IS '고유 식별자(UID) — auth.users 와 동일한 UUID';
COMMENT ON COLUMN public.users.nickname IS '닉네임';
COMMENT ON COLUMN public.users.signup_platform IS '가입 플랫폼 (카카오/구글/애플/이메일 등)';
COMMENT ON COLUMN public.users.points IS '보유 포인트(P)';
COMMENT ON COLUMN public.users.penalty_points IS '누적 벌점';
COMMENT ON COLUMN public.users.marketing_consent IS '마케팅 수신 동의 (Y=true / N=false)';
COMMENT ON COLUMN public.users.account_status IS '계정 상태: active(정상) / suspended(정지)';

CREATE INDEX IF NOT EXISTS idx_users_account_status ON public.users (account_status);
CREATE INDEX IF NOT EXISTS idx_users_marketing_consent ON public.users (marketing_consent);
CREATE INDEX IF NOT EXISTS idx_users_penalty_points ON public.users (penalty_points DESC);

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Auth 가입 시 public.users 프로필 자동 생성 (선택이지만 Supabase에서 권장)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, nickname, signup_platform)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nickname', '픽클러'),
    COALESCE(NEW.raw_user_meta_data->>'signup_platform', 'unknown')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 3) posts (불판 / A·B 투표 게시물)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.posts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category            TEXT NOT NULL
    CHECK (category IN ('hot', 'brand', 'love', 'brain', 'ugc', 'other')),
  option_a_name       TEXT NOT NULL,
  option_a_image_url  TEXT,
  option_b_name       TEXT NOT NULL,
  option_b_image_url  TEXT,
  is_sponsor          BOOLEAN NOT NULL DEFAULT FALSE,
  reward_win_rate     NUMERIC(5, 2) CHECK (reward_win_rate IS NULL OR (reward_win_rate >= 0 AND reward_win_rate <= 100)),
  visibility_status   TEXT NOT NULL DEFAULT 'visible'
    CHECK (visibility_status IN ('visible', 'blinded', 'hidden', 'draft')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT posts_option_names_not_empty CHECK (
    char_length(trim(option_a_name)) > 0 AND char_length(trim(option_b_name)) > 0
  )
);

COMMENT ON TABLE public.posts IS 'A/B 밸런스 게임 불판(게시물)';
COMMENT ON COLUMN public.posts.author_id IS '작성자(users.id)';
COMMENT ON COLUMN public.posts.category IS '카테고리: hot/brand/love/brain/ugc 등';
COMMENT ON COLUMN public.posts.option_a_name IS 'A 선택지 이름';
COMMENT ON COLUMN public.posts.option_a_image_url IS 'A 선택지 이미지 URL';
COMMENT ON COLUMN public.posts.option_b_name IS 'B 선택지 이름';
COMMENT ON COLUMN public.posts.option_b_image_url IS 'B 선택지 이미지 URL';
COMMENT ON COLUMN public.posts.is_sponsor IS '스폰서(브랜드 픽) 불판 여부';
COMMENT ON COLUMN public.posts.reward_win_rate IS '스폰서 불판 리워드 당첨 확률(%) — 관리자 설정용';
COMMENT ON COLUMN public.posts.visibility_status IS '노출 상태: visible/blinded/hidden/draft';

CREATE INDEX IF NOT EXISTS idx_posts_author_id ON public.posts (author_id);
CREATE INDEX IF NOT EXISTS idx_posts_category ON public.posts (category);
CREATE INDEX IF NOT EXISTS idx_posts_is_sponsor ON public.posts (is_sponsor);
CREATE INDEX IF NOT EXISTS idx_posts_visibility_status ON public.posts (visibility_status);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts (created_at DESC);

DROP TRIGGER IF EXISTS trg_posts_updated_at ON public.posts;
CREATE TRIGGER trg_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 4) votes (투표 내역)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  choice     TEXT NOT NULL CHECK (choice IN ('A', 'B')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT votes_one_per_user_per_post UNIQUE (user_id, post_id)
);

COMMENT ON TABLE public.votes IS '유저별 불판 투표 기록 (한 사람당 한 불판에 1회만)';
COMMENT ON COLUMN public.votes.user_id IS '투표한 회원';
COMMENT ON COLUMN public.votes.post_id IS '투표 대상 불판';
COMMENT ON COLUMN public.votes.choice IS '선택: A 또는 B';

CREATE INDEX IF NOT EXISTS idx_votes_post_id ON public.votes (post_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_id ON public.votes (user_id);
CREATE INDEX IF NOT EXISTS idx_votes_created_at ON public.votes (created_at DESC);

-- =============================================================================
-- 5) inquiries (고객센터 1:1 문의)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inquiries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  inquiry_type TEXT NOT NULL DEFAULT 'general'
    CHECK (inquiry_type IN ('general', 'account', 'point', 'ad', 'report', 'other')),
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed')),
  admin_reply  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  replied_at   TIMESTAMPTZ,

  CONSTRAINT inquiries_title_not_empty CHECK (char_length(trim(title)) > 0),
  CONSTRAINT inquiries_content_not_empty CHECK (char_length(trim(content)) > 0)
);

COMMENT ON TABLE public.inquiries IS '고객센터 1:1 문의';
COMMENT ON COLUMN public.inquiries.user_id IS '문의 작성 회원 (탈퇴 시 NULL 유지)';
COMMENT ON COLUMN public.inquiries.inquiry_type IS '문의 유형';
COMMENT ON COLUMN public.inquiries.title IS '문의 제목';
COMMENT ON COLUMN public.inquiries.content IS '문의 내용';
COMMENT ON COLUMN public.inquiries.status IS '처리 상태: pending(대기) / in_progress(처리중) / completed(답변완료)';
COMMENT ON COLUMN public.inquiries.admin_reply IS '관리자 답변 내용';
COMMENT ON COLUMN public.inquiries.replied_at IS '답변 완료 시각';

CREATE INDEX IF NOT EXISTS idx_inquiries_user_id ON public.inquiries (user_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON public.inquiries (status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON public.inquiries (created_at DESC);

DROP TRIGGER IF EXISTS trg_inquiries_updated_at ON public.inquiries;
CREATE TRIGGER trg_inquiries_updated_at
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 답변 완료 시 replied_at 자동 기록
CREATE OR REPLACE FUNCTION public.set_inquiry_replied_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND NEW.admin_reply IS NOT NULL
     AND trim(NEW.admin_reply) <> ''
     AND (OLD.admin_reply IS DISTINCT FROM NEW.admin_reply OR OLD.status IS DISTINCT FROM NEW.status)
  THEN
    NEW.replied_at = timezone('utc', now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiries_replied_at ON public.inquiries;
CREATE TRIGGER trg_inquiries_replied_at
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_inquiry_replied_at();

-- =============================================================================
-- 6) Row Level Security (RLS) — 기본 보안 켜기
--    (백오피스는 service_role 키로 접근, 앱은 anon/authenticated 정책으로 확장)
-- =============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

-- users: 본인 프로필만 조회·수정
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- posts: 노출된 불판은 누구나 읽기, 작성·수정은 본인만
DROP POLICY IF EXISTS "posts_select_visible" ON public.posts;
CREATE POLICY "posts_select_visible"
  ON public.posts FOR SELECT
  TO anon, authenticated
  USING (visibility_status = 'visible');

DROP POLICY IF EXISTS "posts_insert_authenticated" ON public.posts;
CREATE POLICY "posts_insert_authenticated"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "posts_update_own" ON public.posts;
CREATE POLICY "posts_update_own"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- votes: 본인 투표만 등록·조회
DROP POLICY IF EXISTS "votes_select_own" ON public.votes;
CREATE POLICY "votes_select_own"
  ON public.votes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "votes_insert_own" ON public.votes;
CREATE POLICY "votes_insert_own"
  ON public.votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- inquiries: 본인 문의만 등록·조회
DROP POLICY IF EXISTS "inquiries_select_own" ON public.inquiries;
CREATE POLICY "inquiries_select_own"
  ON public.inquiries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "inquiries_insert_own" ON public.inquiries;
CREATE POLICY "inquiries_insert_own"
  ON public.inquiries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- 완료. Table Editor에서 users / posts / votes / inquiries 확인하세요.
-- =============================================================================
