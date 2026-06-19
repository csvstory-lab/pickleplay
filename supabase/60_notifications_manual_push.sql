-- =============================================================================
-- P!CKLE — 수동 푸시 알림 (manual_notice) + title 컬럼 + 관리자 INSERT
-- Supabase SQL Editor → 전체 복사 → Run
-- 선행: 23_create_notifications_table.sql
-- =============================================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'comment', 'reply', 'vote', 'end', 'honor', 'mypick', 'result', 'system',
    'manual_notice'
  ));

COMMENT ON COLUMN public.notifications.title IS '알림 제목 (수동 푸시·공지 등)';
COMMENT ON COLUMN public.notifications.type IS 'comment/reply/.../system/manual_notice';

DROP POLICY IF EXISTS notifications_insert_admin ON public.notifications;
CREATE POLICY notifications_insert_admin
  ON public.notifications FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

GRANT INSERT ON public.notifications TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
