-- P!CKLE — 일반 댓글(게시물 직접 댓글) 알림 중단 · 대댓글 알림만 유지
-- 선행: 23_create_notifications_table.sql, 35_comment_reply_notifications.sql
--
-- 정책
-- · 일반 댓글(parent_id IS NULL): 게시물 작성자에게 알림 생성 안 함
-- · 대댓글(parent_id IS NOT NULL): 원댓글 작성자에게 reply 알림 (본인 답글 제외)
--
-- 알림 생성 경로
-- · 운영: pickle-detail.js → sendReplyNotification() → pickle_insert_notification RPC
-- · DB 트리거: 비활성(이중 발송 방지). 함수만 최신 정책으로 유지

GRANT EXECUTE ON FUNCTION public.pickle_insert_notification(UUID, TEXT, TEXT, TEXT) TO authenticated;

DROP TRIGGER IF EXISTS trg_comments_notify_post_owner ON public.comments;

CREATE OR REPLACE FUNCTION public.trg_fn_comments_notify_post_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_author UUID;
  v_link          TEXT;
BEGIN
  IF NEW.visibility_status IS DISTINCT FROM 'visible' THEN
    RETURN NEW;
  END IF;

  IF NEW.ai_filter_status = 'blocked' THEN
    RETURN NEW;
  END IF;

  -- 일반 댓글: 알림 없음
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 대댓글: 원댓글 작성자에게만 알림
  SELECT c.user_id
  INTO v_parent_author
  FROM public.comments c
  WHERE c.id = NEW.parent_id;

  IF v_parent_author IS NULL OR v_parent_author = NEW.user_id THEN
    RETURN NEW;
  END IF;

  v_link := 'detail.html?id=' || NEW.post_id::TEXT || '#comment-' || NEW.id::TEXT;

  PERFORM public.pickle_insert_notification(
    v_parent_author,
    'reply',
    '내 댓글에 답글이 달렸습니다.',
    v_link
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_fn_comments_notify_post_owner() IS
  '대댓글(reply) 알림 전용 함수. comments INSERT 트리거는 비활성 — 클라이언트(pickle-detail.js)에서 reply 알림 생성.';
