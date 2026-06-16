-- P!CKLE — 관리자 불판 목록 (posts + users + categories)

CREATE OR REPLACE FUNCTION public.admin_list_posts(p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
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
      p.end_at,
      p.expires_at,
      COALESCE(p.vote_count, 0) AS vote_count,
      COALESCE(p.comment_count, 0) AS comment_count,
      COALESCE(p.share_count, 0) AS share_count
    FROM public.posts p
    LEFT JOIN public.categories c ON c.slug = p.category
    LEFT JOIN public.users u ON u.id = p.author_id
    ORDER BY p.created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 200), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_post_visibility(p_post_id uuid, p_status text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_post_id IS NULL OR p_status IS NULL THEN
    RETURN FALSE;
  END IF;
  IF p_status NOT IN ('visible', 'blinded', 'hidden', 'draft') THEN
    RETURN FALSE;
  END IF;
  UPDATE public.posts
  SET visibility_status = p_status,
      updated_at = timezone('utc', now())
  WHERE id = p_post_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_posts(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_posts(integer, integer) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_set_post_visibility(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_post_visibility(uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
