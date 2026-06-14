-- P!CKLE — categories 관리자 페이지 연동 (description, is_fixed, RLS)

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.categories.description IS '카테고리 설명 (관리자·앱 노출용)';
COMMENT ON COLUMN public.categories.is_fixed IS 'true면 순서 변경·삭제 불가 (시스템 고정)';

-- 관리자 웹(anon)에서 전체 조회·CRUD (운영 시 authenticated + role 제한 권장)
DROP POLICY IF EXISTS categories_select_active ON public.categories;
DROP POLICY IF EXISTS categories_select_all ON public.categories;
DROP POLICY IF EXISTS categories_insert ON public.categories;
DROP POLICY IF EXISTS categories_update ON public.categories;
DROP POLICY IF EXISTS categories_delete ON public.categories;

CREATE POLICY categories_select_all
  ON public.categories FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY categories_insert
  ON public.categories FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY categories_update
  ON public.categories FOR UPDATE TO anon, authenticated
  USING (true);

CREATE POLICY categories_delete
  ON public.categories FOR DELETE TO anon, authenticated
  USING (COALESCE(is_fixed, false) = false);
