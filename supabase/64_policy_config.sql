-- =============================================================================
-- P!CKLE — system_settings.policy_config (약관/정책 singleton)
-- Supabase SQL Editor → 전체 복사 → Run
-- =============================================================================

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS policy_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.system_settings.policy_config IS
  '약관·정책 JSON: terms_of_service, privacy_policy (content, version, published_at)';

UPDATE public.system_settings
SET policy_config = COALESCE(policy_config, '{}'::jsonb) || '{
  "terms_of_service": {
    "content": "제 1 조 (목적)\n본 약관은 P!CKLE 서비스 이용 조건 및 절차를 규정합니다.\n\n제 8 조 (게시물의 관리 및 법적 책임)\n1. 회원이 서비스 내에 게시한 게시물의 법적 책임은 게시한 회원 본인에게 있습니다.\n2. 회사는 사용자의 게시물에 대해 사전 검열 의무를 지지 않습니다.\n\n제 9 조 (권리침해에 대한 면책 및 게시중단 임시조치)\n1. 타인의 권리(명예훼손, 저작권, 초상권 등)를 침해하는 게시물로 피해를 입은 자는 관련 법령(정보통신망법 등)에 따라 고객센터를 통해 해당 게시물의 게시중단을 요청할 수 있습니다.\n2. 회사는 적법한 권리자의 요청(신분증, 위임장, 소명자료 등)이 접수될 경우, 법령에 따라 지체 없이 30일간 해당 게시물을 임시조치(블라인드) 처리합니다.",
    "version": "v1.2.0",
    "published_at": "2026-05-18T00:00:00+00:00"
  },
  "privacy_policy": {
    "content": "개인정보 처리방침\n\n1. 수집하는 개인정보의 항목\n- 필수항목: 소셜 연동 식별값, 닉네임, 이메일 주소\n\n2. 개인정보의 수집 및 이용 목적\n- 서비스 제공에 관한 계약 이행 및 맞춤형 콘텐츠 제공\n\n3. 개인정보의 파기\n- 회원은 언제든지 회원 탈퇴를 요청할 수 있으며, 탈퇴 시 수집된 식별 데이터는 복구 불가능한 방법으로 즉시 영구 파기됩니다.",
    "version": "v1.1.0",
    "published_at": "2026-05-18T00:00:00+00:00"
  }
}'::jsonb
WHERE id = 1
  AND (
    policy_config IS NULL
    OR policy_config = '{}'::jsonb
    OR NOT (policy_config ? 'terms_of_service')
    OR NOT (policy_config ? 'privacy_policy')
  );

NOTIFY pgrst, 'reload schema';
