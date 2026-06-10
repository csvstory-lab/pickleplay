/**
 * P!CKLE login.html — Supabase Auth 직접 연동
 * window.PICKLE_SUPABASE_CONFIG + PickleSupabaseBootstrap
 */
(function () {
  'use strict';

  var FORM_MODE = { LOGIN: 'login', SIGNUP: 'signup' };

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

  function getRedirectAfterLogin() {
    return new URLSearchParams(window.location.search).get('redirect') || 'mypage.html';
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
    var authBlock = document.querySelector('.email-auth-block');
    if (!primaryBtn || !modeToggleLink || !emailInput || !pwInput) return;

    var formMode = FORM_MODE.LOGIN;

    function setFormMode(mode) {
      formMode = mode === FORM_MODE.SIGNUP ? FORM_MODE.SIGNUP : FORM_MODE.LOGIN;
      if (authBlock) {
        authBlock.dataset.mode = formMode;
      }
      if (formMode === FORM_MODE.SIGNUP) {
        primaryBtn.textContent = '회원가입 완료';
        modeToggleLink.textContent = '로그인으로 돌아가기';
      } else {
        primaryBtn.textContent = '로그인';
        modeToggleLink.textContent = '이메일로 가입하기';
      }
    }

    function readCredentials() {
      return {
        email: emailInput.value.trim(),
        password: pwInput.value,
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

    modeToggleLink.addEventListener('click', function (e) {
      e.preventDefault();
      setFormMode(formMode === FORM_MODE.LOGIN ? FORM_MODE.SIGNUP : FORM_MODE.LOGIN);
    });

    primaryBtn.addEventListener('click', async function () {
      if (!guardConfigForUserAction()) return;

      var isSignup = formMode === FORM_MODE.SIGNUP;
      var creds = validateCredentials(isSignup);
      if (!creds) return;

      var loadingLabel = isSignup ? '가입 처리 중…' : '로그인 중…';

      primaryBtn.disabled = true;
      primaryBtn.textContent = loadingLabel;

      try {
        if (isSignup) {
          await signUpWithEmail(creds.email, creds.password, creds.email.split('@')[0]);
          alert('가입이 완료되었습니다! 로그인해 주세요.');
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
          formMode === FORM_MODE.SIGNUP ? '회원가입 완료' : '로그인';
      }
    });

    pwInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        primaryBtn.click();
      }
    });

    setFormMode(FORM_MODE.LOGIN);
  }

  function getOAuthRedirectTo() {
    return new URL(getRedirectAfterLogin(), window.location.href).href;
  }

  async function signInWithOAuth(provider) {
    if (!guardConfigForUserAction()) {
      throw new Error('Supabase config not ready');
    }
    if (provider !== 'kakao' && provider !== 'google') {
      throw new Error('지원하지 않는 로그인 방식입니다.');
    }
    var sb = getSupabaseClient();
    var options = { redirectTo: getOAuthRedirectTo() };

    if (provider === 'kakao') {
      options.queryParams = { prompt: 'login' };
    }

    var result = await sb.auth.signInWithOAuth({
      provider: provider,
      options: options,
    });

    if (result.error) throw result.error;
    return result.data;
  }

  async function signUpWithEmail(email, password, nickname) {
    var sb = getSupabaseClient();
    var result = await sb.auth.signUp({
      email: String(email).trim(),
      password: password,
      options: {
        data: {
          nickname: String(nickname || '').trim() || '픽클러',
          signup_platform: 'email',
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

  async function signUpOrSignIn(email, password, nickname) {
    try {
      return await signUpWithEmail(email, password, nickname);
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
    guardConfigForUserAction: guardConfigForUserAction,
    init: initLoginPage,
  };

  document.addEventListener('DOMContentLoaded', initLoginPage);
})();
