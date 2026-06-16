-- P!CKLE — 관리자 회원 상세 모달 통계 (RLS 우회)
-- admin_users.html — 보유 포인트 / 생성 불판 / 참여(댓글+투표) 횟수

CREATE OR REPLACE FUNCTION public.admin_user_stats(p_user_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT json_build_object(
    'points', COALESCE((SELECT u.points FROM public.users u WHERE u.id = p_user_id), 0),
    'post_count', COALESCE((
      SELECT COUNT(*)::integer FROM public.posts p WHERE p.author_id = p_user_id
    ), 0),
    'comment_count', COALESCE((
      SELECT COUNT(*)::integer FROM public.comments c WHERE c.user_id = p_user_id
    ), 0),
    'vote_count', COALESCE((
      SELECT COUNT(*)::integer FROM public.votes v WHERE v.user_id = p_user_id
    ), 0),
    'participation_count', COALESCE((
      SELECT COUNT(*)::integer FROM public.comments c WHERE c.user_id = p_user_id
    ), 0) + COALESCE((
      SELECT COUNT(*)::integer FROM public.votes v WHERE v.user_id = p_user_id
    ), 0)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_user_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_stats(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.admin_user_stats IS '관리자 회원 상세 — 포인트·불판·참여 통계';

NOTIFY pgrst, 'reload schema';
