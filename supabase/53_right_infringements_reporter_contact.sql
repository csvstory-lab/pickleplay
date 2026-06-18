-- P!CKLE — 권리침해 신고: 신고자 연락처 컬럼 추가 (이름·연락처·이메일)

ALTER TABLE public.right_infringements
  ADD COLUMN IF NOT EXISTS reporter_name TEXT;

ALTER TABLE public.right_infringements
  ADD COLUMN IF NOT EXISTS reporter_phone TEXT;

ALTER TABLE public.right_infringements
  ADD COLUMN IF NOT EXISTS reporter_email TEXT;

COMMENT ON COLUMN public.right_infringements.reporter_name IS '신고자 실명 (법적 통보용)';
COMMENT ON COLUMN public.right_infringements.reporter_phone IS '신고자 연락처 (법적 통보용)';
COMMENT ON COLUMN public.right_infringements.reporter_email IS '신고자 이메일 (법적 통보용)';

NOTIFY pgrst, 'reload schema';
