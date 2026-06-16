-- P!CKLE — 관리자 회원 목록 (auth.users 이메일 join)
-- admin_users.html 에서 가입 이메일 확실히 노출

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  nickname text,
  email text,
  signup_platform text,
  points integer,
  penalty_points integer,
  account_status text,
  gender text,
  age_group text,
  region text,
  marketing_agreed boolean,
  marketing_consent boolean,
  is_info_collected boolean,
  avatar_html text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    u.id,
    u.nickname,
    COALESCE(NULLIF(trim(u.email), ''), au.email) AS email,
    u.signup_platform,
    u.points,
    u.penalty_points,
    u.account_status,
    u.gender,
    u.age_group,
    u.region,
    u.marketing_agreed,
    u.marketing_consent,
    u.is_info_collected,
    u.avatar_html,
    u.created_at
  FROM public.users u
  LEFT JOIN auth.users au ON au.id = u.id
  ORDER BY u.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
