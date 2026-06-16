-- P!CKLE — 관리자 카테고리 목록 + 불판 목록 카테고리 필터

CREATE OR REPLACE FUNCTION public.admin_list_categories()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    json_agg(row_to_json(t) ORDER BY t.sort_order ASC),
    '[]'::json
  )
  FROM (
    SELECT slug, name, icon, sort_order, is_active
    FROM public.categories
    ORDER BY sort_order ASC
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_posts(
  p_limit    integer DEFAULT 200,
  p_offset   integer DEFAULT 0,
  p_category text    DEFAULT NULL
)
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
      p.category AS category_slug,
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
      COALESCE(p.share_count, 0) AS share_count
    FROM public.posts p
    LEFT JOIN public.categories c ON c.slug = p.category
    LEFT JOIN public.users u ON u.id = p.author_id
    WHERE p_category IS NULL OR trim(p_category) = '' OR p.category = trim(p_category)
    ORDER BY p.created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 200), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  ) t;
$$;

REVOKE ALL ON FUNCTION public.admin_list_categories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_categories() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_list_posts(integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_posts(integer, integer, text) TO anon, authenticated;

-- 이전 2-인자 시그니처 유지 (PostgREST 오버로드)
REVOKE ALL ON FUNCTION public.admin_list_posts(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_posts(integer, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
