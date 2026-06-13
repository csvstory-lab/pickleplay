-- users — 공개 프로필 아바타 스냅샷 (팔로우·피드·랭킹 표시용)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_html TEXT;

COMMENT ON COLUMN public.users.avatar_html IS '프로필 아바타 HTML/이모지 (타 유저에게 공개 표시)';

-- 최근 게시글 작성자 스냅샷으로 기존 회원 backfill
UPDATE public.users u
SET avatar_html = sub.author_avatar_html
FROM (
  SELECT DISTINCT ON (author_id)
    author_id,
    author_avatar_html
  FROM public.posts
  WHERE author_avatar_html IS NOT NULL
    AND trim(author_avatar_html) <> ''
  ORDER BY author_id, created_at DESC
) sub
WHERE u.id = sub.author_id
  AND (u.avatar_html IS NULL OR trim(u.avatar_html) = '');

NOTIFY pgrst, 'reload schema';
