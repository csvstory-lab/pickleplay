-- =============================================================================
-- P!CKLE — 긴급: 최고관리자(super) 로그인 복구 (SQL Editor → Run)
-- ※ 아래 2줄만 본인 값으로 바꾼 뒤 전체 실행
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_email    text := 'YOUR_SUPER_EMAIL@example.com';  -- ← 본인 super 이메일
  v_password text := 'TempSuper2026!Pickle';        -- ← 새 임시 비밀번호 (8자+)
  v_user_id  uuid;
  v_exists   boolean;
BEGIN
  v_email := lower(trim(v_email));

  IF v_email = '' OR v_email NOT LIKE '%@%' THEN
    RAISE EXCEPTION 'v_email 을 실제 super 이메일로 바꿔 주세요.';
  END IF;
  IF char_length(v_password) < 8 THEN
    RAISE EXCEPTION 'v_password 는 8자 이상이어야 합니다.';
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(trim(email)) = v_email
  LIMIT 1;

  v_exists := v_user_id IS NOT NULL;

  -- ── A) auth.users 없음 → 트리거 잠시 OFF 후 INSERT (handle_new_user 충돌 회피) ──
  IF NOT v_exists THEN
    v_user_id := gen_random_uuid();

    ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      timezone('utc', now()),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('display_name', '최고관리자', 'signup_platform', 'email'),
      timezone('utc', now()),
      timezone('utc', now()),
      '', '', '', ''
    );

    ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;

    -- 트리거 OFF 상태에서 INSERT 했으므로 public.users 수동 동기화
    INSERT INTO public.users (id, nickname, signup_platform, account_status)
    VALUES (v_user_id, '최고관리자', 'email', 'active')
    ON CONFLICT (id) DO UPDATE SET
      account_status = 'active',
      updated_at = timezone('utc', now());

    RAISE NOTICE 'auth.users 신규 생성 완료: %', v_email;
  ELSE
    -- ── B) auth.users 있음 → UPDATE 만 (INSERT 트리거 없음 · 가장 안전) ──
    UPDATE auth.users
    SET
      encrypted_password = crypt(v_password, gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, timezone('utc', now())),
      confirmation_token = '',
      recovery_token = '',
      email_change = '',
      email_change_token_new = '',
      banned_until = NULL,
      deleted_at = NULL,
      updated_at = timezone('utc', now()),
      raw_app_meta_data = jsonb_set(
        jsonb_set(
          COALESCE(raw_app_meta_data, '{}'::jsonb),
          '{provider}',
          '"email"'::jsonb,
          true
        ),
        '{providers}',
        (
          SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
          FROM (
            SELECT jsonb_array_elements_text(
              COALESCE(raw_app_meta_data->'providers', '[]'::jsonb)
            ) AS elem
            UNION ALL
            SELECT 'email'
          ) s
        ),
        true
      )
    WHERE id = v_user_id;

    RAISE NOTICE 'auth.users 비밀번호 UPDATE 완료: %', v_email;
  END IF;

  -- ── C) email identity (OAuth 전용 계정이면 필수) ──
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  )
  SELECT
    v_user_id,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email',
    v_user_id::text,
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = v_user_id AND i.provider = 'email'
  );

  -- ── D) user_roles super 활성 (2차 로그인 검증) ──
  INSERT INTO public.user_roles (
    email, display_name, department, role, status, is_protected
  ) VALUES (
    v_email, '최고관리자', '경영진', 'super', 'active', true
  )
  ON CONFLICT (email) DO UPDATE SET
    role = 'super',
    status = 'active',
    is_protected = true,
    updated_at = timezone('utc', now());

  -- ── E) public.users 정상 (트리거/정지 우회) ──
  INSERT INTO public.users (id, nickname, signup_platform, account_status)
  VALUES (v_user_id, '최고관리자', 'email', 'active')
  ON CONFLICT (id) DO UPDATE SET
    account_status = 'active',
    updated_at = timezone('utc', now());

  -- ── F) 기존 세션 전부 폐기 (튕김/복구 토큰 꼬임 방지) ──
  DELETE FROM auth.sessions WHERE user_id = v_user_id;
  DELETE FROM auth.refresh_tokens WHERE user_id = v_user_id;

END $$;

-- ── 결과 확인 (아래 SELECT 로 상태 점검) ──
-- YOUR_SUPER_EMAIL@example.com 도 동일하게 바꿔서 실행

SELECT
  au.id,
  au.email,
  au.email_confirmed_at IS NOT NULL AS email_confirmed,
  au.encrypted_password IS NOT NULL AS has_password,
  au.banned_until,
  au.deleted_at,
  au.raw_app_meta_data->'providers' AS providers,
  array_agg(DISTINCT i.provider) AS identity_providers
FROM auth.users au
LEFT JOIN auth.identities i ON i.user_id = au.id
WHERE lower(trim(au.email)) = lower(trim('YOUR_SUPER_EMAIL@example.com'))
GROUP BY au.id, au.email, au.email_confirmed_at, au.encrypted_password,
         au.banned_until, au.deleted_at, au.raw_app_meta_data;

SELECT email, role, status, is_protected
FROM public.user_roles
WHERE lower(trim(email)) = lower(trim('YOUR_SUPER_EMAIL@example.com'));

-- 로그인: admin_login.html → 위 이메일 + v_password 에 넣은 임시 비밀번호
