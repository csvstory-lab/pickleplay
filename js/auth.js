/**
 * P!CKLE — Supabase Auth (SNS OAuth + 이메일)
 */
(function () {
  'use strict';

  let currentSession = null;
  let initPromise = null;

  const OAUTH_PROVIDER_MAP = {
    kakao: 'kakao',
    naver: 'naver',
    google: 'google',
  };

  function getClient() {
    return window.PickleSupabase.getClient();
  }

  function emailLocalPart(email) {
    if (!email) return '회원';
    return String(email).split('@')[0] || '회원';
  }

  function getDisplayName(user) {
    if (!user) return '회원';
    const meta = user.user_metadata || {};
    if (meta.nickname) return meta.nickname;
    if (meta.full_name) return meta.full_name;
    if (meta.name) return meta.name;
    if (user.email) return emailLocalPart(user.email);
    return '회원';
  }

  function isLoggedIn() {
    return Boolean(currentSession?.user);
  }

  function getSession() {
    return currentSession;
  }

  function getUser() {
    return currentSession?.user ?? null;
  }

  function getRedirectPath() {
    const params = new URLSearchParams(window.location.search);
    return params.get('redirect') || 'index.html';
  }

  function getKakaoOAuthRedirectTo() {
    if (window.PickleOAuthCallbackGuard?.getKakaoOAuthRedirectTo) {
      return window.PickleOAuthCallbackGuard.getKakaoOAuthRedirectTo();
    }
    return window.location.origin + '/user_app/index.html';
  }

  function getOAuthRedirectTo() {
    return window.location.origin + '/user_app/index.html';
  }

  function getResetPasswordRedirectTo() {
    return new URL('reset_password.html', window.location.href).href;
  }

  const SIGNUP_SUCCESS_MSG =
    '가입하신 이메일로 인증 링크가 발송되었습니다. 메일함에서 인증을 완료한 후 로그인해 주세요.';
  const FORGOT_PW_SUCCESS_MSG = '비밀번호 재설정 링크가 이메일로 발송되었습니다.';

  function formatLoginError(err) {
    const code = err?.code ? String(err.code) : '';
    const msg = err?.message ? String(err.message) : '';

    if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
      return '이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.';
    }
    if (
      code === 'invalid_credentials' ||
      /invalid login credentials/i.test(msg) ||
      /invalid email or password/i.test(msg)
    ) {
      return '아이디 또는 비밀번호가 일치하지 않습니다.';
    }
    if (/user already registered/i.test(msg)) {
      return '이미 가입된 이메일입니다. 로그인해 주세요.';
    }
    if (/password should be at least/i.test(msg)) {
      return '비밀번호는 6자 이상이어야 합니다.';
    }
    if (/unable to validate email/i.test(msg)) {
      return '올바른 이메일 주소를 입력해 주세요.';
    }
    return msg || '요청에 실패했습니다.';
  }

  function goToLogin(options) {
    const redirect = encodeURIComponent(options?.redirect || 'index.html');
    const from = options?.from ? `&from=${options.from}` : '';
    window.location.href = `login.html?redirect=${redirect}${from}`;
  }

  function updateNav() {
    const btnLogin = document.getElementById('btnNavLogin');
    const menuUser = document.getElementById('navUserMenu');
    const label = document.getElementById('navUserLabel');

    if (!btnLogin || !menuUser) return;

    if (isLoggedIn()) {
      btnLogin.hidden = true;
      menuUser.hidden = false;
      if (label) {
        label.textContent = getDisplayName(getUser());
      }
    } else {
      btnLogin.hidden = false;
      menuUser.hidden = true;
    }
  }

  async function refreshSession() {
    const sb = getClient();
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    currentSession = data.session;
    updateNav();
    window.dispatchEvent(
      new CustomEvent('pickle-auth-changed', { detail: { session: currentSession } })
    );
    return currentSession;
  }

  async function waitForSessionReady() {
    await init();
    return currentSession;
  }

  async function getUserWhenReady() {
    await waitForSessionReady();
    if (getUser()) return getUser();
    const sb = getClient();
    const { data, error } = await sb.auth.getUser();
    if (error) throw error;
    if (data.user && !currentSession) {
      await refreshSession();
    }
    return data.user ?? null;
  }

  function alertLoginRequired(message, onRedirect) {
    if (window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
      return false;
    }
    alert(message || '로그인이 필요합니다.');
    if (typeof onRedirect === 'function') {
      onRedirect();
    }
    return true;
  }

  /**
   * SNS OAuth 로그인 뼈대 (Supabase 대시보드에서 Provider 활성화 필요)
   * @param {'kakao'|'naver'|'google'} providerKey
   */
  async function signInWithOAuth(providerKey) {
    const provider = OAUTH_PROVIDER_MAP[providerKey];
    if (!provider) {
      throw new Error('지원하지 않는 로그인 방식입니다.');
    }

    if (
      providerKey === 'google' &&
      window.PickleInAppBrowser &&
      window.PickleInAppBrowser.requireExternalBrowserForOAuth()
    ) {
      throw new Error('인앱 브라우저에서는 구글 로그인을 사용할 수 없습니다.');
    }

    const sb = getClient();
    if (providerKey === 'kakao') {
      const { data, error } = await sb.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getKakaoOAuthRedirectTo(),
          queryParams: { prompt: 'login' },
        },
      });
      if (error) throw error;
      return data;
    }

    const oauthOptions = {
      redirectTo: getOAuthRedirectTo(),
    };
    if (getRedirectPath() !== 'index.html') {
      oauthOptions.redirectTo = new URL(getRedirectPath(), window.location.href).href;
    }

    const { data, error } = await sb.auth.signInWithOAuth({
      provider,
      options: oauthOptions,
    });

    if (error) throw error;
    return data;
  }

  async function resetPasswordForEmail(email) {
    const sb = getClient();
    const { data, error } = await sb.auth.resetPasswordForEmail(String(email).trim(), {
      redirectTo: getResetPasswordRedirectTo(),
    });
    if (error) throw error;
    return data;
  }

  async function signUp(email, password, nickname) {
    const sb = getClient();
    const nick = nickname?.trim() || emailLocalPart(email);
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          nickname: nick,
          signup_platform: 'email',
        },
      },
    });
    if (error) throw error;
    if (data.session) {
      await signOut();
    }
    return data;
  }

  async function signIn(email, password) {
    const sb = getClient();
    const { data, error } = await sb.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    currentSession = data.session;
    updateNav();
    window.dispatchEvent(
      new CustomEvent('pickle-auth-changed', { detail: { session: currentSession } })
    );
    return data;
  }

  async function signOut() {
    const sb = getClient();
    const { error } = await sb.auth.signOut();
    if (error) throw error;
    currentSession = null;
    updateNav();
    window.dispatchEvent(
      new CustomEvent('pickle-auth-changed', { detail: { session: null } })
    );
  }

  /** 닉네임 변경 — Auth metadata + public.users 동시 반영 */
  async function updateNickname(nickname) {
    const nick = String(nickname || '').trim();
    if (nick.length < 2 || nick.length > 30) {
      throw new Error('닉네임은 2~30자로 입력해 주세요.');
    }

    const user = getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const sb = getClient();
    const meta = { ...(user.user_metadata || {}), nickname: nick };

    const { data, error } = await sb.auth.updateUser({ data: meta });
    if (error) throw error;

    const { error: dbError } = await sb.from('users').update({ nickname: nick }).eq('id', user.id);
    if (dbError) throw dbError;

    await refreshSession();
    return getUser();
  }

  function bindNavActions() {
    const btnLogout = document.getElementById('btnNavLogout');
    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        try {
          await signOut();
          window.location.href = 'index.html';
        } catch (err) {
          alert(err.message || '로그아웃에 실패했습니다.');
        }
      });
    }
  }

  function bindLoginPage() {
    const msg = document.getElementById('authMessage');
    const voteBanner = document.getElementById('voteLoginBanner');
    const emailSection = document.getElementById('emailAuthSection');
    const btnToggleEmail = document.getElementById('btnToggleEmail');
    const formLogin = document.getElementById('formLogin');
    const formSignup = document.getElementById('formSignup');
    const emailTabs = document.querySelectorAll('.email-tab');
    const emailPanels = document.querySelectorAll('.email-panel');

    const params = new URLSearchParams(window.location.search);
    if (voteBanner && params.get('from') === 'vote') {
      voteBanner.hidden = false;
      voteBanner.textContent = '🗳️ 투표하려면 로그인이 필요해요!';
    }
    if (voteBanner && params.get('from') === 'create') {
      voteBanner.hidden = false;
      voteBanner.textContent = '✏️ 불판을 만들려면 로그인이 필요해요!';
    }

    function showAuthMessage(text, isError) {
      if (!msg) return;
      msg.hidden = false;
      msg.textContent = text;
      msg.className = 'auth-message' + (isError ? ' error' : ' success');
    }

    function redirectAfterAuth() {
      window.location.href = getRedirectPath();
    }

    document.querySelectorAll('[data-oauth]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const provider = btn.dataset.oauth;
        try {
          btn.disabled = true;
          showAuthMessage(
            provider === 'naver'
              ? '네이버 로그인 페이지로 이동합니다… (Supabase 네이버 Provider 설정 필요)'
              : '로그인 페이지로 이동합니다…',
            false
          );
          await signInWithOAuth(provider);
        } catch (err) {
          btn.disabled = false;
          const hint =
            provider === 'naver'
              ? '\n\n※ Supabase → Authentication → Providers 에서 Naver(Custom OIDC) 연동이 필요합니다.'
              : '';
          showAuthMessage((err.message || '소셜 로그인에 실패했습니다.') + hint, true);
        }
      });
    });

    if (btnToggleEmail && emailSection) {
      btnToggleEmail.addEventListener('click', () => {
        const open = emailSection.classList.toggle('open');
        btnToggleEmail.setAttribute('aria-expanded', open ? 'true' : 'false');
        btnToggleEmail.textContent = open
          ? '이메일 로그인 접기'
          : '이메일로 로그인 / 회원가입';
      });
    }

    emailTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.panel;
        emailTabs.forEach((t) => t.classList.toggle('active', t === tab));
        emailPanels.forEach((p) => {
          p.classList.toggle('active', p.id === target);
        });
        if (msg) {
          msg.hidden = true;
          msg.textContent = '';
        }
      });
    });

    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await signIn(formLogin.email.value, formLogin.password.value);
          showAuthMessage('로그인 성공! 이동합니다…', false);
          setTimeout(redirectAfterAuth, 400);
        } catch (err) {
          alert(formatLoginError(err));
        }
      });
    }

    const btnForgotPassword = document.getElementById('btnForgotPassword');
    const forgotOverlay = document.getElementById('forgotPwModalOverlay');
    const forgotEmailInput = document.getElementById('forgotPwEmailInput');
    const btnForgotPwConfirm = document.getElementById('btnForgotPwConfirm');
    const btnForgotPwCancel = document.getElementById('btnForgotPwCancel');

    if (btnForgotPassword && forgotOverlay && forgotEmailInput && btnForgotPwConfirm) {
      const closeForgotModal = () => {
        forgotOverlay.classList.remove('open');
        forgotOverlay.setAttribute('aria-hidden', 'true');
      };

      btnForgotPassword.addEventListener('click', (e) => {
        e.preventDefault();
        const mainEmail = document.getElementById('mainEmailInput');
        forgotEmailInput.value = mainEmail?.value?.trim() || formLogin?.email?.value?.trim() || '';
        forgotOverlay.classList.add('open');
        forgotOverlay.setAttribute('aria-hidden', 'false');
        forgotEmailInput.focus();
      });

      btnForgotPwCancel?.addEventListener('click', (e) => {
        e.preventDefault();
        closeForgotModal();
      });

      forgotOverlay.addEventListener('click', (e) => {
        if (e.target === forgotOverlay) closeForgotModal();
      });

      btnForgotPwConfirm.addEventListener('click', async () => {
        const email = forgotEmailInput.value.trim();
        if (!email || !email.includes('@')) {
          alert('올바른 이메일 주소를 입력해 주세요.');
          forgotEmailInput.focus();
          return;
        }

        btnForgotPwConfirm.disabled = true;
        try {
          await resetPasswordForEmail(email);
          closeForgotModal();
          alert(FORGOT_PW_SUCCESS_MSG);
        } catch (err) {
          alert(formatLoginError(err));
        } finally {
          btnForgotPwConfirm.disabled = false;
        }
      });
    }

    if (formSignup) {
      formSignup.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = formSignup.password.value;
        const password2 = formSignup.passwordConfirm.value;

        if (password.length < 6) {
          showAuthMessage('비밀번호는 6자 이상이어야 합니다.', true);
          return;
        }
        if (password !== password2) {
          showAuthMessage('비밀번호 확인이 일치하지 않습니다.', true);
          return;
        }

        try {
          await signUp(
            formSignup.email.value,
            password,
            formSignup.nickname?.value
          );
          formSignup.reset();
          alert(SIGNUP_SUCCESS_MSG);
        } catch (err) {
          alert(formatLoginError(err));
        }
      });
    }
  }

  async function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const sb = getClient();
      const isOAuthCallback =
        window.location.hash.includes('access_token') ||
        window.location.hash.includes('type=recovery');

      if (isOAuthCallback) {
        console.log('[P!CKLE Auth] OAuth 토큰 처리 대기 — 세션 파싱까지 보류');
        if (window.PickleOAuthCallbackGuard?.waitForOAuthSession) {
          await window.PickleOAuthCallbackGuard.waitForOAuthSession();
        }
      }

      await refreshSession();

      if (window.location.pathname.endsWith('login.html') && isLoggedIn()) {
        window.location.replace(getRedirectPath());
        return;
      }

      updateNav();
      bindNavActions();
      bindLoginPage();

      sb.auth.onAuthStateChange((_event, session) => {
        currentSession = session;
        updateNav();
        window.dispatchEvent(
          new CustomEvent('pickle-auth-changed', { detail: { session } })
        );
      });
    })();

    return initPromise;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init().catch(function (err) {
        console.warn('[P!CKLE Auth] init failed', err);
      });
    });
  } else {
    init().catch(function (err) {
      console.warn('[P!CKLE Auth] init failed', err);
    });
  }

  window.PickleAuth = {
    init,
    waitForSessionReady,
    getUserWhenReady,
    alertLoginRequired,
    isLoggedIn,
    getSession,
    getUser,
    getDisplayName,
    signIn,
    signUp,
    signOut,
    updateNickname,
    signInWithOAuth,
    resetPasswordForEmail,
    formatLoginError,
    goToLogin,
    refreshSession,
    emailLocalPart,
    getRedirectPath,
  };
})();
