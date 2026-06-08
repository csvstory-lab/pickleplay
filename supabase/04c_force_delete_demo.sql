-- =============================================================================
-- P!CKLE 04-C: 데모 계정 강제 삭제만 (짧음 — 먼저 Run)
-- 오류 users_pkey 나올 때 → 이 파일 Run → 04b Run
-- =============================================================================

DELETE FROM public.votes
WHERE post_id IN (
        'c0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000002'
      )
   OR user_id::text LIKE 'a0000000-0000-4000-8000-%'
   OR user_id::text LIKE 'b0000000-0000-4000-8000-%';

DELETE FROM public.comments
WHERE post_id IN (
        'c0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000002'
      )
   OR user_id::text LIKE 'a0000000-0000-4000-8000-%'
   OR user_id::text LIKE 'b0000000-0000-4000-8000-%';

DELETE FROM public.inquiries
WHERE user_id::text LIKE 'a0000000-0000-4000-8000-%'
   OR user_id::text LIKE 'b0000000-0000-4000-8000-%';

DELETE FROM public.posts
WHERE id IN (
        'c0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000002'
      )
   OR author_id = 'a0000000-0000-4000-8000-000000000001';

DELETE FROM public.users
WHERE id::text LIKE 'a0000000-0000-4000-8000-%'
   OR id::text LIKE 'b0000000-0000-4000-8000-%';

DELETE FROM auth.sessions
WHERE user_id::text LIKE 'a0000000-0000-4000-8000-%'
   OR user_id::text LIKE 'b0000000-0000-4000-8000-%';

DELETE FROM auth.refresh_tokens
WHERE user_id::text LIKE 'a0000000-0000-4000-8000-%'
   OR user_id::text LIKE 'b0000000-0000-4000-8000-%';

DELETE FROM auth.identities
WHERE user_id::text LIKE 'a0000000-0000-4000-8000-%'
   OR user_id::text LIKE 'b0000000-0000-4000-8000-%';

DELETE FROM auth.users
WHERE id::text LIKE 'a0000000-0000-4000-8000-%'
   OR id::text LIKE 'b0000000-0000-4000-8000-%'
   OR email = 'demo-feed@pickleapp.kr'
   OR email LIKE 'voter%@pickleapp.kr';

-- 삭제 확인 (결과 0건이면 OK)
SELECT id, email FROM auth.users
WHERE id = 'a0000000-0000-4000-8000-000000000001';
