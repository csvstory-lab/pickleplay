-- P!CKLE — notifications.type 에 'reply' 추가 (대댓글 알림)
-- 선행: 23_create_notifications_table.sql

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('comment', 'reply', 'vote', 'end', 'honor', 'mypick', 'result', 'system'));

COMMENT ON COLUMN public.notifications.type IS 'comment/reply/vote/end/honor/mypick/result/system';
