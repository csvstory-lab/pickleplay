-- =============================================================================
-- P!CKLE 04-A: 데모 데이터 청소만 (먼저 이 파일만 Run)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) 데모 불판에 달린 댓글·투표·불판 삭제
DELETE FROM public.comments
WHERE post_id IN (
  SELECT id FROM public.posts
  WHERE author_id = 'a0000000-0000-4000-8000-000000000001'
     OR (option_a_name = '짜장면' AND option_b_name = '짬뽕')
     OR (option_a_name = '치킨' AND option_b_name = '피자')
);

DELETE FROM public.votes
WHERE post_id IN (
  SELECT id FROM public.posts
  WHERE author_id = 'a0000000-0000-4000-8000-000000000001'
     OR (option_a_name = '짜장면' AND option_b_name = '짬뽕')
     OR (option_a_name = '치킨' AND option_b_name = '피자')
);

DELETE FROM public.posts
WHERE author_id = 'a0000000-0000-4000-8000-000000000001'
   OR (option_a_name = '짜장면' AND option_b_name = '짬뽕')
   OR (option_a_name = '치킨' AND option_b_name = '피자');

-- 2) 데모 회원의 나머지 활동 삭제
DELETE FROM public.votes
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email = 'demo-feed@pickleapp.kr'
     OR email LIKE 'voter%@pickleapp.kr'
     OR email LIKE 'voter%@pickle.local'
     OR email LIKE '%@pickle.local'
     OR id IN (
       'a0000000-0000-4000-8000-000000000001',
       'b0000000-0000-4000-8000-000000000001',
       'b0000000-0000-4000-8000-000000000002',
       'b0000000-0000-4000-8000-000000000003',
       'b0000000-0000-4000-8000-000000000004',
       'b0000000-0000-4000-8000-000000000005',
       'b0000000-0000-4000-8000-000000000006',
       'b0000000-0000-4000-8000-000000000007',
       'b0000000-0000-4000-8000-000000000008',
       'b0000000-0000-4000-8000-000000000009',
       'b0000000-0000-4000-8000-00000000000a'
     )
);

DELETE FROM public.comments
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email = 'demo-feed@pickleapp.kr'
     OR email LIKE 'voter%@pickleapp.kr'
     OR email LIKE 'voter%@pickle.local'
);

DELETE FROM public.inquiries
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email = 'demo-feed@pickleapp.kr'
     OR email LIKE 'voter%@pickleapp.kr'
);

DELETE FROM public.posts
WHERE author_id IN (
  SELECT id FROM auth.users
  WHERE email = 'demo-feed@pickleapp.kr'
     OR email LIKE 'voter%@pickleapp.kr'
);

-- 3) public.users · auth 삭제
DELETE FROM public.users
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email = 'demo-feed@pickleapp.kr'
     OR email LIKE 'voter%@pickleapp.kr'
     OR email LIKE 'voter%@pickle.local'
     OR id = 'a0000000-0000-4000-8000-000000000001'
     OR id::text LIKE 'b0000000-0000-4000-8000-%'
);

DELETE FROM auth.identities
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email = 'demo-feed@pickleapp.kr'
     OR email LIKE 'voter%@pickleapp.kr'
     OR email LIKE 'voter%@pickle.local'
     OR id = 'a0000000-0000-4000-8000-000000000001'
     OR id::text LIKE 'b0000000-0000-4000-8000-%'
);

DELETE FROM auth.users
WHERE email = 'demo-feed@pickleapp.kr'
   OR email LIKE 'voter%@pickleapp.kr'
   OR email LIKE 'voter%@pickle.local'
   OR id = 'a0000000-0000-4000-8000-000000000001'
   OR id::text LIKE 'b0000000-0000-4000-8000-%';

-- 청소 완료 → 이어서 04b_demo_seed.sql 실행
