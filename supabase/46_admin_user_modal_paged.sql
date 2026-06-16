-- P!CKLE — 회원 상세 모달 5탭 페이징 (Admin RPC)

CREATE OR REPLACE FUNCTION public.admin_user_tab_counts(p_user_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT json_build_object(
    'posts', COALESCE((SELECT COUNT(*)::integer FROM public.posts p WHERE p.author_id = p_user_id), 0),
    'votes', COALESCE((SELECT COUNT(*)::integer FROM public.votes v WHERE v.user_id = p_user_id), 0),
    'comments', COALESCE((SELECT COUNT(*)::integer FROM public.comments c WHERE c.user_id = p_user_id), 0),
    'points_balance', COALESCE((SELECT u.points FROM public.users u WHERE u.id = p_user_id), 0),
    'point_logs', COALESCE((SELECT COUNT(*)::integer FROM public.point_logs pl WHERE pl.user_id = p_user_id), 0),
    'sanctions', COALESCE((
      SELECT COUNT(*)::integer FROM (
        SELECT up.id FROM public.user_penalties up WHERE up.user_id = p_user_id
        UNION ALL
        SELECT r.id FROM public.reports r WHERE r.reported_user_id = p_user_id
      ) s
    ), 0)
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_user_modal_tab_page(
  p_user_id uuid,
  p_tab text,
  p_offset integer,
  p_limit integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_total integer := 0;
  v_items json := '[]'::json;
  v_off integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_lim integer := GREATEST(COALESCE(p_limit, 10), 1);
BEGIN
  IF p_user_id IS NULL THEN
    RETURN json_build_object('total', 0, 'items', '[]'::json);
  END IF;

  IF p_tab = 'posts' THEN
    SELECT COUNT(*)::integer INTO v_total FROM public.posts p WHERE p.author_id = p_user_id;
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
    INTO v_items
    FROM (
      SELECT
        p.id,
        COALESCE(NULLIF(trim(p.title), ''), trim(p.option_a_name) || ' vs ' || trim(p.option_b_name)) AS title,
        p.category,
        p.category AS category_slug,
        p.visibility_status,
        p.created_at
      FROM public.posts p
      WHERE p.author_id = p_user_id
      ORDER BY p.created_at DESC
      LIMIT v_lim OFFSET v_off
    ) t;
    RETURN json_build_object('total', v_total, 'items', v_items);
  END IF;

  IF p_tab = 'votes' THEN
    SELECT COUNT(*)::integer INTO v_total FROM public.votes v WHERE v.user_id = p_user_id;
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
    INTO v_items
    FROM (
      SELECT
        v.id,
        v.choice,
        v.post_id,
        v.created_at,
        p.category,
        p.category AS category_slug,
        p.option_a_name,
        p.option_b_name,
        COALESCE(
          NULLIF(trim(p.title), ''),
          trim(p.option_a_name) || ' vs ' || trim(p.option_b_name),
          '불판 #' || LEFT(v.post_id::text, 8)
        ) AS post_title
      FROM public.votes v
      LEFT JOIN public.posts p ON p.id = v.post_id
      WHERE v.user_id = p_user_id
      ORDER BY v.created_at DESC
      LIMIT v_lim OFFSET v_off
    ) t;
    RETURN json_build_object('total', v_total, 'items', v_items);
  END IF;

  IF p_tab = 'comments' THEN
    SELECT COUNT(*)::integer INTO v_total FROM public.comments c WHERE c.user_id = p_user_id;
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
    INTO v_items
    FROM (
      SELECT
        c.id,
        COALESCE(NULLIF(trim(c.filtered_content), ''), trim(c.content)) AS content,
        c.post_id,
        c.created_at,
        p.category,
        p.category AS category_slug,
        COALESCE(NULLIF(trim(p.title), ''), '불판 #' || LEFT(c.post_id::text, 8)) AS post_title
      FROM public.comments c
      LEFT JOIN public.posts p ON p.id = c.post_id
      WHERE c.user_id = p_user_id
      ORDER BY c.created_at DESC
      LIMIT v_lim OFFSET v_off
    ) t;
    RETURN json_build_object('total', v_total, 'items', v_items);
  END IF;

  IF p_tab = 'points' THEN
    SELECT COUNT(*)::integer INTO v_total FROM public.point_logs pl WHERE pl.user_id = p_user_id;
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
    INTO v_items
    FROM (
      SELECT pl.id, pl.amount, pl.reason, pl.balance_after, pl.created_at
      FROM public.point_logs pl
      WHERE pl.user_id = p_user_id
      ORDER BY pl.created_at DESC
      LIMIT v_lim OFFSET v_off
    ) t;
    RETURN json_build_object('total', v_total, 'items', v_items);
  END IF;

  IF p_tab = 'sanctions' THEN
    SELECT COUNT(*)::integer INTO v_total
    FROM (
      SELECT up.id FROM public.user_penalties up WHERE up.user_id = p_user_id
      UNION ALL
      SELECT r.id FROM public.reports r WHERE r.reported_user_id = p_user_id
    ) s;

    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
    INTO v_items
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
      LIMIT v_lim OFFSET v_off
    ) t;
    RETURN json_build_object('total', v_total, 'items', v_items);
  END IF;

  RETURN json_build_object('total', 0, 'items', '[]'::json);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_tab_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_tab_counts(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_user_modal_tab_page(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_modal_tab_page(uuid, text, integer, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
