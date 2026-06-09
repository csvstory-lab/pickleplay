/**
 * P!CKLE login.html — Supabase Auth 직접 연동
 * window.PICKLE_SUPABASE_CONFIG (url, anonKey) 사용
 */
(function () {
  'use strict';

  function getSupabaseClient() {
    var cfg = window.PICKLE_SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey) {
      throw new Error(
        'Supabase 접속 정보가 없습니다. js/supabase-config.js 를 확인해 주세요.'
      );
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase JS 라이브러리가 로드되지 않았습니다.');
    }
    return window.supabase.createClient(
      String(cfg.url).trim().replace(/\/+$/, ''),
      String(cfg.anonKey).trim()
    );
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
    var loginBtn = document.getElementById('btnEmailLogin');
    var signupBtn = document.getElementById('btnEmailSignup');
    var emailInput = document.getElementById('mainEmailInput');
    var pwInput = document.getElementById('mainPwInput');
    if (!loginBtn || !signupBtn || !emailInput || !pwInput) return;

    loginBtn.addEventListener('click', async function () {
      var email = emailInput.value.trim();
      var password = pwInput.value;
      if (!email || !email.includes('@')) {
        alert('올바른 이메일 주소를 입력해 주세요.');
        emailInput.focus();
        return;
      }
      if (!password) {
        alert('비밀번호를 입력해 주세요.');
        pwInput.focus();
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = '로그인 중…';
      try {
        await signInWithEmail(email, password);
        window.location.href = getRedirectAfterLogin();
      } catch (err) {
        alert(formatAuthError(err));
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = '로그인';
      }
    });

    signupBtn.addEventListener('click', async function () {
      var email = emailInput.value.trim();
      var password = pwInput.value;
      if (!email || !email.includes('@')) {
        alert('올바른 이메일 주소를 입력해 주세요.');
        emailInput.focus();
        return;
      }
      if (password.length < 6) {
        alert('비밀번호는 6자 이상 입력해 주세요.');
        pwInput.focus();
        return;
      }

      signupBtn.disabled = true;
      try {
        await signUpWithEmail(email, password, email.split('@')[0]);
        alert('가입이 완료되었습니다! 로그인해주세요.');
      } catch (err) {
        alert(formatAuthError(err));
      } finally {
        signupBtn.disabled = false;
      }
    });

    pwInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') loginBtn.click();
    });
  }

  function getOAuthRedirectTo() {
    return new URL(getRedirectAfterLogin(), window.location.href).href;
  }

  /** 카카오 / 구글 / 네이버 OAuth */
  async function signInWithOAuth(provider) {
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
    init: initLoginPage,
  };

  document.addEventListener('DOMContentLoaded', initLoginPage);
})();
