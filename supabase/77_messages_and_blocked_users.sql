-- =============================================================================
-- P!CKLE — 쪽지(messages) · 유저 차단(blocked_users) · 발송 RPC
-- 선행: public.users, auth.users
-- Supabase Dashboard → SQL Editor → 전체 복사 → [Run]
-- =============================================================================

-- ── 1) messages 테이블 ──

CREATE TABLE IF NOT EXISTS public.messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT messages_not_self CHECK (sender_id <> receiver_id),
  CONSTRAINT messages_content_not_empty CHECK (char_length(trim(content)) > 0),
  CONSTRAINT messages_content_max_len CHECK (char_length(content) <= 2000)
);

COMMENT ON TABLE public.messages IS '유저 간 1:1 쪽지';
COMMENT ON COLUMN public.messages.is_read IS '수신자 읽음 여부 (false = 미읽음 뱃지)';

-- 기존 테이블에 컬럼만 없을 때 보강
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.messages
  ALTER COLUMN is_read SET DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_messages_receiver_created
  ON public.messages (receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender_created
  ON public.messages (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread
  ON public.messages (receiver_id)
  WHERE is_read = FALSE;

-- ── 2) blocked_users 테이블 ──

CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocked_users_not_self CHECK (blocker_id <> blocked_id)
);

COMMENT ON TABLE public.blocked_users IS '쪽지 발송자 차단 — blocker가 blocked를 차단';

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker
  ON public.blocked_users (blocker_id);

-- ── 3) 레벨 계산 (star_score → Lv, pickle-profile.js LEVEL_TIERS와 동일) ──

CREATE OR REPLACE FUNCTION public.pickle_user_level(p_star_score DOUBLE PRECISION)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN GREATEST(0, FLOOR(COALESCE(p_star_score, 0))::INTEGER) >= 1000 THEN 5
    WHEN GREATEST(0, FLOOR(COALESCE(p_star_score, 0))::INTEGER) >= 600  THEN 4
    WHEN GREATEST(0, FLOOR(COALESCE(p_star_score, 0))::INTEGER) >= 300  THEN 3
    WHEN GREATEST(0, FLOOR(COALESCE(p_star_score, 0))::INTEGER) >= 100  THEN 2
    ELSE 1
  END;
$$;

-- ── 4) 쪽지 발송 RPC (레벨·일일·쿨타임·도배·차단 검증) ──

CREATE OR REPLACE FUNCTION public.send_pickle_message(
  p_receiver_id UUID,
  p_content     TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id    UUID := auth.uid();
  v_content      TEXT := trim(p_content);
  v_star_score   DOUBLE PRECISION;
  v_level        INTEGER;
  v_today_count  INTEGER;
  v_last_sent_at TIMESTAMPTZ;
  v_last_content TEXT;
  v_now          TIMESTAMPTZ := timezone('utc', now());
BEGIN
  IF v_sender_id IS NULL THEN
    RETURN json_build_object('ok', false, 'code', 'auth_required');
  END IF;

  IF p_receiver_id IS NULL OR v_sender_id = p_receiver_id THEN
    RETURN json_build_object('ok', false, 'code', 'invalid_receiver');
  END IF;

  IF v_content IS NULL OR char_length(v_content) = 0 THEN
    RETURN json_build_object('ok', false, 'code', 'empty_content');
  END IF;

  IF char_length(v_content) > 2000 THEN
    RETURN json_build_object('ok', false, 'code', 'content_too_long');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_receiver_id) THEN
    RETURN json_build_object('ok', false, 'code', 'receiver_not_found');
  END IF;

  -- 수신자가 발송자를 차단한 경우
  IF EXISTS (
    SELECT 1
    FROM public.blocked_users
    WHERE blocker_id = p_receiver_id
      AND blocked_id = v_sender_id
  ) THEN
    RETURN json_build_object('ok', false, 'code', 'blocked_by_receiver');
  END IF;

  SELECT u.star_score
  INTO v_star_score
  FROM public.users u
  WHERE u.id = v_sender_id;

  v_level := public.pickle_user_level(v_star_score);
  IF v_level < 2 THEN
    RETURN json_build_object('ok', false, 'code', 'level_too_low', 'level', v_level);
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_today_count
  FROM public.messages m
  WHERE m.sender_id = v_sender_id
    AND m.created_at >= date_trunc('day', v_now);

  IF v_today_count >= 5 THEN
    RETURN json_build_object('ok', false, 'code', 'daily_limit', 'count', v_today_count);
  END IF;

  SELECT m.created_at, m.content
  INTO v_last_sent_at, v_last_content
  FROM public.messages m
  WHERE m.sender_id = v_sender_id
  ORDER BY m.created_at DESC
  LIMIT 1;

  IF v_last_sent_at IS NOT NULL AND v_last_sent_at > (v_now - INTERVAL '60 seconds') THEN
    RETURN json_build_object('ok', false, 'code', 'cooldown');
  END IF;

  IF v_last_content IS NOT NULL AND v_last_content = v_content THEN
    RETURN json_build_object('ok', false, 'code', 'duplicate_content');
  END IF;

  INSERT INTO public.messages (sender_id, receiver_id, content, is_read)
  VALUES (v_sender_id, p_receiver_id, v_content, FALSE);

  RETURN json_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.send_pickle_message(UUID, TEXT) IS
  '쪽지 발송 — Lv.2+, 일 5회, 60초 쿨타임, 연속 동일내용·차단 검증';

REVOKE ALL ON FUNCTION public.send_pickle_message(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_pickle_message(UUID, TEXT) TO authenticated;

-- ── 5) RLS: messages ──

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_select_receiver ON public.messages;
CREATE POLICY messages_select_receiver
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    receiver_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1
      FROM public.blocked_users b
      WHERE b.blocker_id = auth.uid()
        AND b.blocked_id = messages.sender_id
    )
  );

DROP POLICY IF EXISTS messages_select_sender ON public.messages;
CREATE POLICY messages_select_sender
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid());

DROP POLICY IF EXISTS messages_update_receiver_read ON public.messages;
CREATE POLICY messages_update_receiver_read
  ON public.messages
  FOR UPDATE
  TO authenticated
  USING (receiver_id = auth.uid())
  WITH CHECK (receiver_id = auth.uid());

-- INSERT는 send_pickle_message RPC(Security Definer)만 사용

-- ── 6) RLS: blocked_users ──

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blocked_users_select_own ON public.blocked_users;
CREATE POLICY blocked_users_select_own
  ON public.blocked_users
  FOR SELECT
  TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS blocked_users_insert_own ON public.blocked_users;
CREATE POLICY blocked_users_insert_own
  ON public.blocked_users
  FOR INSERT
  TO authenticated
  WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS blocked_users_delete_own ON public.blocked_users;
CREATE POLICY blocked_users_delete_own
  ON public.blocked_users
  FOR DELETE
  TO authenticated
  USING (blocker_id = auth.uid());

-- ── 7) 권한 ──

GRANT SELECT, UPDATE ON public.messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;
