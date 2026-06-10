/**
 * P!CKLE login.html — Supabase Auth 직접 연동
 * window.PICKLE_SUPABASE_CONFIG + PickleSupabaseBootstrap
 */
(function () {
  'use strict';

  var FORM_MODE = { LOGIN: 'login', SIGNUP: 'signup' };
  var FEED_PATH = 'index.html';

  function bootstrap() {
    return window.PickleSupabaseBootstrap;
  }

  function getSupabaseClient() {
    var b = bootstrap();
    if (!b) {
      throw new Error(
        'Supabase 초기화 모듈이 없습니다. supabase-bootstrap.js 로드 순서를 확인해 주세요.'
      );
    }
    return b.getClient();
  }

  function guardConfigForUserAction() {
    var b = bootstrap();
    if (!b) {
      alert('인증 모듈을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
      return false;
    }
    if (!b.isReady()) {
      alert(b.getErrorMessage());
      return false;
    }
    return true;
  }

  /** 로그인 성공 후 이동 — 기본 메인 피드(index.html) */
  function getRedirectAfterLogin() {
    return new URLSearchParams(window.location.search).get('redirect') || FEED_PATH;
  }

  /** OAuth 콜백 — Supabase 대시보드 Redirect URL과 일치해야 함 */
  function getOAuthRedirectTo() {
    return window.location.origin + '/index.html';
  }

  function formatAuthError(err) {
    var msg = (err && err.message) ? err.message : '요청에 실패했습니다.';
    if (/invalid login credentials/i.test(msg)) {
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    }
    if (/user already registered/i.test(msg)) {
      return '이미 가입된 이메일입니다. 로그인해 주세요.';
    }
    if (/password should be at least/i.test(msg)) {
      return '비밀번호는 6자 이상 입력해 주세요.';
    }
    if (/unable to validate email/i.test(msg)) {
      return '올바른 이메일 주소를 입력해 주세요.';
    }
    return msg;
  }

  function bindMainEmailAuth() {
    var primaryBtn = document.getElementById('btnEmailLogin');
    var modeToggleLink = document.getElementById('btnEmailSignup');
    var emailInput = document.getElementById('mainEmailInput');
    var pwInput = document.getElementById('mainPwInput');
    var pwConfirmInput = document.getElementById('password-confirm');
    var signupDetailWrap = document.getElementById('signupDetailWrap');
    var age14Checkbox = document.getElementById('signup-age14');
    var marketingCheckbox = document.getElementById('signup-marketing');
    var ageGroupSelect = document.getElementById('signup-age-group');
    var authBlock = document.querySelector('.email-auth-block');
    if (!primaryBtn || !modeToggleLink || !emailInput || !pwInput || !pwConfirmInput) {
      return;
    }

    var formMode = FORM_MODE.LOGIN;

    function getSelectedGender() {
      var selected = document.querySelector('input[name="signupGender"]:checked');
      return selected ? selected.value : '';
    }

    function resetSignupFields() {
      pwConfirmInput.value = '';
      if (age14Checkbox) age14Checkbox.checked = false;
      if (marketingCheckbox) marketingCheckbox.checked = false;
      if (ageGroupSelect) ageGroupSelect.value = '';
      document.querySelectorAll('input[name="signupGender"]').forEach(function (el) {
        el.checked = false;
      });
    }

    function setFormMode(mode) {
      formMode = mode === FORM_MODE.SIGNUP ? FORM_MODE.SIGNUP : FORM_MODE.LOGIN;

      if (authBlock) {
        authBlock.dataset.mode = formMode;
      }
      if (signupDetailWrap) {
        signupDetailWrap.setAttribute(
          'aria-hidden',
          formMode === FORM_MODE.SIGNUP ? 'false' : 'true'
        );
      }

      if (formMode === FORM_MODE.SIGNUP) {
        primaryBtn.textContent = '픽클 회원가입';
        modeToggleLink.textContent = '이미 계정이 있으신가요? 로그인';
        pwInput.autocomplete = 'new-password';
      } else {
        primaryBtn.textContent = '로그인';
        modeToggleLink.textContent = '이메일로 가입하기';
        pwInput.autocomplete = 'current-password';
        resetSignupFields();
      }
    }

    function readCredentials() {
      return {
        email: emailInput.value.trim(),
        password: pwInput.value,
        passwordConfirm: pwConfirmInput.value,
      };
    }

    function validateCredentials(isSignup) {
      var creds = readCredentials();
      if (!creds.email || creds.email.indexOf('@') === -1) {
        alert('올바른 이메일 주소를 입력해 주세요.');
        emailInput.focus();
        return null;
      }
      if (!creds.password) {
        alert('비밀번호를 입력해 주세요.');
        pwInput.focus();
        return null;
      }
      if (isSignup && creds.password.length < 6) {
        alert('비밀번호는 6자 이상 입력해 주세요.');
        pwInput.focus();
        return null;
      }
      return creds;
    }

    function validateSignupDetails(creds) {
      if (creds.password !== creds.passwordConfirm) {
        alert('비밀번호 확인이 일치하지 않습니다.');
        pwConfirmInput.focus();
        return null;
      }
      if (!age14Checkbox || !age14Checkbox.checked) {
        alert('만 14세 이상임에 동의해 주세요.');
        if (age14Checkbox) age14Checkbox.focus();
        return null;
      }
      var gender = getSelectedGender();
      if (!gender) {
        alert('성별을 선택해 주세요.');
        return null;
      }
      var ageGroup = ageGroupSelect ? ageGroupSelect.value : '';
      if (!ageGroup) {
        alert('연령대를 선택해 주세요.');
        if (ageGroupSelect) ageGroupSelect.focus();
        return null;
      }
      return {
        gender: gender,
        ageGroup: ageGroup,
        marketingConsent: !!(marketingCheckbox && marketingCheckbox.checked),
      };
    }

    modeToggleLink.addEventListener('click', function (e) {
      e.preventDefault();
      setFormMode(formMode === FORM_MODE.LOGIN ? FORM_MODE.SIGNUP : FORM_MODE.LOGIN);
    });

    primaryBtn.addEventListener('click', async function () {
      if (!guardConfigForUserAction()) return;

      var isSignup = formMode === FORM_MODE.SIGNUP;
      var creds = validateCredentials(isSignup);
      if (!creds) return;

      var signupMeta = null;
      if (isSignup) {
        signupMeta = validateSignupDetails(creds);
        if (!signupMeta) return;
      }

      var loadingLabel = isSignup ? '가입 처리 중…' : '로그인 중…';

      primaryBtn.disabled = true;
      primaryBtn.textContent = loadingLabel;

      try {
        if (isSignup) {
          await signUpWithEmail(creds.email, creds.password, {
            nickname: creds.email.split('@')[0],
            gender: signupMeta.gender,
            age_group: signupMeta.ageGroup,
            marketing_consent: signupMeta.marketingConsent,
          });
          alert('가입 완료! 로그인해주세요.');
          resetSignupFields();
          setFormMode(FORM_MODE.LOGIN);
        } else {
          await signInWithEmail(creds.email, creds.password);
          window.location.href = getRedirectAfterLogin();
        }
      } catch (err) {
        alert(formatAuthError(err));
      } finally {
        primaryBtn.disabled = false;
        primaryBtn.textContent =
          formMode === FORM_MODE.SIGNUP ? '픽클 회원가입' : '로그인';
      }
    });

    function onEnterSubmit(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        primaryBtn.click();
      }
    }

    pwInput.addEventListener('keydown', onEnterSubmit);
    pwConfirmInput.addEventListener('keydown', onEnterSubmit);

    setFormMode(FORM_MODE.LOGIN);
  }

  async function signInWithOAuth(provider) {
    if (!guardConfigForUserAction()) {
      throw new Error('Supabase config not ready');
    }
    if (provider !== 'kakao' && provider !== 'google') {
      throw new Error('지원하지 않는 로그인 방식입니다.');
    }
    var sb = getSupabaseClient();
    var oauthOptions = {
      redirectTo: window.location.origin + '/index.html',
    };

    var result = await sb.auth.signInWithOAuth({
      provider: provider,
      options: oauthOptions,
    });

    if (result.error) throw result.error;
    return result.data;
  }

  async function signUpWithEmail(email, password, profileData) {
    var meta = profileData || {};
    var sb = getSupabaseClient();
    var result = await sb.auth.signUp({
      email: String(email).trim(),
      password: password,
      options: {
        data: {
          nickname: String(meta.nickname || '').trim() || '픽클러',
          signup_platform: 'email',
          gender: meta.gender || null,
          age_group: meta.age_group || null,
          marketing_consent: !!meta.marketing_consent,
        },
      },
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function signInWithEmail(email, password) {
    var sb = getSupabaseClient();
    var result = await sb.auth.signInWithPassword({
      email: String(email).trim(),
      password: password,
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function signUpOrSignIn(email, password, profileData) {
    try {
      return await signUpWithEmail(email, password, profileData);
    } catch (err) {
      var msg = err.message || '';
      if (/already|registered|exists|duplicate/i.test(msg)) {
        return await signInWithEmail(email, password);
      }
      throw err;
    }
  }

  async function initLoginPage() {
    bindMainEmailAuth();

    var b = bootstrap();
    if (!b || !b.isReady()) {
      console.warn('[P!CKLE Login]', b ? b.getErrorMessage() : 'bootstrap missing');
      return;
    }

    try {
      var sb = getSupabaseClient();
      var sessionResult = await sb.auth.getSession();
      if (sessionResult.data.session && window.location.pathname.endsWith('login.html')) {
        window.location.replace(getRedirectAfterLogin());
      }
    } catch (err) {
      console.warn('[P!CKLE Login]', err);
    }
  }

  window.PickleLogin = {
    getSupabaseClient: getSupabaseClient,
    signInWithOAuth: signInWithOAuth,
    signUpWithEmail: signUpWithEmail,
    signInWithEmail: signInWithEmail,
    signUpOrSignIn: signUpOrSignIn,
    getRedirectAfterLogin: getRedirectAfterLogin,
    getOAuthRedirectTo: getOAuthRedirectTo,
    guardConfigForUserAction: guardConfigForUserAction,
    init: initLoginPage,
  };

  document.addEventListener('DOMContentLoaded', initLoginPage);
})();
