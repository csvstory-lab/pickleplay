-- =============================================================================
-- P!CKLE (픽클) — 고객센터(CS) 통합 설정 테이블
-- Supabase SQL Editor 에 전체 복사 후 [Run] 클릭
--
-- ⚠️ 선행 조건: 01_create_core_tables.sql 실행 완료
--    (set_updated_at 함수가 있어야 합니다. 02는 이 테이블과 무관)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cs_settings (
  id                      SMALLINT PRIMARY KEY DEFAULT 1
    CONSTRAINT cs_settings_singleton CHECK (id = 1),

  kakao_channel_url       TEXT,
  kakao_channel_name      TEXT,
  cs_email                TEXT,
  cs_phone                TEXT,

  weekday_open            TIME,
  weekday_close           TIME,
  weekend_open            TIME,
  weekend_close           TIME,
  is_weekend_closed       BOOLEAN NOT NULL DEFAULT TRUE,

  operating_hours_summary TEXT,
  holiday_notice          TEXT,

  is_kakao_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  is_email_enabled        BOOLEAN NOT NULL DEFAULT TRUE,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT cs_settings_email_format CHECK (
    cs_email IS NULL OR cs_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ),
  CONSTRAINT cs_settings_weekday_hours_valid CHECK (
    (weekday_open IS NULL AND weekday_close IS NULL)
    OR (weekday_open IS NOT NULL AND weekday_close IS NOT NULL AND weekday_open < weekday_close)
  ),
  CONSTRAINT cs_settings_weekend_hours_valid CHECK (
    is_weekend_closed = TRUE
    OR (
      weekend_open IS NOT NULL
      AND weekend_close IS NOT NULL
      AND weekend_open < weekend_close
    )
  )
);

COMMENT ON TABLE public.cs_settings IS '고객센터 통합 설정 (카카오 채널·운영시간·이메일 등) — 행은 항상 1개만 유지';
COMMENT ON COLUMN public.cs_settings.kakao_channel_url IS '카카오 비즈니스 채널 URL (챗봇/상담 연결)';
COMMENT ON COLUMN public.cs_settings.kakao_channel_name IS '앱에 표시할 채널 이름 (예: 픽클 고객센터)';
COMMENT ON COLUMN public.cs_settings.cs_email IS '고객센터 이메일';
COMMENT ON COLUMN public.cs_settings.cs_phone IS '고객센터 전화번호 (선택)';
COMMENT ON COLUMN public.cs_settings.weekday_open IS '평일 운영 시작 (한국 시간 기준으로 앱에서 표시)';
COMMENT ON COLUMN public.cs_settings.weekday_close IS '평일 운영 종료';
COMMENT ON COLUMN public.cs_settings.weekend_open IS '주말 운영 시작 (주말무면 NULL)';
COMMENT ON COLUMN public.cs_settings.weekend_close IS '주말 운영 종료';
COMMENT ON COLUMN public.cs_settings.is_weekend_closed IS '주말 휴무 여부';
COMMENT ON COLUMN public.cs_settings.operating_hours_summary IS '앱에 보여줄 한 줄 요약 (예: 평일 10:00~19:00, 주말 휴무)';
COMMENT ON COLUMN public.cs_settings.holiday_notice IS '공휴일·특별 안내 문구';
COMMENT ON COLUMN public.cs_settings.is_kakao_enabled IS '카카오 상담 버튼 노출 여부';
COMMENT ON COLUMN public.cs_settings.is_email_enabled IS '이메일 문의 안내 노출 여부';

DROP TRIGGER IF EXISTS trg_cs_settings_updated_at ON public.cs_settings;
CREATE TRIGGER trg_cs_settings_updated_at
  BEFORE UPDATE ON public.cs_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 기본 설정 1행 (최초 1회만 삽입)
INSERT INTO public.cs_settings (
  id,
  kakao_channel_url,
  kakao_channel_name,
  cs_email,
  weekday_open,
  weekday_close,
  is_weekend_closed,
  operating_hours_summary,
  holiday_notice
)
SELECT
  1,
  'https://pf.kakao.com/_your_channel',
  'P!CKLE 고객센터',
  'help@pickleapp.kr',
  TIME '10:00',
  TIME '19:00',
  TRUE,
  '평일 10:00 ~ 19:00 (주말·공휴일 휴무)',
  '공휴일에는 답변이 지연될 수 있습니다.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.cs_settings WHERE id = 1
);

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================
ALTER TABLE public.cs_settings ENABLE ROW LEVEL SECURITY;

-- 유저 앱: 설정 읽기만 허용
DROP POLICY IF EXISTS "cs_settings_select_public" ON public.cs_settings;
CREATE POLICY "cs_settings_select_public"
  ON public.cs_settings FOR SELECT
  TO anon, authenticated
  USING (TRUE);

-- 등록·수정·삭제는 일반 유저 불가 (백오피스 service_role 또는 추후 admin 정책)

-- =============================================================================
-- 완료. Table Editor → cs_settings 에서 id=1 행을 수정하세요.
-- =============================================================================
