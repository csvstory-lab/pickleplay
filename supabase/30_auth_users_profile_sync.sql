-- =============================================================================
-- P!CKLE — auth.users → public.users 자동 동기화 (투명 인간 복구)
-- Supabase SQL Editor → 전체 복사 → Run
--
-- 1) 신규 가입 시 public.users 자동 INSERT (트리거)
-- 2) 기존 auth.users만 있고 public.users 없는 계정 backfill
-- =============================================================================

-- signup_platform 허용값 (OAuth 확장)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_signup_platform_check;
ALTER TABLE public.users ADD CONSTRAINT users_signup_platform_check
  CHECK (signup_platform IN ('kakao', 'naver', 'google', 'apple', 'email', 'guest', 'unknown'));

-- ── 1) 닉네임·가입 플랫폼 파생 헬퍼 (트리거·backfill 공용) ──

CREATE OR REPLACE FUNCTION public.pickle_derive_nickname(
  p_email   TEXT,
  p_meta    JSONB,
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  nick TEXT;
BEGIN
  nick := COALESCE(
    NULLIF(trim(p_meta->>'nickname'), ''),
    NULLIF(trim(p_meta->>'full_name'), ''),
    NULLIF(trim(p_meta->>'name'), ''),
    NULLIF(split_part(COALESCE(p_email, ''), '@', 1), ''),
    '픽클러'
  );

  nick := left(trim(nick), 30);

  IF char_length(nick) < 2 THEN
    nick := '픽' || right(replace(p_user_id::text, '-', ''), 6);
  END IF;

  IF char_length(nick) < 2 THEN
    nick := '픽클러';
  END IF;

  RETURN nick;
END;
$$;

CREATE OR REPLACE FUNCTION public.pickle_derive_signup_platform(
  p_app_meta JSONB,
  p_user_meta JSONB,
  p_email TEXT,
  p_encrypted_password TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  provider TEXT;
BEGIN
  provider := COALESCE(
    NULLIF(trim(p_app_meta->>'provider'), ''),
    NULLIF(trim(p_user_meta->>'signup_platform'), '')
  );

  IF provider IN ('kakao', 'naver', 'google', 'apple', 'email', 'guest') THEN
    RETURN provider;
  END IF;

  IF p_email IS NOT NULL AND p_encrypted_password IS NOT NULL THEN
    RETURN 'email';
  END IF;

  RETURN 'unknown';
END;
$$;

-- ── 2) 신규 유저 자동 복사 트리거 ──

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nick TEXT;
  provider_name TEXT;
BEGIN
  nick := public.pickle_derive_nickname(NEW.email, NEW.raw_user_meta_data, NEW.id);
  provider_name := public.pickle_derive_signup_platform(
    NEW.raw_app_meta_data,
    NEW.raw_user_meta_data,
    NEW.email,
    NEW.encrypted_password::text
  );

  INSERT INTO public.users (id, nickname, signup_platform, account_status)
  VALUES (NEW.id, nick, provider_name, 'active')
  ON CONFLICT (id) DO UPDATE SET
    nickname = CASE
      WHEN trim(public.users.nickname) = '' OR public.users.nickname = '픽클러'
        THEN EXCLUDED.nickname
      ELSE public.users.nickname
    END,
    signup_platform = CASE
      WHEN public.users.signup_platform = 'unknown'
        THEN EXCLUDED.signup_platform
      ELSE public.users.signup_platform
    END,
    updated_at = timezone('utc', now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── 3) 기존 누락 유저 강제 동기화 (Backfill) ──

INSERT INTO public.users (id, nickname, signup_platform, account_status)
SELECT
  au.id,
  public.pickle_derive_nickname(au.email, au.raw_user_meta_data, au.id),
  public.pickle_derive_signup_platform(
    au.raw_app_meta_data,
    au.raw_user_meta_data,
    au.email,
    au.encrypted_password::text
  ),
  'active'
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
