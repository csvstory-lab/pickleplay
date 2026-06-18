-- P!CKLE 클린 시스템 2단계: penalty_logs (제재 이력 + 마이페이지 알림)
-- Supabase SQL Editor에서 실행 (이미 수동 생성된 경우 IF NOT EXISTS 로 안전 적용)

CREATE TABLE IF NOT EXISTS public.penalty_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  comment_id    UUID REFERENCES public.comments(id) ON DELETE SET NULL,
  penalty_type  TEXT NOT NULL,
  points_added  INTEGER NOT NULL DEFAULT 0 CHECK (points_added >= 0),
  reason        TEXT,
  is_read       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_penalty_logs_user_created
  ON public.penalty_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_penalty_logs_user_unread
  ON public.penalty_logs (user_id)
  WHERE is_read = false;

COMMENT ON TABLE public.penalty_logs IS '유저 제재 이력 (마이페이지 알림·히스토리)';

ALTER TABLE public.penalty_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS penalty_logs_select_own ON public.penalty_logs;
CREATE POLICY penalty_logs_select_own
  ON public.penalty_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS penalty_logs_update_own_read ON public.penalty_logs;
CREATE POLICY penalty_logs_update_own_read
  ON public.penalty_logs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- admin_web anon 키 INSERT (기존 admin 정책 패턴과 동일)
DROP POLICY IF EXISTS penalty_logs_insert_admin ON public.penalty_logs;
CREATE POLICY penalty_logs_insert_admin
  ON public.penalty_logs FOR INSERT TO anon, authenticated
  WITH CHECK (true);
