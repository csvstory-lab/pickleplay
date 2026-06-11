-- posts — 작성 시점 작성자 스냅샷 (닉네임·아바타)
-- Google 로그인 등 auth.users 메타데이터를 게시글 생성 시 영구 저장

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS author_nickname TEXT;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS author_avatar_html TEXT;

COMMENT ON COLUMN public.posts.author_nickname IS '불판 생성 시점 작성자 닉네임 스냅샷';
COMMENT ON COLUMN public.posts.author_avatar_html IS '불판 생성 시점 아바타(이모지 또는 img HTML) 스냅샷';
