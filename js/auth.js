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

  function getOAuthRedirectTo() {
    return new URL(getRedirectPath(), window.location.href).href;
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

  /**
   * SNS OAuth 로그인 뼈대 (Supabase 대시보드에서 Provider 활성화 필요)
   * @param {'kakao'|'naver'|'google'} providerKey
   */
  async function signInWithOAuth(providerKey) {
    const provider = OAUTH_PROVIDER_MAP[providerKey];
    if (!provider) {
      throw new Error('지원하지 않는 로그인 방식입니다.');
    }

    const sb = getClient();
    const { data, error } = await sb.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: getOAuthRedirectTo(),
        queryParams:
          providerKey === 'kakao'
            ? { prompt: 'login' }
            : undefined,
      },
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
          showAuthMessage(err.message || '로그인에 실패했습니다.', true);
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
          const data = await signUp(
            formSignup.email.value,
            password,
            formSignup.nickname?.value
          );
          if (data.session) {
            showAuthMessage('가입 완료! 이동합니다…', false);
            setTimeout(redirectAfterAuth, 500);
          } else {
            showAuthMessage(
              '가입 완료! 이메일 인증을 켜 두었다면 메일 확인 후 로그인해 주세요.',
              false
            );
          }
        } catch (err) {
          showAuthMessage(err.message || '회원가입에 실패했습니다.', true);
        }
      });
    }
  }

  async function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const sb = getClient();
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

  window.PickleAuth = {
    init,
    isLoggedIn,
    getSession,
    getUser,
    getDisplayName,
    signIn,
    signUp,
    signOut,
    updateNickname,
    signInWithOAuth,
    goToLogin,
    refreshSession,
    emailLocalPart,
    getRedirectPath,
  };
})();
