-- P!CKLE — 관리자 회원 목록용 email 컬럼 + signup_platform 백필
-- admin_users.html 에서 이메일 표시 · unknown 플랫폼 보정

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.users.email IS '로그인 이메일 (auth.users 동기화, 관리자 목록용)';

UPDATE public.users u
SET
  email = COALESCE(NULLIF(trim(u.email), ''), au.email),
  signup_platform = CASE
    WHEN u.signup_platform IS NOT NULL AND u.signup_platform <> 'unknown' THEN u.signup_platform
    WHEN COALESCE(au.raw_app_meta_data->>'provider', '') IN (
      'kakao', 'naver', 'google', 'apple', 'email', 'guest'
    ) THEN au.raw_app_meta_data->>'provider'
    WHEN au.encrypted_password IS NOT NULL AND au.email IS NOT NULL THEN 'email'
    ELSE u.signup_platform
  END
FROM auth.users au
WHERE u.id = au.id;

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

  INSERT INTO public.users (id, nickname, signup_platform, email, account_status)
  VALUES (NEW.id, nick, provider_name, NEW.email, 'active')
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
    email = COALESCE(NULLIF(trim(public.users.email), ''), EXCLUDED.email),
    updated_at = timezone('utc', now());

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
