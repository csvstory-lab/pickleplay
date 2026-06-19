-- =============================================================================
-- P!CKLE — 이벤트 반자동 추첨 (유령·벌점 필터) + 당첨 확정 푸시
-- 선행: 33_events.sql, 24_notification_triggers.sql (pickle_insert_notification)
-- =============================================================================

-- ── 이벤트 응모(참여) 내역 ──
CREATE TABLE IF NOT EXISTS public.event_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT event_entries_unique UNIQUE (event_id, user_id)
);

COMMENT ON TABLE public.event_entries IS '이벤트 응모(참여) — 추첨 대상 풀';
CREATE INDEX IF NOT EXISTS idx_event_entries_event_id ON public.event_entries (event_id);
CREATE INDEX IF NOT EXISTS idx_event_entries_user_id ON public.event_entries (user_id);

-- ── events 추첨 상태 컬럼 ──
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS draw_status TEXT NOT NULL DEFAULT 'none'
    CHECK (draw_status IN ('none', 'candidates_ready', 'finalized'));

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS draw_candidates JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS draw_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.events.draw_status IS 'none | candidates_ready(추첨 완료·확정 대기) | finalized';
COMMENT ON COLUMN public.events.draw_candidates IS '반자동 추첨 임시 당첨자 (최종 확정 전)';
COMMENT ON COLUMN public.events.draw_meta IS '추첨 통계 (eligible, excluded_ghost, excluded_penalty 등)';

-- ── UID 마스킹 ──
CREATE OR REPLACE FUNCTION public.pickle_mask_user_uid(p_uid UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(replace(p_uid::text, '-', ''), 2) || '***';
$$;

-- ── 추첨 자격 (유령·벌점·정지 필터) ──
CREATE OR REPLACE FUNCTION public.pickle_event_entry_is_eligible(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND u.account_status = 'active'
      AND COALESCE(u.is_banned, false) = false
      AND u.signup_platform NOT IN ('guest', 'unknown')
      AND u.penalty_points < 30
      AND (u.restricted_until IS NULL OR u.restricted_until <= timezone('utc', now()))
  );
$$;

COMMENT ON FUNCTION public.pickle_event_entry_is_eligible(UUID) IS
  '이벤트 추첨 자격: 정상·비유령(guest/unknown 제외)·벌점 30미만·정지 해제';

-- ── 반자동 추첨 (임시 당첨자 저장) ──
CREATE OR REPLACE FUNCTION public.pickle_draw_event_winners(
  p_event_id UUID,
  p_save_candidates BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event        RECORD;
  v_prize        JSONB;
  v_prizes       JSONB;
  v_pool         UUID[];
  v_candidates   JSONB := '[]'::jsonb;
  v_used         UUID[] := '{}';
  v_rank         TEXT;
  v_name         TEXT;
  v_count        INT;
  v_i            INT;
  v_uid          UUID;
  v_idx          INT;
  v_pool_len     INT;
  v_nickname     TEXT;
  v_total_drawn  INT := 0;
  v_eligible     INT := 0;
  v_excl_ghost   INT := 0;
  v_excl_penalty INT := 0;
  v_excl_other   INT := 0;
  v_entry        RECORD;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_id_required');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_found');
  END IF;

  IF v_event.draw_status = 'finalized' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_finalized');
  END IF;

  v_prizes := COALESCE(v_event.prizes, '[]'::jsonb);
  IF jsonb_array_length(v_prizes) = 0 THEN
  -- 단일 티어: prizes 비어 있으면 winner_box_title 또는 1건 기본
    v_prizes := jsonb_build_array(
      jsonb_build_object('name', COALESCE(v_event.winner_box_title, '경품'), 'count', 1, 'rank', '1')
    );
  END IF;

  -- 통계 집계
  FOR v_entry IN
    SELECT ee.user_id, u.signup_platform, u.penalty_points, u.account_status,
           COALESCE(u.is_banned, false) AS is_banned, u.restricted_until
    FROM public.event_entries ee
    JOIN public.users u ON u.id = ee.user_id
    WHERE ee.event_id = p_event_id
  LOOP
    IF public.pickle_event_entry_is_eligible(v_entry.user_id) THEN
      v_eligible := v_eligible + 1;
    ELSIF v_entry.signup_platform IN ('guest', 'unknown') THEN
      v_excl_ghost := v_excl_ghost + 1;
    ELSIF v_entry.penalty_points >= 30
       OR v_entry.is_banned
       OR v_entry.account_status <> 'active'
       OR (v_entry.restricted_until IS NOT NULL AND v_entry.restricted_until > timezone('utc', now()))
    THEN
      v_excl_penalty := v_excl_penalty + 1;
    ELSE
      v_excl_other := v_excl_other + 1;
    END IF;
  END LOOP;

  -- 추첨 풀 (자격 충족자, 무작위)
  SELECT array_agg(sub.user_id ORDER BY random())
  INTO v_pool
  FROM (
    SELECT ee.user_id
    FROM public.event_entries ee
    WHERE ee.event_id = p_event_id
      AND public.pickle_event_entry_is_eligible(ee.user_id)
  ) sub;

  v_pool := COALESCE(v_pool, ARRAY[]::UUID[]);

  -- 등수별 추첨 (중복 당첨 없음)
  FOR v_prize IN SELECT * FROM jsonb_array_elements(v_prizes)
  LOOP
    v_rank := COALESCE(NULLIF(trim(v_prize->>'rank'), ''), NULLIF(trim(v_prize->>'name'), ''), '당첨');
    v_name := COALESCE(NULLIF(trim(v_prize->>'name'), ''), '경품');
    v_count := GREATEST(COALESCE((v_prize->>'count')::INT, 0), 0);
    v_i := 0;

    WHILE v_i < v_count LOOP
      v_pool_len := COALESCE(array_length(v_pool, 1), 0);
      EXIT WHEN v_pool_len = 0;

      v_idx := 1 + floor(random() * v_pool_len)::INT;
      v_uid := v_pool[v_idx];
      v_pool := v_pool[1:v_idx - 1] || v_pool[v_idx + 1:v_pool_len];

      IF v_uid = ANY(v_used) THEN
        CONTINUE;
      END IF;

      SELECT nickname INTO v_nickname FROM public.users WHERE id = v_uid;

      v_candidates := v_candidates || jsonb_build_array(
        jsonb_build_object(
          'uid', v_uid,
          'nickname', COALESCE(v_nickname, '픽클러'),
          'uid_mask', public.pickle_mask_user_uid(v_uid),
          'rank', v_rank,
          'prize_name', v_name
        )
      );
      v_used := array_append(v_used, v_uid);
      v_total_drawn := v_total_drawn + 1;
      v_i := v_i + 1;
    END LOOP;
  END LOOP;

  IF p_save_candidates THEN
    UPDATE public.events
    SET draw_candidates = v_candidates,
        draw_status = CASE WHEN v_total_drawn > 0 THEN 'candidates_ready' ELSE draw_status END,
        draw_meta = jsonb_build_object(
          'eligible_count', v_eligible,
          'excluded_ghost', v_excl_ghost,
          'excluded_penalty', v_excl_penalty,
          'excluded_other', v_excl_other,
          'drawn_at', timezone('utc', now())
        ),
        updated_at = timezone('utc', now())
    WHERE id = p_event_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'event_id', p_event_id,
    'eligible_count', v_eligible,
    'excluded_ghost', v_excl_ghost,
    'excluded_penalty', v_excl_penalty,
    'excluded_other', v_excl_other,
    'total_drawn', v_total_drawn,
    'candidates', v_candidates,
    'saved', p_save_candidates
  );
END;
$$;

-- ── 최종 확정 + 당첨자 푸시 알림 ──
CREATE OR REPLACE FUNCTION public.pickle_finalize_event_winners(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event     RECORD;
  v_winner    JSONB;
  v_winners   JSONB := '[]'::jsonb;
  v_uid       UUID;
  v_msg       TEXT;
  v_link      TEXT;
  v_notified  INT := 0;
  v_form_url  TEXT;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_id_required');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_found');
  END IF;

  IF v_event.draw_status = 'finalized' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_finalized');
  END IF;

  IF jsonb_array_length(COALESCE(v_event.draw_candidates, '[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_candidates');
  END IF;

  v_form_url := NULLIF(trim(COALESCE(v_event.google_form_url, '')), '');
  v_link := '/user_app/event.html?id=' || p_event_id::text;

  FOR v_winner IN SELECT * FROM jsonb_array_elements(v_event.draw_candidates)
  LOOP
    v_uid := (v_winner->>'uid')::UUID;
    IF v_uid IS NULL THEN
      CONTINUE;
    END IF;

    v_winners := v_winners || jsonb_build_array(
      jsonb_build_object(
        'uid', v_uid,
        'nickname', COALESCE(v_winner->>'nickname', '픽클러'),
        'uid_mask', COALESCE(v_winner->>'uid_mask', public.pickle_mask_user_uid(v_uid)),
        'rank', COALESCE(v_winner->>'rank', '당첨')
      )
    );

    v_msg := '🎉 축하합니다! [' || v_event.title || '] 이벤트에 당첨되셨습니다.';
    IF v_form_url IS NOT NULL THEN
      v_msg := v_msg || E'\n경품 수령을 위해 구글 폼에 7일 이내 정보를 입력해 주세요. (보관함 미노출·기한 미입력 시 자동 취소)';
    END IF;

    PERFORM public.pickle_insert_notification(v_uid, 'system', v_msg, v_link);
    v_notified := v_notified + 1;
  END LOOP;

  UPDATE public.events
  SET winners = v_winners,
      draw_status = 'finalized',
      status = 'ended',
      draw_meta = COALESCE(draw_meta, '{}'::jsonb) || jsonb_build_object(
        'finalized_at', timezone('utc', now()),
        'notified_count', v_notified
      ),
      updated_at = timezone('utc', now())
  WHERE id = p_event_id;

  RETURN jsonb_build_object(
    'ok', true,
    'event_id', p_event_id,
    'winner_count', jsonb_array_length(v_winners),
    'notified_count', v_notified
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pickle_draw_event_winners(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pickle_finalize_event_winners(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pickle_draw_event_winners(UUID, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pickle_finalize_event_winners(UUID) TO anon, authenticated;

-- ── RLS: event_entries ──
ALTER TABLE public.event_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_entries_select_own ON public.event_entries;
CREATE POLICY event_entries_select_own
  ON public.event_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS event_entries_insert_own ON public.event_entries;
CREATE POLICY event_entries_insert_own
  ON public.event_entries FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS event_entries_select_admin ON public.event_entries;
CREATE POLICY event_entries_select_admin
  ON public.event_entries FOR SELECT TO anon, authenticated
  USING (true);

-- ── RLS: events 관리자 쓰기 ──
DROP POLICY IF EXISTS events_insert_admin ON public.events;
CREATE POLICY events_insert_admin
  ON public.events FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS events_update_admin ON public.events;
CREATE POLICY events_update_admin
  ON public.events FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS events_delete_admin ON public.events;
CREATE POLICY events_delete_admin
  ON public.events FOR DELETE TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS events_select_admin ON public.events;
CREATE POLICY events_select_admin
  ON public.events FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_entries TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
