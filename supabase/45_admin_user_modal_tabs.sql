-- P!CKLE — 회원 상세 모달 탭 (제재·활동·포인트) 테이블 + Admin RPC

CREATE TABLE IF NOT EXISTS public.user_penalties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL,
  penalty_points  INTEGER NOT NULL DEFAULT 0 CHECK (penalty_points >= 0),
  source_type     TEXT NOT NULL DEFAULT 'admin'
    CHECK (source_type IN ('admin', 'report', 'ai', 'system')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reported_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_type      TEXT NOT NULL DEFAULT 'comment'
    CHECK (target_type IN ('post', 'comment', 'user')),
  target_id        UUID,
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'sanctioned', 'dismissed')),
  penalty_points   INTEGER NOT NULL DEFAULT 0 CHECK (penalty_points >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.point_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL,
  reason        TEXT NOT NULL,
  balance_after INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_user_penalties_user_created
  ON public.user_penalties (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user_created
  ON public.reports (reported_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_point_logs_user_created
  ON public.point_logs (user_id, created_at DESC);

ALTER TABLE public.user_penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_penalties_select_admin ON public.user_penalties;
CREATE POLICY user_penalties_select_admin
  ON public.user_penalties FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS reports_select_admin ON public.reports;
CREATE POLICY reports_select_admin
  ON public.reports FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS point_logs_select_admin ON public.point_logs;
CREATE POLICY point_logs_select_admin
  ON public.point_logs FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.admin_user_modal_tab(p_user_id uuid, p_tab text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result json;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN '[]'::json;
  END IF;

  IF p_tab = 'sanctions' THEN
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
    INTO result
    FROM (
      SELECT * FROM (
        SELECT
          'penalty'::text AS kind,
          up.id,
          up.reason,
          up.penalty_points,
          up.source_type,
          NULL::text AS status,
          up.created_at
        FROM public.user_penalties up
        WHERE up.user_id = p_user_id
        UNION ALL
        SELECT
          'report'::text AS kind,
          r.id,
          r.reason,
          r.penalty_points,
          r.target_type AS source_type,
          r.status,
          r.created_at
        FROM public.reports r
        WHERE r.reported_user_id = p_user_id
      ) merged
      ORDER BY merged.created_at DESC
      LIMIT 50
    ) t;
    RETURN result;
  END IF;

  IF p_tab = 'activity' THEN
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
    INTO result
    FROM (
      SELECT * FROM (
        SELECT
          'post'::text AS kind,
          p.id,
          COALESCE(
            NULLIF(trim(p.title), ''),
            trim(p.option_a_name) || ' vs ' || trim(p.option_b_name)
          ) AS title,
          NULL::text AS content,
          p.created_at
        FROM public.posts p
        WHERE p.author_id = p_user_id
        UNION ALL
        SELECT
          'comment'::text AS kind,
          c.id,
          NULL::text AS title,
          COALESCE(NULLIF(trim(c.filtered_content), ''), trim(c.content)) AS content,
          c.created_at
        FROM public.comments c
        WHERE c.user_id = p_user_id
      ) merged
      ORDER BY merged.created_at DESC
      LIMIT 50
    ) t;
    RETURN result;
  END IF;

  IF p_tab = 'points' THEN
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
    INTO result
    FROM (
      SELECT pl.id, pl.amount, pl.reason, pl.balance_after, pl.created_at
      FROM public.point_logs pl
      WHERE pl.user_id = p_user_id
      ORDER BY pl.created_at DESC
      LIMIT 50
    ) t;
    RETURN result;
  END IF;

  RETURN '[]'::json;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_modal_tab(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_modal_tab(uuid, text) TO anon, authenticated;

COMMENT ON TABLE public.user_penalties IS '회원 제재·벌점 부과 이력';
COMMENT ON TABLE public.reports IS '신고 접수 이력 (피신고자 기준)';
COMMENT ON TABLE public.point_logs IS '포인트 획득/차감 내역';

NOTIFY pgrst, 'reload schema';
