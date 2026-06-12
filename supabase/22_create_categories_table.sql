-- P!CKLE — categories (다이나믹 카테고리 마스터)
-- 관리자: sort_order / is_active 변경 → 앱 칩 바 즉시 반영 (새로고침 시)

CREATE TABLE IF NOT EXISTS public.categories (
  slug        TEXT PRIMARY KEY,
  id          UUID NOT NULL DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT categories_slug_not_empty CHECK (char_length(trim(slug)) > 0),
  CONSTRAINT categories_name_not_empty CHECK (char_length(trim(name)) > 0)
);

COMMENT ON TABLE public.categories IS '불판 카테고리 마스터 (slug = posts.category)';
COMMENT ON COLUMN public.categories.slug IS '영문 슬러그 — posts.category FK 역할';
COMMENT ON COLUMN public.categories.name IS '한글 표시명';
COMMENT ON COLUMN public.categories.icon IS '이모지 아이콘';
COMMENT ON COLUMN public.categories.sort_order IS '칩/그리드 노출 순서 (오름차순)';
COMMENT ON COLUMN public.categories.is_active IS 'false면 앱에서 숨김';

CREATE INDEX IF NOT EXISTS idx_categories_sort_active
  ON public.categories (is_active, sort_order ASC);

CREATE OR REPLACE FUNCTION public.set_categories_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_categories_updated_at();

-- ── RLS: 누구나 active 카테고리 조회 (관리자 Table Editor는 service_role) ──
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_select_active ON public.categories;
CREATE POLICY categories_select_active
  ON public.categories
  FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);

-- ── 시드 (15개 · sort_order로 칩 순서 제어) ──
INSERT INTO public.categories (slug, name, icon, sort_order, is_active) VALUES
  ('worldcup', '북중미 월드컵', '⚽',  10, TRUE),
  ('food',     '먹잘알/푸파',   '🍕',  20, TRUE),
  ('love',     '연애/과몰입',   '💖',  30, TRUE),
  ('balance',  '뇌정지 밸런스', '⚖️',  40, TRUE),
  ('fashion',  'OOTD/스타일',   '👗',  50, TRUE),
  ('drama',    '빌런/썰',       '🤬',  60, TRUE),
  ('fandom',   '덕질/서브컬처', '🍿',  70, TRUE),
  ('games',    '겜심/이스포츠', '🎮',  80, TRUE),
  ('pets',     '힐링/동물',     '🐾',  90, TRUE),
  ('sports',   '스포츠/매치업', '🏟️', 100, TRUE),
  ('spending', '텅장/소비',     '💸', 110, TRUE),
  ('mind',     'MBTI/심리',     '🧠', 120, TRUE),
  ('kpop',     '돌판/K-POP',    '🎤', 130, TRUE),
  ('mystery',  '미스터리',      '👻', 140, TRUE),
  ('driving',  '블박/과실',     '🚗', 150, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = timezone('utc', now());
