-- P!CKLE — 관리자 RBAC (admin_settings · user_roles)

CREATE TABLE IF NOT EXISTS public.user_roles (
  email         TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL DEFAULT '',
  department    TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL
    CHECK (role IN ('super', 'marketer', 'cs', 'account', 'advertiser')),
  status        TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspend')),
  is_protected  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT user_roles_email_not_empty CHECK (char_length(trim(email)) > 0)
);

COMMENT ON TABLE public.user_roles IS '관리자/파트너 RBAC (admin_settings 탭 연동)';
COMMENT ON COLUMN public.user_roles.is_protected IS 'true면 권한 회수(삭제) 불가 — 최고 관리자 등';

CREATE OR REPLACE FUNCTION public.set_user_roles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_updated_at ON public.user_roles;
CREATE TRIGGER trg_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_roles_updated_at();

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_roles_select_all ON public.user_roles;
DROP POLICY IF EXISTS user_roles_insert ON public.user_roles;
DROP POLICY IF EXISTS user_roles_update ON public.user_roles;
DROP POLICY IF EXISTS user_roles_delete ON public.user_roles;

CREATE POLICY user_roles_select_all
  ON public.user_roles FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY user_roles_insert
  ON public.user_roles FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY user_roles_update
  ON public.user_roles FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY user_roles_delete
  ON public.user_roles FOR DELETE TO anon, authenticated
  USING (COALESCE(is_protected, false) = false);

INSERT INTO public.user_roles (email, display_name, department, role, status, is_protected) VALUES
  ('ceo@pickle.com',     '대표이사',        '경영진',       'super',      'active', TRUE),
  ('mkt_kim@pickle.com', '김마켓 과장',     '마케팅팀',     'marketer',   'active', FALSE),
  ('cs_park@pickle.com', '박씨에스 대리',   '운영(CS)팀',   'cs',         'active', FALSE),
  ('tax_choi@pickle.com','최재무 팀장',     '재무회계팀',   'account',    'active', FALSE),
  ('bbq_ad@bbq.co.kr',   '[스폰서] BBQ치킨','외부 제휴사',  'advertiser', 'active', FALSE)
ON CONFLICT (email) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  department = EXCLUDED.department,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  is_protected = EXCLUDED.is_protected,
  updated_at = timezone('utc', now());
