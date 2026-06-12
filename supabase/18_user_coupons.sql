-- user_coupons — 마이페이지 보관함 (이벤트·리워드 쿠폰)
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.user_coupons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  pin_number  TEXT NOT NULL,
  is_used     BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.user_coupons IS '유저별 보관함 쿠폰 (핀넘버·사용 여부)';
COMMENT ON COLUMN public.user_coupons.pin_number IS '쿠폰 핀(PIN) 번호';
COMMENT ON COLUMN public.user_coupons.is_used IS 'true = 사용 완료';

CREATE INDEX IF NOT EXISTS idx_user_coupons_user_id ON public.user_coupons (user_id);
CREATE INDEX IF NOT EXISTS idx_user_coupons_user_used ON public.user_coupons (user_id, is_used);

DROP TRIGGER IF EXISTS trg_user_coupons_updated_at ON public.user_coupons;
CREATE TRIGGER trg_user_coupons_updated_at
  BEFORE UPDATE ON public.user_coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_coupons_select_own ON public.user_coupons;
CREATE POLICY user_coupons_select_own
  ON public.user_coupons FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_coupons_update_own ON public.user_coupons;
CREATE POLICY user_coupons_update_own
  ON public.user_coupons FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- PostgREST(anon/authenticated) API 접근 권한 — 누락 시 permission denied 발생
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, UPDATE ON public.user_coupons TO authenticated;
GRANT SELECT, UPDATE ON public.user_coupons TO service_role;

-- 스키마 캐시 갱신 (테이블 생성 직후 API 미노출 방지)
NOTIFY pgrst, 'reload schema';
