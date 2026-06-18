-- P!CKLE — 권리침해 / 게시중단 요청 (마이페이지 → 관리자 법무 탭)

CREATE TABLE IF NOT EXISTS public.right_infringements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reporter_name         TEXT,
  reporter_phone        TEXT,
  reporter_email        TEXT,
  requester_type        TEXT NOT NULL
    CHECK (requester_type IN ('me', 'agency')),
  target_url            TEXT NOT NULL,
  reason                TEXT NOT NULL
    CHECK (reason IN ('defamation', 'copyright', 'privacy')),
  detail                TEXT NOT NULL,
  id_file_url           TEXT,
  power_of_attorney_url TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'incomplete', 'temporary', 'resolved')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_right_infringements_status_created
  ON public.right_infringements (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_right_infringements_user_created
  ON public.right_infringements (user_id, created_at DESC);

COMMENT ON TABLE public.right_infringements IS '권리침해 게시중단 요청 (마이페이지 법무 신고센터)';

-- 이전 스키마(id_document_url) → id_file_url 정렬 (이미 id_file_url 이면 무시)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'right_infringements'
      AND column_name = 'id_document_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'right_infringements'
      AND column_name = 'id_file_url'
  ) THEN
    ALTER TABLE public.right_infringements
      RENAME COLUMN id_document_url TO id_file_url;
  END IF;
END $$;

ALTER TABLE public.right_infringements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS right_infringements_select_admin ON public.right_infringements;
CREATE POLICY right_infringements_select_admin
  ON public.right_infringements FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS right_infringements_insert_own ON public.right_infringements;
CREATE POLICY right_infringements_insert_own
  ON public.right_infringements FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS right_infringements_select_own ON public.right_infringements;
CREATE POLICY right_infringements_select_own
  ON public.right_infringements FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
