-- comments — 작성 시점 작성자 스냅샷 (닉네임·아바타)
-- auth.users user_metadata 를 댓글 등록 시 영구 저장

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS author_nickname TEXT;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS author_avatar_html TEXT;

COMMENT ON COLUMN public.comments.author_nickname IS '댓글 작성 시점 작성자 닉네임 스냅샷';
COMMENT ON COLUMN public.comments.author_avatar_html IS '댓글 작성 시점 아바타(이모지 또는 img HTML) 스냅샷';
