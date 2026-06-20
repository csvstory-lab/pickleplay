-- =============================================================================
-- P!CKLE — 일별 대시보드 통계 (DAU · PV · 활력 지표)
-- Supabase SQL Editor → Run
-- admin_dashboard.html 에서 daily_statistics 조회
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.daily_statistics (
  date            DATE PRIMARY KEY,
  dau             INTEGER NOT NULL DEFAULT 0 CHECK (dau >= 0),
  pv              INTEGER NOT NULL DEFAULT 0 CHECK (pv >= 0),
  viral_index     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  dopamine_rate   NUMERIC(6, 2) NOT NULL DEFAULT 0,
  ignition_speed  NUMERIC(8, 2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.daily_statistics IS '관리자 대시보드 일별 집계 (배치/크론으로 적재)';
COMMENT ON COLUMN public.daily_statistics.date IS '집계 기준일 (YYYY-MM-DD)';
COMMENT ON COLUMN public.daily_statistics.dau IS '일간 활성 사용자 수';
COMMENT ON COLUMN public.daily_statistics.pv IS '페이지 뷰';
COMMENT ON COLUMN public.daily_statistics.viral_index IS '불판 바이럴 지수 (%)';
COMMENT ON COLUMN public.daily_statistics.dopamine_rate IS '도파민 전환율 (%)';
COMMENT ON COLUMN public.daily_statistics.ignition_speed IS '불판 점화 속도 (분)';

CREATE OR REPLACE FUNCTION public.set_daily_statistics_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_statistics_updated_at ON public.daily_statistics;
CREATE TRIGGER trg_daily_statistics_updated_at
  BEFORE UPDATE ON public.daily_statistics
  FOR EACH ROW
  EXECUTE FUNCTION public.set_daily_statistics_updated_at();

ALTER TABLE public.daily_statistics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_statistics_select_admin ON public.daily_statistics;
CREATE POLICY daily_statistics_select_admin
  ON public.daily_statistics FOR SELECT
  TO anon, authenticated
  USING (true);

-- service_role / 배치 전용 쓰기는 Dashboard 또는 Edge Function에서 service key 사용
-- (프론트 read-only)

-- 오늘 날짜 더미 데이터 (재실행 시 갱신)
INSERT INTO public.daily_statistics (
  date, dau, pv, viral_index, dopamine_rate, ignition_speed
)
VALUES (
  CURRENT_DATE,
  28450,
  452100,
  142.00,
  68.50,
  12.00
)
ON CONFLICT (date) DO UPDATE SET
  dau = EXCLUDED.dau,
  pv = EXCLUDED.pv,
  viral_index = EXCLUDED.viral_index,
  dopamine_rate = EXCLUDED.dopamine_rate,
  ignition_speed = EXCLUDED.ignition_speed,
  updated_at = timezone('utc', now());

NOTIFY pgrst, 'reload schema';
