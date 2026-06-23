-- =============================================================================
-- P!CKLE — 메인 이벤트 팝업 (바텀 시트) popups 테이블
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.popups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL,
  link_url    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  start_date  TIMESTAMPTZ NOT NULL,
  end_date    TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT popups_date_range CHECK (end_date >= start_date)
);

COMMENT ON TABLE public.popups IS '메인 화면 이벤트 팝업 (바텀 시트)';
COMMENT ON COLUMN public.popups.image_url IS '팝업 이미지 URL';
COMMENT ON COLUMN public.popups.link_url IS '클릭 시 이동 URL (선택)';
COMMENT ON COLUMN public.popups.is_active IS '메인 노출 ON/OFF';

CREATE INDEX IF NOT EXISTS idx_popups_active_window
  ON public.popups (is_active, start_date DESC, end_date DESC);

ALTER TABLE public.popups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS popups_select_all ON public.popups;
CREATE POLICY popups_select_all
  ON public.popups FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admin 웹(anon) CRUD — 운영 시 authenticated + role 제한 권장
DROP POLICY IF EXISTS popups_insert_admin ON public.popups;
CREATE POLICY popups_insert_admin
  ON public.popups FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS popups_update_admin ON public.popups;
CREATE POLICY popups_update_admin
  ON public.popups FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS popups_delete_admin ON public.popups;
CREATE POLICY popups_delete_admin
  ON public.popups FOR DELETE
  TO anon, authenticated
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.popups TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
