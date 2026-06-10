-- posts — 해시태그(tags) · 상세 설명(description) 컬럼
-- create.html 입력값 저장 · 피드·마이페이지 수정 팝업용

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS tags TEXT;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.posts.tags IS '공백 구분 해시태그 (예: #데이트 #패션)';
COMMENT ON COLUMN public.posts.description IS '불판 상세 설명 (마이페이지 수정 가능)';
