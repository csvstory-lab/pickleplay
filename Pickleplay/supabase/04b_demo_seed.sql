-- =============================================================================
-- P!CKLE 04-B: 데모 데이터 설치
-- 순서: 04c_force_delete_demo.sql Run → 이 파일 Run
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 피드용 함수·정책
CREATE OR REPLACE FUNCTION public.get_post_vote_stats(post_ids UUID[])
RETURNS TABLE (
  post_id UUID,
  votes_a BIGINT,
  votes_b BIGINT,
  total   BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    v.post_id,
    COUNT(*) FILTER (WHERE v.choice = 'A'),
    COUNT(*) FILTER (WHERE v.choice = 'B'),
    COUNT(*)
  FROM public.votes v
  INNER JOIN public.posts p ON p.id = v.post_id
  WHERE v.post_id = ANY(post_ids)
    AND p.visibility_status = 'visible'
  GROUP BY v.post_id;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_post_vote_stats(UUID[]) TO anon, authenticated;

DROP POLICY IF EXISTS "users_select_active_public" ON public.users;
CREATE POLICY "users_select_active_public"
  ON public.users FOR SELECT
  TO anon, authenticated
  USING (account_status = 'active');

-- 데모 작성자 (이미 있으면 건너뜀)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  'demo-feed@pickleapp.kr',
  crypt('PickleDemo2026!', gen_salt('bf')),
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"nickname":"픽클러데모","signup_platform":"email"}'::jsonb,
  timezone('utc', now()), timezone('utc', now()),
  '', '', '', ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE id = 'a0000000-0000-4000-8000-000000000001'
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  '{"sub":"a0000000-0000-4000-8000-000000000001","email":"demo-feed@pickleapp.kr"}'::jsonb,
  'email',
  'a0000000-0000-4000-8000-000000000001',
  timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities WHERE user_id = 'a0000000-0000-4000-8000-000000000001'
);

INSERT INTO public.users (id, nickname, signup_platform, points, penalty_points, marketing_consent, account_status)
VALUES ('a0000000-0000-4000-8000-000000000001', '픽클러데모', 'email', 100, 0, FALSE, 'active')
ON CONFLICT (id) DO UPDATE SET
  nickname = EXCLUDED.nickname,
  signup_platform = EXCLUDED.signup_platform,
  account_status = 'active';

-- 투표용 유저 10명
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
SELECT * FROM (VALUES
  ('00000000-0000-0000-0000-000000000000'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid, 'authenticated', 'authenticated', 'voter01@pickleapp.kr', crypt('PickleDemo2026!', gen_salt('bf')), timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{"nickname":"픽커01"}'::jsonb, timezone('utc', now()), timezone('utc', now()), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'voter02@pickleapp.kr', crypt('PickleDemo2026!', gen_salt('bf')), timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{"nickname":"픽커02"}'::jsonb, timezone('utc', now()), timezone('utc', now()), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'voter03@pickleapp.kr', crypt('PickleDemo2026!', gen_salt('bf')), timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{"nickname":"픽커03"}'::jsonb, timezone('utc', now()), timezone('utc', now()), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'voter04@pickleapp.kr', crypt('PickleDemo2026!', gen_salt('bf')), timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{"nickname":"픽커04"}'::jsonb, timezone('utc', now()), timezone('utc', now()), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'voter05@pickleapp.kr', crypt('PickleDemo2026!', gen_salt('bf')), timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{"nickname":"픽커05"}'::jsonb, timezone('utc', now()), timezone('utc', now()), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'voter06@pickleapp.kr', crypt('PickleDemo2026!', gen_salt('bf')), timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{"nickname":"픽커06"}'::jsonb, timezone('utc', now()), timezone('utc', now()), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'voter07@pickleapp.kr', crypt('PickleDemo2026!', gen_salt('bf')), timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{"nickname":"픽커07"}'::jsonb, timezone('utc', now()), timezone('utc', now()), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'voter08@pickleapp.kr', crypt('PickleDemo2026!', gen_salt('bf')), timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{"nickname":"픽커08"}'::jsonb, timezone('utc', now()), timezone('utc', now()), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'voter09@pickleapp.kr', crypt('PickleDemo2026!', gen_salt('bf')), timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{"nickname":"픽커09"}'::jsonb, timezone('utc', now()), timezone('utc', now()), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'voter10@pickleapp.kr', crypt('PickleDemo2026!', gen_salt('bf')), timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{"nickname":"픽커10"}'::jsonb, timezone('utc', now()), timezone('utc', now()), '', '', '', '')
) AS v(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v.id);

INSERT INTO public.users (id, nickname, signup_platform, account_status) VALUES
('b0000000-0000-4000-8000-000000000001', '픽커01', 'guest', 'active'),
('b0000000-0000-4000-8000-000000000002', '픽커02', 'guest', 'active'),
('b0000000-0000-4000-8000-000000000003', '픽커03', 'guest', 'active'),
('b0000000-0000-4000-8000-000000000004', '픽커04', 'guest', 'active'),
('b0000000-0000-4000-8000-000000000005', '픽커05', 'guest', 'active'),
('b0000000-0000-4000-8000-000000000006', '픽커06', 'guest', 'active'),
('b0000000-0000-4000-8000-000000000007', '픽커07', 'guest', 'active'),
('b0000000-0000-4000-8000-000000000008', '픽커08', 'guest', 'active'),
('b0000000-0000-4000-8000-000000000009', '픽커09', 'guest', 'active'),
('b0000000-0000-4000-8000-00000000000a', '픽커10', 'guest', 'active')
ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname;

-- 불판·투표 (매번 새로)
DELETE FROM public.votes
WHERE post_id IN (
  'c0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000002'
);

DELETE FROM public.posts
WHERE id IN (
  'c0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000002'
);

INSERT INTO public.posts (id, author_id, category, option_a_name, option_b_name, is_sponsor, visibility_status) VALUES
('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'hot', '짜장면', '짬뽕', FALSE, 'visible'),
('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'ugc', '치킨', '피자', FALSE, 'visible');

INSERT INTO public.votes (user_id, post_id, choice) VALUES
('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'A'),
('b0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'A'),
('b0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'A'),
('b0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'A'),
('b0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'A'),
('b0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001', 'A'),
('b0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001', 'A'),
('b0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000001', 'B'),
('b0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001', 'B'),
('b0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-000000000001', 'B'),
('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'A'),
('b0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'A'),
('b0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', 'A'),
('b0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000002', 'A'),
('b0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000002', 'B'),
('b0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000002', 'B'),
('b0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000002', 'B'),
('b0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000002', 'B'),
('b0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000002', 'B'),
('b0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-000000000002', 'B');

-- 설치 완료 → index.html 새로고침
