-- P!CKLE — 대댓글(답글) 알림: 부모 댓글 작성자에게 comment 알림
-- 선행: 23_create_notifications_table.sql, 24_notification_triggers.sql, 34_comments_parent_id.sql
--
-- · pickle-detail.js → pickle_insert_notification RPC (클라이언트 알림 생성)
-- · 기존 comments INSERT 트리거는 제거 (클라이언트와 이중 발송 방지)
-- · 대댓글(parent_id NOT NULL): 부모 댓글 작성자 (본인 답글 제외)
-- · 일반 댓글: 불판 작성자(author_id) (본인 댓글 제외)

GRANT EXECUTE ON FUNCTION public.pickle_insert_notification(UUID, TEXT, TEXT, TEXT) TO authenticated;

DROP TRIGGER IF EXISTS trg_comments_notify_post_owner ON public.comments;

-- (선택) 트리거 함수는 백업·수동 호출용으로 대댓글 분기 로직만 최신화
CREATE OR REPLACE FUNCTION public.trg_fn_comments_notify_post_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient     UUID;
  v_parent_author UUID;
  v_snippet       TEXT;
  v_message       TEXT;
  v_link          TEXT;
BEGIN
  IF NEW.visibility_status IS DISTINCT FROM 'visible' THEN
    RETURN NEW;
  END IF;

  IF NEW.ai_filter_status = 'blocked' THEN
    RETURN NEW;
  END IF;

  v_snippet := public.pickle_truncate_text(
    COALESCE(NULLIF(trim(NEW.filtered_content), ''), NEW.content),
    40
  );

  v_link := 'detail.html?id=' || NEW.post_id::TEXT || '#comment-' || NEW.id::TEXT;

  -- 대댓글: 부모 댓글 작성자에게 알림
  IF NEW.parent_id IS NOT NULL THEN
    SELECT c.user_id
    INTO v_parent_author
    FROM public.comments c
    WHERE c.id = NEW.parent_id;

    IF v_parent_author IS NULL OR v_parent_author = NEW.user_id THEN
      RETURN NEW;
    END IF;

    v_message := '내 댓글에 답글이 달렸습니다.';

    PERFORM public.pickle_insert_notification(
      v_parent_author,
      'reply',
      v_message,
      v_link
    );

    RETURN NEW;
  END IF;

  -- 일반 댓글: 불판 작성자에게 알림
  SELECT p.author_id
  INTO v_recipient
  FROM public.posts p
  WHERE p.id = NEW.post_id;

  IF v_recipient IS NULL OR v_recipient = NEW.user_id THEN
    RETURN NEW;
  END IF;

  v_message := '💬 내 불판에 새로운 댓글이 달렸습니다: ''' || v_snippet || '''';
  v_link := 'detail.html?id=' || NEW.post_id::TEXT;

  PERFORM public.pickle_insert_notification(
    v_recipient,
    'comment',
    v_message,
    v_link
  );

  RETURN NEW;
END;
$$;
