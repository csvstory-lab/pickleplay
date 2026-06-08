-- =============================================================================
-- OAuth 가입 시 public.users 프로필 (카카오·네이버·구글·이메일)
-- SQL Editor에서 Run (01 실행 후)
-- =============================================================================

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_signup_platform_check;
ALTER TABLE public.users ADD CONSTRAINT users_signup_platform_check
  CHECK (signup_platform IN ('kakao', 'naver', 'google', 'apple', 'email', 'guest', 'unknown'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  provider_name TEXT;
  nick TEXT;
BEGIN
  provider_name := COALESCE(
    NEW.raw_app_meta_data->>'provider',
    NEW.raw_user_meta_data->>'signup_platform',
    'unknown'
  );

  IF provider_name NOT IN ('kakao', 'naver', 'google', 'apple', 'email', 'guest') THEN
    provider_name := 'unknown';
  END IF;

  nick := COALESCE(
    NEW.raw_user_meta_data->>'nickname',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
  split_part(COALESCE(NEW.email, ''), '@', 1),
    '픽클러'
  );

  INSERT INTO public.users (id, nickname, signup_platform)
  VALUES (NEW.id, nick, provider_name)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname,
    signup_platform = EXCLUDED.signup_platform;

  RETURN NEW;
END;
$$;
