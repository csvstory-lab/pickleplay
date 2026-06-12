-- P!CKLE — notifications (유저 알림)
-- 종 아이콘 배지 · notifications.html 목록 연동
-- 다음: 24_notification_triggers.sql (자동 생성 트리거 + pg_cron)
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL
    CHECK (type IN ('comment', 'vote', 'end', 'honor', 'mypick', 'result', 'system')),
  message     TEXT NOT NULL,
  link_url    TEXT,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT notifications_message_not_empty CHECK (char_length(trim(message)) > 0)
);

COMMENT ON TABLE public.notifications IS '유저별 앱 알림 (종 아이콘 · 알림함)';
COMMENT ON COLUMN public.notifications.user_id IS '알림 수신 유저 → users.id';
COMMENT ON COLUMN public.notifications.type IS 'comment/vote/end/honor/mypick/result/system';
COMMENT ON COLUMN public.notifications.message IS '알림 본문 텍스트';
COMMENT ON COLUMN public.notifications.link_url IS '클릭 시 이동 URL (예: detail.html?id=...)';
COMMENT ON COLUMN public.notifications.is_read IS '읽음 여부 (false = 미읽음, 종 아이콘 빨간 점)';

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id)
  WHERE is_read = FALSE;

-- ── RLS ──
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- INSERT는 서버/관리자(service_role) 또는 SECURITY DEFINER 함수로 생성
-- 테스트 예시 (Table Editor · service_role):
-- INSERT INTO public.notifications (user_id, type, message, link_url)
-- VALUES ('YOUR-USER-UUID', 'comment', '프로불편러님이 내 댓글에 반박을 달았습니다!', 'detail.html?id=POST-UUID');
