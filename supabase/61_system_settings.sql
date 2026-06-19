-- =============================================================================
-- P!CKLE — system_settings (앱 전역 설정 singleton)
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  general_config  JSONB NOT NULL DEFAULT '{}'::jsonb,
  point_config    JSONB NOT NULL DEFAULT '{}'::jsonb,
  penalty_config  JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT system_settings_singleton CHECK (id = 1)
);

COMMENT ON TABLE public.system_settings IS '관리자 시스템 설정 (singleton id=1)';

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.system_settings (id, general_config, point_config, penalty_config)
VALUES (
  1,
  '{
    "maintenance_enabled": false,
    "maintenance_message": "안정적인 서비스 제공을 위해 시스템 점검 중입니다. (14:00~16:00)",
    "auto_login_default": true,
    "block_copy": true,
    "block_drag": true,
    "block_screenshot": false,
    "favicon_url": "",
    "og_image_url": "",
    "meta_title": "픽클 (P!CKLE) - 도파민 터지는 투표 커뮤니티",
    "meta_description": "세상의 모든 논쟁거리, 픽클에서 투표하고 이야기하세요!",
    "meta_keywords": "투표,밸런스게임,도파민,픽클,이슈,커뮤니티,MBTI,연애상담,썰",
    "naver_verification": "naver-site-verification-1a2b3c",
    "google_verification": "google-site-verification-9x8y7z",
    "sns_youtube": "https://youtube.com/@pickle_official",
    "sns_instagram": "https://instagram.com/pickle_kr",
    "sns_tiktok": "https://tiktok.com/@pickle_kr",
    "sns_kakao": "http://pf.kakao.com/_xxxxxx",
    "sns_blog": "https://blog.naver.com/pickle_team",
    "sns_facebook": "",
    "app_store_url": "https://apps.apple.com/app/id123456789",
    "play_store_url": "https://play.google.com/store/apps/details?id=com.pickle.app",
    "company_name": "(주)픽클컴퍼니",
    "ceo_name": "홍길동",
    "business_number": "123-45-67890",
    "mail_order_number": "제 2026-서울성동-1234호",
    "company_address": "서울특별시 성동구 뚝섬로 123, 픽클타워 7층"
  }'::jsonb,
  '{
    "engine_enabled": false,
    "signup_welcome": 1000,
    "referral_inviter": 500,
    "referral_invitee": 500,
    "event_participate": 10,
    "event_share": 50,
    "ugc_post": 5,
    "ugc_comment": 1,
    "honor_weekly_best": 500,
    "honor_best_comment": 50,
    "expiry_period": "1y",
    "daily_cap": 1000
  }'::jsonb,
  '{
    "report_blind_threshold": 10,
    "ai_profanity_filter": true,
    "ai_vision_threshold": 80,
    "score_abuse": 10,
    "score_spam": 30,
    "score_illegal": 50,
    "auto_30_points": 30,
    "auto_30_action": "suspend_3d",
    "auto_50_points": 50,
    "auto_50_action": "suspend_7d",
    "auto_100_points": 100
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_settings_select_admin ON public.system_settings;
CREATE POLICY system_settings_select_admin
  ON public.system_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS system_settings_update_admin ON public.system_settings;
CREATE POLICY system_settings_update_admin
  ON public.system_settings FOR UPDATE
  TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS system_settings_insert_admin ON public.system_settings;
CREATE POLICY system_settings_insert_admin
  ON public.system_settings FOR INSERT
  TO anon, authenticated
  WITH CHECK (id = 1);

GRANT SELECT, INSERT, UPDATE ON public.system_settings TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
