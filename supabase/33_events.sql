-- =============================================================================
-- P!CKLE — 이벤트(events) 테이블 + RLS + 샘플 시드
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  join_type           TEXT NOT NULL DEFAULT 'click'
                      CHECK (join_type IN ('vote', 'reply', 'click')),
  join_type_label     TEXT,
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  thumbnail_url       TEXT,
  thumb_text          TEXT,
  thumb_bg_style      TEXT,
  detail_banner_url   TEXT,
  description         TEXT,
  notice_items        JSONB NOT NULL DEFAULT '[]'::jsonb,
  participate_points  INTEGER NOT NULL DEFAULT 0,
  share_points        INTEGER NOT NULL DEFAULT 50,
  participate_label   TEXT NOT NULL DEFAULT '응모하기',
  google_form_url     TEXT,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'ongoing', 'ended', 'hidden')),
  winners             JSONB NOT NULL DEFAULT '[]'::jsonb,
  winner_summary      TEXT,
  winner_box_title    TEXT,
  prizes              JSONB NOT NULL DEFAULT '[]'::jsonb,
  push_enabled        BOOLEAN NOT NULL DEFAULT false,
  push_text           TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT events_date_range CHECK (end_date >= start_date)
);

COMMENT ON TABLE public.events IS 'P!CKLE 앱 이벤트 · 프로모션 (user_app/event.html)';

CREATE INDEX IF NOT EXISTS idx_events_status_sort
  ON public.events (status, sort_order DESC, end_date DESC);

CREATE INDEX IF NOT EXISTS idx_events_end_date
  ON public.events (end_date DESC);

-- ── RLS: 공개 SELECT (ongoing / ended 만) ──

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select_public" ON public.events;
CREATE POLICY "events_select_public"
  ON public.events FOR SELECT
  TO anon, authenticated
  USING (status IN ('ongoing', 'ended'));

GRANT SELECT ON public.events TO anon, authenticated;

-- ── 샘플 시드 (진행 1건 + 종료 1건) ──

INSERT INTO public.events (
  id,
  title,
  join_type,
  join_type_label,
  start_date,
  end_date,
  thumbnail_url,
  thumb_text,
  thumb_bg_style,
  detail_banner_url,
  description,
  notice_items,
  participate_points,
  share_points,
  participate_label,
  google_form_url,
  status,
  winners,
  winner_summary,
  winner_box_title,
  sort_order
) VALUES
(
  'a0000001-0000-4000-8000-000000000001',
  '주간 베스트 불판 참전 인증하고 스벅 마시자!',
  'reply',
  '☕ 참여 추첨',
  '2026-06-01',
  '2026-06-30',
  NULL,
  '☕ 스타벅스 아메리카노<br><span style="color:var(--neon-green);">1,000잔 쏜다!</span>',
  'linear-gradient(135deg, #1c2e28 0%, #051410 100%)',
  NULL,
  '픽클러 여러분! 카페인 수혈이 시급한 분들을 위해 준비했습니다.' || E'\n\n' ||
  '이번 주 가장 핫한 불판에 참전하고, 댓글로 인증을 남겨주시면 추첨을 통해 무려 **1,000분께 스타벅스 아메리카노 기프티콘**을 쏩니다!' || E'\n\n' ||
  '지금 바로 하단 버튼을 눌러 이벤트에 응모하세요!',
  '["당첨자는 이벤트 마감 후 3일 이내에 앱 내 푸시 알림으로 안내됩니다.", "지급된 기프티콘은 마이페이지 > [내 보관함]에서 확인 및 사용이 가능합니다.", "부정한 방법으로 이벤트 참여 시 당첨이 취소될 수 있습니다."]'::jsonb,
  100,
  50,
  '스타벅스 응모하기',
  NULL,
  'ongoing',
  '[]'::jsonb,
  NULL,
  NULL,
  10
),
(
  'a0000001-0000-4000-8000-000000000002',
  '[당첨자 발표] 빙그레 스폰서 밸런스 투표 인증 이벤트',
  'vote',
  '☕ 참여 추첨',
  '2026-04-15',
  '2026-04-30',
  NULL,
  '🍌 빙그레 바나나맛 우유<br>투표 인증 이벤트',
  'linear-gradient(135deg, #1a1a1a 0%, #000 100%)',
  NULL,
  '빙그레 스폰서 불판에 참여해주신 모든 픽클러 분들께 감사드립니다!' || E'\n\n' ||
  '뜨거웠던 투표 열기 속에 당첨되신 행운의 주인공 50분을 아래와 같이 발표합니다. 당첨되신 분들의 보관함(마이페이지)으로 기프티콘이 일괄 지급되었습니다.',
  '[]'::jsonb,
  0,
  50,
  '응모하기',
  NULL,
  'ended',
  '[
    {"nickname": "도파민중독", "uid_mask": "84***"},
    {"nickname": "쩝쩝박사", "uid_mask": "10***"},
    {"nickname": "결정장애", "uid_mask": "33***"},
    {"nickname": "바나나러버", "uid_mask": "92***"},
    {"nickname": "픽클만세", "uid_mask": "11***"}
  ]'::jsonb,
  '외 45명 (개별 알림 발송 완료)',
  '🎉 바나나맛 우유 당첨자 (50명)',
  5
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  join_type = EXCLUDED.join_type,
  join_type_label = EXCLUDED.join_type_label,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  thumb_text = EXCLUDED.thumb_text,
  thumb_bg_style = EXCLUDED.thumb_bg_style,
  description = EXCLUDED.description,
  notice_items = EXCLUDED.notice_items,
  participate_points = EXCLUDED.participate_points,
  share_points = EXCLUDED.share_points,
  participate_label = EXCLUDED.participate_label,
  status = EXCLUDED.status,
  winners = EXCLUDED.winners,
  winner_summary = EXCLUDED.winner_summary,
  winner_box_title = EXCLUDED.winner_box_title,
  sort_order = EXCLUDED.sort_order,
  updated_at = timezone('utc', now());

NOTIFY pgrst, 'reload schema';
