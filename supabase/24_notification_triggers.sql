-- P!CKLE — 알림 자동 생성 (Trigger + 마감/명예 스케줄)
-- 선행: 23_create_notifications_table.sql 실행 완료
--
-- [정책] 마감(end)·명예(honor) 알림은 pg_cron 1분 주기 — 최대 1분 지연 허용 (의도된 설계)
--        Edge Function 불필요. 댓글(comment) 알림만 INSERT 트리거로 즉시 발송.
--
-- 1) comments INSERT → 작성자에게 comment 알림 (본인 댓글 제외)
-- 2) expires_at 경과 → 투표 참여자 + 작성자에게 end 알림 (pg_cron 1분 주기)
-- 3) 마감 후 4대 천왕 + 허들 통과 → 작성자에게 honor 알림
--
-- ⚙️ pg_cron: Supabase Dashboard → Database → Extensions → pg_cron 활성화 후 본 스크립트 실행
-- 📡 Realtime: Dashboard → Database → Replication → notifications 테이블 ON
-- 🧪 수동 테스트: SELECT public.pickle_process_due_post_notifications();

-- ── posts: 알림 발송 상태 추적 ──
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS end_notified_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS honor_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.posts.end_notified_at IS '마감(end) 알림 발송 완료 시각';
COMMENT ON COLUMN public.posts.honor_notified_at IS '전당 후보(honor) 알림 발송 완료 시각';

CREATE INDEX IF NOT EXISTS idx_posts_expires_end_pending
  ON public.posts (expires_at ASC)
  WHERE end_notified_at IS NULL
    AND expires_at IS NOT NULL
    AND visibility_status = 'visible';

-- ── Realtime (종 아이콘 즉시 갱신) ──
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication 없음 — Dashboard Replication에서 notifications 활성화';
  WHEN OTHERS THEN
    RAISE NOTICE 'Realtime publication 설정 스킵: %', SQLERRM;
END $$;

-- ── 공통: 알림 INSERT (RLS 우회) ──
CREATE OR REPLACE FUNCTION public.pickle_insert_notification(
  p_user_id  UUID,
  p_type     TEXT,
  p_message  TEXT,
  p_link_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_user_id IS NULL OR p_message IS NULL OR char_length(trim(p_message)) = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (user_id, type, message, link_url)
  VALUES (p_user_id, p_type, trim(p_message), NULLIF(trim(p_link_url), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pickle_insert_notification(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;

-- ── 공통: 텍스트 요약 ──
CREATE OR REPLACE FUNCTION public.pickle_truncate_text(
  p_text TEXT,
  p_max  INTEGER DEFAULT 40
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR trim(p_text) = '' THEN ''
    WHEN char_length(trim(regexp_replace(p_text, E'[\\n\\r\\t]+', ' ', 'g'))) <= p_max
      THEN trim(regexp_replace(p_text, E'[\\n\\r\\t]+', ' ', 'g'))
    ELSE left(trim(regexp_replace(p_text, E'[\\n\\r\\t]+', ' ', 'g')), p_max) || '…'
  END;
$$;

-- ── Hall of Fame: 활성 유저 수 (최근 30일 votes + comments) ──
CREATE OR REPLACE FUNCTION public.pickle_count_active_users()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(DISTINCT uid), 0)::INTEGER
  FROM (
    SELECT v.user_id AS uid
    FROM public.votes v
    WHERE v.created_at >= timezone('utc', now()) - INTERVAL '30 days'
    UNION
    SELECT c.user_id AS uid
    FROM public.comments c
    WHERE c.created_at >= timezone('utc', now()) - INTERVAL '30 days'
      AND c.visibility_status = 'visible'
  ) t;
$$;

-- ── Hall of Fame: 동적 투표 허들 (JS pickle-hall-of-fame.js 와 동일) ──
CREATE OR REPLACE FUNCTION public.pickle_compute_vote_hurdle()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(50, CEIL(public.pickle_count_active_users() * 0.05)::INTEGER);
$$;

-- ── Hall of Fame: 4대 천왕 뱃지 1개 이상 충족 여부 ──
CREATE OR REPLACE FUNCTION public.pickle_post_has_legend_badge(p_post_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_at   TIMESTAMPTZ;
  v_expires_at   TIMESTAMPTZ;
  v_votes_a      INTEGER := 0;
  v_votes_b      INTEGER := 0;
  v_total        INTEGER := 0;
  v_pct_a        INTEGER := 50;
  v_pct_b        INTEGER := 50;
  v_comments     INTEGER := 0;
  v_duration_h   NUMERIC := 0;
BEGIN
  SELECT p.created_at, p.expires_at
  INTO v_created_at, v_expires_at
  FROM public.posts p
  WHERE p.id = p_post_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN v.choice = 'A' THEN 1 ELSE 0 END), 0)::INTEGER,
    COALESCE(SUM(CASE WHEN v.choice = 'B' THEN 1 ELSE 0 END), 0)::INTEGER
  INTO v_votes_a, v_votes_b
  FROM public.votes v
  WHERE v.post_id = p_post_id;

  v_total := v_votes_a + v_votes_b;

  IF v_total > 0 THEN
    v_pct_a := ROUND(v_votes_a * 100.0 / v_total)::INTEGER;
    v_pct_b := 100 - v_pct_a;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_comments
  FROM public.comments c
  WHERE c.post_id = p_post_id
    AND c.visibility_status = 'visible';

  IF v_created_at IS NOT NULL AND v_expires_at IS NOT NULL AND v_expires_at > v_created_at THEN
    v_duration_h := EXTRACT(EPOCH FROM (v_expires_at - v_created_at)) / 3600.0;
  END IF;

  -- ⚔️ 신의 저울
  IF v_pct_a BETWEEN 49 AND 51 THEN
    RETURN TRUE;
  END IF;

  -- 👊 반박불가 팩폭
  IF v_pct_a >= 90 OR v_pct_b >= 90 THEN
    RETURN TRUE;
  END IF;

  -- 📢 방구석 100분 토론
  IF v_total > 0 AND (v_comments::NUMERIC / v_total) >= 0.3 THEN
    RETURN TRUE;
  END IF;

  -- 🚀 도파민 급발진
  IF v_duration_h > 0 AND (v_total::NUMERIC / v_duration_h) >= 10 THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- ── Hall of Fame: 허들 + 뱃지 통과 (전당 후보 등록 조건) ──
CREATE OR REPLACE FUNCTION public.pickle_post_qualifies_for_honor(p_post_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total   INTEGER := 0;
  v_hurdle  INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER
  INTO v_total
  FROM public.votes v
  WHERE v.post_id = p_post_id;

  v_hurdle := public.pickle_compute_vote_hurdle();

  IF v_total < v_hurdle THEN
    RETURN FALSE;
  END IF;

  RETURN public.pickle_post_has_legend_badge(p_post_id);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 1) 댓글 알림 트리거
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_fn_comments_notify_post_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id UUID;
  v_snippet   TEXT;
  v_message   TEXT;
  v_link      TEXT;
BEGIN
  IF NEW.visibility_status IS DISTINCT FROM 'visible' THEN
    RETURN NEW;
  END IF;

  IF NEW.ai_filter_status = 'blocked' THEN
    RETURN NEW;
  END IF;

  SELECT p.author_id
  INTO v_author_id
  FROM public.posts p
  WHERE p.id = NEW.post_id;

  IF v_author_id IS NULL OR v_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  v_snippet := public.pickle_truncate_text(
    COALESCE(NULLIF(trim(NEW.filtered_content), ''), NEW.content),
    40
  );

  v_message := '💬 내 불판에 새로운 댓글이 달렸습니다: ''' || v_snippet || '''';
  v_link := 'detail.html?id=' || NEW.post_id::TEXT;

  PERFORM public.pickle_insert_notification(
    v_author_id,
    'comment',
    v_message,
    v_link
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_notify_post_owner ON public.comments;
CREATE TRIGGER trg_comments_notify_post_owner
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_comments_notify_post_owner();

-- ═══════════════════════════════════════════════════════════════
-- 2) 마감(end) 알림 — 단일 불판 처리
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.pickle_send_end_notifications(p_post_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post        RECORD;
  v_message     TEXT := '⏳ 참여하신 불판이 마감되었습니다! 최종 투표 결과를 지금 확인해 보세요.';
  v_link        TEXT;
  v_recipient   UUID;
BEGIN
  SELECT id, author_id, visibility_status, expires_at, end_notified_at
  INTO v_post
  FROM public.posts
  WHERE id = p_post_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_post.end_notified_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_post.visibility_status IS DISTINCT FROM 'visible' THEN
    UPDATE public.posts SET end_notified_at = timezone('utc', now()) WHERE id = p_post_id;
    RETURN;
  END IF;

  IF v_post.expires_at IS NULL OR v_post.expires_at > timezone('utc', now()) THEN
    RETURN;
  END IF;

  v_link := 'detail.html?id=' || p_post_id::TEXT;

  FOR v_recipient IN
    SELECT DISTINCT uid
    FROM (
      SELECT v_post.author_id AS uid
      UNION
      SELECT v.user_id AS uid
      FROM public.votes v
      WHERE v.post_id = p_post_id
    ) recipients
    WHERE uid IS NOT NULL
  LOOP
    PERFORM public.pickle_insert_notification(
      v_recipient,
      'end',
      v_message,
      v_link
    );
  END LOOP;

  UPDATE public.posts
  SET end_notified_at = timezone('utc', now())
  WHERE id = p_post_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 3) 명예(honor) 알림 — 단일 불판 처리
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.pickle_try_honor_notification(p_post_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post     RECORD;
  v_message  TEXT := '🏅 축하합니다! 당신의 불판이 엄격한 알고리즘을 통과하여 ''전당 후보작''에 등극했습니다!';
  v_link     TEXT := 'hall_of_fame.html';
BEGIN
  SELECT id, author_id, visibility_status, expires_at, honor_notified_at
  INTO v_post
  FROM public.posts
  WHERE id = p_post_id
  FOR UPDATE;

  IF NOT FOUND OR v_post.honor_notified_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_post.visibility_status IS DISTINCT FROM 'visible' THEN
    RETURN;
  END IF;

  IF v_post.expires_at IS NULL OR v_post.expires_at > timezone('utc', now()) THEN
    RETURN;
  END IF;

  IF v_post.author_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.pickle_post_qualifies_for_honor(p_post_id) THEN
    RETURN;
  END IF;

  PERFORM public.pickle_insert_notification(
    v_post.author_id,
    'honor',
    v_message,
    v_link
  );

  UPDATE public.posts
  SET honor_notified_at = timezone('utc', now())
  WHERE id = p_post_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 배치: 마감된 불판 일괄 처리 (pg_cron / 수동 호출)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.pickle_process_due_post_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID;
  v_count   INTEGER := 0;
BEGIN
  FOR v_post_id IN
    SELECT p.id
    FROM public.posts p
    WHERE p.visibility_status = 'visible'
      AND p.expires_at IS NOT NULL
      AND p.expires_at <= timezone('utc', now())
      AND p.end_notified_at IS NULL
    ORDER BY p.expires_at ASC
    LIMIT 200
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.pickle_send_end_notifications(v_post_id);
    PERFORM public.pickle_try_honor_notification(v_post_id);
    v_count := v_count + 1;
  END LOOP;

  -- end 알림은 이미 갔지만 honor만 아직인 불판 (허들/뱃지가 늦게 충족된 경우)
  FOR v_post_id IN
    SELECT p.id
    FROM public.posts p
    WHERE p.visibility_status = 'visible'
      AND p.expires_at IS NOT NULL
      AND p.expires_at <= timezone('utc', now())
      AND p.end_notified_at IS NOT NULL
      AND p.honor_notified_at IS NULL
    ORDER BY p.expires_at ASC
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.pickle_try_honor_notification(v_post_id);
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.pickle_process_due_post_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pickle_process_due_post_notifications() TO service_role;

-- ── pg_cron: 1분마다 마감/명예 알림 처리 ──
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'pg_cron extension 활성화 권한 없음 — Dashboard → Extensions에서 pg_cron 켜기';
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension 스킵: %', SQLERRM;
END $$;

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron 미설치 — 수동: SELECT public.pickle_process_due_post_notifications();';
    RETURN;
  END IF;

  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'pickle-post-expiry-notifications'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'pickle-post-expiry-notifications',
    '* * * * *',
    $cmd$SELECT public.pickle_process_due_post_notifications();$cmd$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron schedule 실패 — 수동 호출 사용: %', SQLERRM;
END $$;
