-- P!CKLE — 관리자 불판 상세 + 댓글 목록 RPC

CREATE OR REPLACE FUNCTION public.admin_get_post(p_post_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT row_to_json(t)
  FROM (
    SELECT
      p.id,
      p.title,
      p.category,
      COALESCE(c.name, p.category) AS category_name,
      COALESCE(c.icon, '') AS category_icon,
      p.option_a_name,
      p.option_b_name,
      p.author_id,
      COALESCE(NULLIF(trim(p.author_nickname), ''), u.nickname, '익명') AS author_nickname,
      p.visibility_status,
      p.created_at,
      p.expires_at,
      COALESCE(p.vote_count, 0) AS vote_count,
      COALESCE(p.comment_count, 0) AS comment_count,
      COALESCE(p.share_count, 0) AS share_count,
      (
        SELECT COUNT(*)::integer
        FROM public.reports r
        WHERE r.target_type = 'post' AND r.target_id = p.id
      ) AS report_count
    FROM public.posts p
    LEFT JOIN public.categories c ON c.slug = p.category
    LEFT JOIN public.users u ON u.id = p.author_id
    WHERE p.id = p_post_id
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_post_comments(p_post_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    json_agg(row_to_json(t) ORDER BY t.created_at DESC),
    '[]'::json
  )
  FROM (
    SELECT
      c.id,
      c.user_id,
      c.post_id,
      c.content,
      c.filtered_content,
      c.visibility_status,
      c.created_at,
      COALESCE(NULLIF(trim(c.author_nickname), ''), u.nickname, '익명') AS author_nickname,
      COALESCE(c.author_avatar_html, u.avatar_html, '') AS author_avatar_html,
      v.choice AS vote_choice,
      (
        SELECT COUNT(*)::integer
        FROM public.reports r
        WHERE r.target_type = 'comment' AND r.target_id = c.id
      ) AS report_count
    FROM public.comments c
    LEFT JOIN public.users u ON u.id = c.user_id
    LEFT JOIN public.votes v ON v.user_id = c.user_id AND v.post_id = c.post_id
    WHERE c.post_id = p_post_id
    ORDER BY c.created_at DESC
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_comment_visibility(p_comment_id uuid, p_status text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_comment_id IS NULL OR p_status IS NULL THEN
    RETURN FALSE;
  END IF;
  IF p_status NOT IN ('visible', 'blinded', 'deleted') THEN
    RETURN FALSE;
  END IF;
  UPDATE public.comments
  SET visibility_status = p_status,
      updated_at = timezone('utc', now())
  WHERE id = p_comment_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_post(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_list_post_comments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_post_comments(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_set_comment_visibility(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_comment_visibility(uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
