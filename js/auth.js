/**
 * P!CKLE — Supabase Auth (SNS OAuth + 이메일)
 */
(function () {
  'use strict';

  let currentSession = null;
  let initPromise = null;
  let enrichedUser = null;
  let enrichedProfile = null;
  let ensureAuthInflight = null;
  let authContextCache = null;

  const OAUTH_PROVIDER_MAP = {
    kakao: 'kakao',
    naver: 'naver',
    google: 'google',
  };

  function getClient() {
    if (typeof window.getPickleSupabaseClient === 'function') {
      return window.getPickleSupabaseClient();
    }
    if (window.supabaseClient) {
      return window.supabaseClient;
    }
    if (window.PickleSupabaseBootstrap?.isReady()) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    if (window.PickleSupabase?.getClient) {
      return window.PickleSupabase.getClient();
    }
    throw new Error(
      'Supabase 클라이언트를 불러오지 못했습니다. supabase-bootstrap.js 로드 순서를 확인해 주세요.'
    );
  }

  function isSessionMissingError(err) {
    const msg = String(err?.message || err || '').toLowerCase();
    return msg.includes('auth session missing') || msg.includes('session missing');
  }

  /**
   * localStorage 세션 hydration · INITIAL_SESSION 이벤트까지 대기
   */
  function waitForAuthHydration(sb, options) {
    const timeoutMs = (options && options.timeoutMs) || 4000;
    const pollMs = (options && options.pollMs) || 100;

    return new Promise(function (resolve) {
      let settled = false;
      let subscription = null;
      let pollTimer = null;
      let timeoutTimer = null;

      function finish(session) {
        if (settled) return;
        settled = true;
        if (pollTimer) clearInterval(pollTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (subscription && typeof subscription.unsubscribe === 'function') {
          subscription.unsubscribe();
        }
        resolve(session || null);
      }

      sb.auth.getSession().then(function (res) {
        if (res.data && res.data.session) {
          finish(res.data.session);
        }
      });

      const changeResult = sb.auth.onAuthStateChange(function (event, session) {
        if (
          session &&
          (event === 'INITIAL_SESSION' ||
            event === 'SIGNED_IN' ||
            event === 'TOKEN_REFRESHED' ||
            event === 'USER_UPDATED')
        ) {
          finish(session);
        }
      });
      subscription = changeResult.data && changeResult.data.subscription;

      pollTimer = setInterval(function () {
        sb.auth.getSession().then(function (res) {
          if (res.data && res.data.session) {
            finish(res.data.session);
          }
        });
      }, pollMs);

      timeoutTimer = setTimeout(function () {
        sb.auth.getSession().then(function (res) {
          finish((res.data && res.data.session) || null);
        });
      }, timeoutMs);
    });
  }

  async function safeGetSessionUser(sb) {
    const { data, error } = await sb.auth.getSession();
    if (error || !data?.session?.user) return null;
    return data.session.user;
  }

  function clearAuthContext() {
    enrichedUser = null;
    enrichedProfile = null;
    authContextCache = null;
    ensureAuthInflight = null;
  }

  function extractNicknameFromMeta(meta) {
    if (!meta) return '';
    const candidates = [
      meta.nickname,
      meta.full_name,
      meta.name,
      meta.preferred_username,
      meta.user_name,
      meta.kakao_account?.profile?.nickname,
      meta.kakao_account?.profile?.nickName,
    ];
    for (let i = 0; i < candidates.length; i++) {
      const nick = String(candidates[i] || '').trim();
      if (nick && nick !== '픽클러') return nick;
    }
    for (let j = 0; j < candidates.length; j++) {
      const fallback = String(candidates[j] || '').trim();
      if (fallback) return fallback;
    }
    return '';
  }

  async function fetchUserProfile(sb, userId) {
    if (!sb || !userId) return null;
    const { data, error } = await sb
      .from('users')
      .select(
        'id, nickname, avatar_html, avatar_url, bio, signup_platform, points, gender, age_group, region, marketing_agreed, marketing_consent, is_over_14, is_info_collected'
      )
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[P!CKLE Auth] public.users profile fetch failed', error);
      return null;
    }
    return data || null;
  }

  function mergeUserWithProfile(user, profile) {
    if (!user) return null;
    const meta = { ...(user.user_metadata || {}) };
    const metaNick = extractNicknameFromMeta(meta);

    if (profile) {
      const dbNick = profile.nickname ? String(profile.nickname).trim() : '';
      if (dbNick && dbNick !== '픽클러') {
        meta.nickname = dbNick;
      } else if (!metaNick && dbNick) {
        meta.nickname = dbNick;
      } else if (metaNick) {
        meta.nickname = metaNick;
      }
      if (profile.avatar_html && String(profile.avatar_html).trim()) {
        meta.avatar_html = String(profile.avatar_html).trim();
      }
      if (profile.avatar_url && String(profile.avatar_url).trim()) {
        meta.avatar_url = String(profile.avatar_url).trim();
      }
      if (profile.bio != null && profile.bio !== '') {
        meta.bio = profile.bio;
      }
    } else if (metaNick) {
      meta.nickname = metaNick;
    }

    return Object.assign({}, user, {
      user_metadata: meta,
      _profile: profile || null,
    });
  }

  /** 로그인 없이 URL 직접 접근 허용 (그 외 페이지는 공개 열람 가능) */
  const AUTH_REQUIRED_PAGES = new Set([
    'mypage.html',
    'create.html',
    'settings.html',
    'notifications.html',
  ]);

  const ACTION_LOGIN_MESSAGE = '로그인이 필요한 서비스입니다.';

  function parsePageFromUrl(url) {
    const s = String(url || '').split('?')[0].split('#')[0];
    return s.split('/').pop() || '';
  }

  function isAuthRequiredPage(url) {
    return AUTH_REQUIRED_PAGES.has(parsePageFromUrl(url));
  }

  function isPublicPage(url) {
    return !isAuthRequiredPage(url);
  }

  function buildRedirectPath(page, search) {
    const file = page || getPageRedirectPath();
    const qs = search != null ? search : window.location.search || '';
    return file + qs;
  }

  /**
   * 투표·댓글·생성 등 액션 시 confirm 후 로그인 이동
   */
  async function promptAuthForAction(options) {
    const opts = options || {};
    const message = opts.message || ACTION_LOGIN_MESSAGE;
    const redirect = opts.redirect || buildRedirectPath();

    if (hasLocalSessionHint()) {
      try {
        const user = await getSessionUserFast({ timeoutMs: opts.timeoutMs || 1500 });
        if (user) return user;
      } catch (err) {
        console.warn('[P!CKLE Auth] promptAuthForAction session check', err);
      }
    }

    if (isOAuthCallbackInUrl() || window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
      return null;
    }

    const confirmMsg =
      opts.confirmMessage ||
      message + '\n\n로그인 페이지로 이동할까요?';

    if (!confirm(confirmMsg)) {
      return null;
    }

    goToLogin({
      redirect: redirect,
      from: opts.from || '',
    });
    return null;
  }

  /**
   * 프라이빗 페이지 URL 직접 접근 시 로그인으로 이동 (confirm 없음)
   */
  async function guardPrivateRouteOnLoad() {
    const page = getPageRedirectPath();
    if (!isAuthRequiredPage(page)) return;

    if (isOAuthCallbackInUrl()) {
      return;
    }

    if (window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
      return;
    }

    if (!hasLocalSessionHint()) {
      goToLogin({
        redirect: buildRedirectPath(page),
        from: page.replace('.html', ''),
      });
      return;
    }

    try {
      const user = await getSessionUserFast({ timeoutMs: 2000 });
      if (user) return;
    } catch (err) {
      console.warn('[P!CKLE Auth] private route guard', err);
    }

    goToLogin({
      redirect: buildRedirectPath(page),
      from: page.replace('.html', ''),
    });
  }

  function isSessionStoredInLocalStorage() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          const raw = localStorage.getItem(key);
          if (raw && raw.includes('access_token')) {
            return true;
          }
        }
      }
    } catch (e) {
      /* ignore */
    }
    return false;
  }

  function isOAuthCallbackInUrl() {
    return (
      window.location.hash.includes('access_token=') ||
      window.location.hash.includes('type=recovery')
    );
  }

  /** 메모리·localStorage에 로그인 흔적이 있는지 (네트워크 대기 없음) */
  function hasLocalSessionHint() {
    if (currentSession?.user) return true;
    if (authContextCache?.user) return true;
    if (enrichedUser?.id) return true;
    return isSessionStoredInLocalStorage();
  }

  /**
   * hydration 대기 없이 getSession()만 짧게 시도 (게스트는 즉시 null)
   */
  async function getSessionFast(options) {
    const timeoutMs = (options && options.timeoutMs) || 800;
    if (!hasLocalSessionHint()) return null;
    if (currentSession?.access_token) return currentSession;

    const sb = getClient();
    try {
      const res = await Promise.race([
        sb.auth.getSession(),
        new Promise(function (resolve) {
          setTimeout(function () {
            resolve({ data: { session: null } });
          }, timeoutMs);
        }),
      ]);
      const session = res?.data?.session ?? null;
      if (session?.user) {
        currentSession = session;
      }
      return session;
    } catch (err) {
      console.warn('[P!CKLE Auth] getSessionFast', err);
      return null;
    }
  }

  async function getSessionUserFast(options) {
    const session = await getSessionFast(options);
    return session?.user ?? null;
  }

  /**
   * getSession() + localStorage persist 확인까지 대기 (OAuth commit 보장)
   */
  async function waitForSessionPersisted(sb, options) {
    const timeoutMs = (options && options.timeoutMs) || 12000;
    const pollMs = (options && options.pollMs) || 100;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const { data, error } = await sb.auth.getSession();
      if (!error && data?.session?.access_token) {
        currentSession = data.session;
        return data.session;
      }
      await new Promise(function (resolve) {
        setTimeout(resolve, pollMs);
      });
    }

    const { data } = await sb.auth.getSession();
    if (data?.session) {
      currentSession = data.session;
    }
    return data?.session ?? null;
  }

  /**
   * OAuth / localStorage hydration 포함 — 세션 확정까지 단일 진입점
   */
  async function resolveSessionFromClient(sb, options) {
    const timeoutMs = (options && options.timeoutMs) || 12000;
    const isOAuthCallback = isOAuthCallbackInUrl();

    if (!isOAuthCallback && !hasLocalSessionHint()) {
      currentSession = null;
      return null;
    }

    if (isOAuthCallback && window.PickleOAuthCallbackGuard?.waitForOAuthSession) {
      const oauthSession = await window.PickleOAuthCallbackGuard.waitForOAuthSession({
        timeoutMs,
      });
      if (oauthSession?.access_token) {
        currentSession = oauthSession;
        return oauthSession;
      }
    }

    const persisted = await waitForSessionPersisted(sb, { timeoutMs, pollMs: 80 });
    if (persisted?.access_token) {
      return persisted;
    }

    const hydrated = await waitForAuthHydration(sb, { timeoutMs, pollMs: 80 });
    if (hydrated?.access_token) {
      currentSession = hydrated;
      return hydrated;
    }

    await refreshSession();
    return currentSession;
  }

  /**
   * 카카오/OAuth metadata 닉네임 → public.users 덮어쓰기 (트리거 기본값 '픽클러' 교정)
   */
  async function syncProfileNicknameFromMetadata(sb, user, profile) {
    if (!sb || !user?.id) return profile;

    const meta = user.user_metadata || {};
    const derivedNick = extractNicknameFromMeta(meta);
    if (!derivedNick || derivedNick === '픽클러') {
      return profile;
    }

    const dbNick = profile?.nickname ? String(profile.nickname).trim() : '';
    const shouldUpdate = !dbNick || dbNick === '픽클러';

    if (!shouldUpdate) {
      return profile;
    }

    const { data, error } = await sb
      .from('users')
      .update({ nickname: derivedNick })
      .eq('id', user.id)
      .select(
        'id, nickname, avatar_html, avatar_url, bio, signup_platform, points, gender, age_group, region, marketing_agreed, marketing_consent, is_over_14, is_info_collected'
      )
      .maybeSingle();

    if (error) {
      console.warn('[P!CKLE Auth] public.users nickname sync failed', error);
      return profile;
    }

    const metaNick = meta.nickname ? String(meta.nickname).trim() : '';
    if (!metaNick || metaNick === '픽클러') {
      try {
        await sb.auth.updateUser({
          data: Object.assign({}, meta, { nickname: derivedNick }),
        });
      } catch (metaErr) {
        console.warn('[P!CKLE Auth] auth metadata nickname sync failed', metaErr);
      }
    }

    return data || Object.assign({}, profile || {}, { nickname: derivedNick });
  }

  /**
   * 세션 localStorage commit 대기 후 페이지 이동 (인증 필요 페이지는 ensureAuthenticated 후 이동)
   */
  async function navigateWhenAuthReady(url, options) {
    const opts = options || {};
    const targetUrl = String(url || '').trim();
    if (!targetUrl) return;

    const needsAuth =
      opts.requireAuth === true ||
      (opts.requireAuth !== false && isAuthRequiredPage(targetUrl));

    if (!needsAuth) {
      window.location.href = targetUrl;
      return;
    }

    if (window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
      return;
    }

    if (!hasLocalSessionHint()) {
      await promptAuthForAction({
        message: opts.message || ACTION_LOGIN_MESSAGE,
        redirect: parsePageFromUrl(targetUrl),
        from: parsePageFromUrl(targetUrl).replace('.html', ''),
      });
      return;
    }

    try {
      const user = await getSessionUserFast({ timeoutMs: opts.timeoutMs || 2000 });
      if (user) {
        window.location.href = targetUrl;
        return;
      }
      await promptAuthForAction({
        message: opts.message || ACTION_LOGIN_MESSAGE,
        redirect: parsePageFromUrl(targetUrl),
        from: parsePageFromUrl(targetUrl).replace('.html', ''),
      });
    } catch (err) {
      console.error('[P!CKLE Auth] navigateWhenAuthReady failed', err);
      await promptAuthForAction({
        message: opts.message || ACTION_LOGIN_MESSAGE,
        redirect: parsePageFromUrl(targetUrl),
        from: parsePageFromUrl(targetUrl).replace('.html', ''),
      });
    }
  }

  function extractNavHrefFromOnclick(el) {
    if (!el) return null;
    const onclick = el.getAttribute('onclick') || '';
    var navMatch = onclick.match(/navigateWhenAuthReady\s*\(\s*['"]([^'"]+)['"]/);
    if (navMatch) return navMatch[1];
    const locMatch = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
    return locMatch ? locMatch[1] : null;
  }

  function bindGlobalNavGuard() {
    if (window.__PICKLE_NAV_GUARD_BOUND) return;
    window.__PICKLE_NAV_GUARD_BOUND = true;

    document.addEventListener(
      'click',
      function (e) {
        const navBtn = e.target.closest('.bottom-nav .nav-btn');
        const logo = e.target.closest('.logo');
        const el = navBtn || (logo && extractNavHrefFromOnclick(logo) ? logo : null);
        if (!el) return;

        const href = extractNavHrefFromOnclick(el);
        if (!href || !/\.html/.test(href)) return;

        e.preventDefault();
        e.stopPropagation();
        navigateWhenAuthReady(href);
      },
      true
    );

    upgradeInlineNavHandlers();
  }

  function upgradeInlineNavHandlers() {
    document
      .querySelectorAll(
        '.bottom-nav .nav-btn[onclick], .logo[onclick*="navigateWhenAuthReady"], .logo[onclick*="location.href"]'
      )
      .forEach(function (el) {
        const href = extractNavHrefFromOnclick(el);
        if (!href || !/\.html/.test(href)) return;
        el.removeAttribute('onclick');
        if (el.dataset.pickleNavBound === '1') return;
        el.dataset.pickleNavBound = '1';
        el.style.cursor = 'pointer';
        el.addEventListener('click', function (e) {
          e.preventDefault();
          navigateWhenAuthReady(href);
        });
      });
  }

  /**
   * 세션 hydration 완료까지 대기 후 { session, user, profile } 반환.
   * 로그인하지 않았으면 user/profile은 null (알림·리다이렉트 없음).
   */
  async function ensureAuthenticated(options) {
    const opts = options || {};
    const timeoutMs = opts.timeoutMs || 12000;
    const skipProfile = opts.skipProfile === true;
    const forceRefresh = opts.forceRefresh === true;

    if (!forceRefresh && authContextCache?.user) {
      if (!skipProfile || authContextCache._profileLoaded) {
        return authContextCache;
      }
    }

    if (ensureAuthInflight) {
      return ensureAuthInflight;
    }

    ensureAuthInflight = (async () => {
      const isOAuthCallback = isOAuthCallbackInUrl();

      if (!forceRefresh && !isOAuthCallback && !hasLocalSessionHint()) {
        authContextCache = { session: null, user: null, profile: null };
        enrichedUser = null;
        enrichedProfile = null;
        return authContextCache;
      }

      await init();

      const sb = getClient();
      const resolveTimeout = isOAuthCallback
        ? Math.max(timeoutMs, 12000)
        : Math.min(timeoutMs, 3000);
      const session = await resolveSessionFromClient(sb, { timeoutMs: resolveTimeout });

      const rawUser = session?.user ?? null;

      if (!rawUser) {
        authContextCache = { session: null, user: null, profile: null };
        enrichedUser = null;
        enrichedProfile = null;
        return authContextCache;
      }

      let profile = enrichedProfile;
      let user = rawUser;

      if (!skipProfile) {
        profile = await fetchUserProfile(sb, rawUser.id);
        profile = await syncProfileNicknameFromMetadata(sb, rawUser, profile);
        user = mergeUserWithProfile(rawUser, profile);
        enrichedUser = user;
        enrichedProfile = profile;
        updateNav();
        window.dispatchEvent(
          new CustomEvent('pickle-auth-ready', {
            detail: { session, user, profile },
          })
        );
        if (
          window.PicklePoints &&
          window.PicklePoints.shouldAttemptSignupBonus &&
          window.PicklePoints.shouldAttemptSignupBonus(rawUser.id)
        ) {
          window.PicklePoints.awardPoints(rawUser.id, 'signup').catch(function (err) {
            console.warn('[P!CKLE Points] signup bonus skipped', err);
          });
        }
        authContextCache = {
          session,
          user,
          profile: profile || null,
          _profileLoaded: true,
        };
      } else {
        if (enrichedProfile && enrichedProfile.id === rawUser.id) {
          user = mergeUserWithProfile(rawUser, enrichedProfile);
        } else {
          user = rawUser;
        }
        enrichedUser = user;
        if (!authContextCache || !authContextCache._profileLoaded) {
          authContextCache = {
            session,
            user,
            profile: enrichedProfile || null,
            _profileLoaded: false,
          };
        }
      }

      return authContextCache;
    })();

    try {
      return await ensureAuthInflight;
    } finally {
      ensureAuthInflight = null;
    }
  }

  /**
   * ensureAuthenticated + 미로그인 시 (OAuth 콜백 제외) 알림·로그인 이동
   * @returns {Promise<object|null>} user 또는 null
   */
  async function requireAuth(options) {
    const opts = options || {};
    const isOAuthCallback = isOAuthCallbackInUrl();

    if (
      !isOAuthCallback &&
      !opts.silent &&
      !hasLocalSessionHint() &&
      !window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()
    ) {
      alertLoginRequired(
        opts.message || '로그인이 필요한 페이지입니다.',
        () => goToLogin({ redirect: opts.redirect || getPageRedirectPath() })
      );
      return null;
    }

    const auth = await ensureAuthenticated({
      ...opts,
      timeoutMs: opts.timeoutMs || (hasLocalSessionHint() ? 3000 : 500),
      forceRefresh: opts.forceRefresh === true,
    });
    if (auth?.user) return auth.user;

    if (
      isOAuthCallback ||
      window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.() ||
      opts.silent
    ) {
      return null;
    }

    alertLoginRequired(
      opts.message || '로그인이 필요한 페이지입니다.',
      () => goToLogin({ redirect: opts.redirect || getPageRedirectPath() })
    );
    return null;
  }

  function getPageRedirectPath() {
    const path = window.location.pathname || '';
    const file = path.split('/').pop();
    return file || 'index.html';
  }

  function getEnrichedUser() {
    return enrichedUser || getUser();
  }

  async function resolveAuthUser(options) {
    const auth = await ensureAuthenticated(options);
    return auth?.user ?? null;
  }

  function emailLocalPart(email) {
    if (!email) return '회원';
    return String(email).split('@')[0] || '회원';
  }

  function getDisplayName(user) {
    const u = user || enrichedUser || getUser();
    if (!u) return '회원';
    const meta = u.user_metadata || {};
    const profile = u._profile;
    const fromMeta = extractNicknameFromMeta(meta);
    const fromDb =
      profile && profile.nickname ? String(profile.nickname).trim() : '';

    if (fromDb && fromDb !== '픽클러') return fromDb;
    if (fromMeta) return fromMeta;
    if (u.email) return emailLocalPart(u.email);
    return '픽클러';
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

  let authListenerRegistered = false;

  function registerAuthStateListener(sb) {
    if (authListenerRegistered || !sb?.auth) return;
    authListenerRegistered = true;

    sb.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        currentSession = session;
        authContextCache = null;
        updateNav();
        window.dispatchEvent(
          new CustomEvent('pickle-auth-changed', { detail: { session } })
        );
        ensureAuthenticated({ forceRefresh: true, skipProfile: false, timeoutMs: 12000 }).catch(
          function (err) {
            console.warn('[P!CKLE Auth] profile refresh after auth change', err);
          }
        );
        return;
      }

      if (event === 'SIGNED_OUT') {
        currentSession = null;
        clearAuthContext();
        updateNav();
        window.dispatchEvent(
          new CustomEvent('pickle-auth-changed', { detail: { session: null } })
        );
      }
    });
  }

  function getKakaoOAuthRedirectTo() {
    if (window.PickleOAuthCallbackGuard?.getKakaoOAuthRedirectTo) {
      return window.PickleOAuthCallbackGuard.getKakaoOAuthRedirectTo();
    }
    return new URL('index.html', window.location.href).href;
  }

  function getOAuthRedirectTo() {
    return new URL('index.html', window.location.href).href;
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
    const isOAuthCallback =
      window.location.hash.includes('access_token=') ||
      window.location.hash.includes('type=recovery');
    if (isOAuthCallback || window.PickleOAuthCallbackGuard?.shouldSuppressLoginAlert?.()) {
      return;
    }
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
        label.textContent = getDisplayName();
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
    return resolveAuthUser();
  }

  function alertLoginRequired(message, onRedirect) {
    if (window.PickleOAuthCallbackGuard?.promptLoginRequired) {
      return window.PickleOAuthCallbackGuard.promptLoginRequired(message, onRedirect);
    }
    const isOAuthCallback =
      window.location.hash.includes('access_token=') ||
      window.location.hash.includes('type=recovery');
    if (isOAuthCallback) {
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
    clearAuthContext();
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
      registerAuthStateListener(sb);

      const isOAuthCallback = isOAuthCallbackInUrl();

      if (isOAuthCallback) {
        console.log('[P!CKLE Auth] OAuth hash 감지 — 세션 확정 대기');
        await resolveSessionFromClient(sb, { timeoutMs: 12000 });
      } else if (hasLocalSessionHint()) {
        await waitForAuthHydration(sb, { timeoutMs: 2000, pollMs: 80 }).then(function (session) {
          if (session && !currentSession) {
            currentSession = session;
          }
        });
        try {
          await refreshSession();
        } catch (refreshErr) {
          console.warn('[P!CKLE Auth] refreshSession', refreshErr);
        }
      } else {
        try {
          await refreshSession();
        } catch (guestRefreshErr) {
          /* guest — no session */
        }
      }

      if (window.location.pathname.endsWith('login.html') && isLoggedIn()) {
        window.location.replace(getRedirectPath());
        return;
      }

      updateNav();
      bindNavActions();
      bindLoginPage();
      bindGlobalNavGuard();
      await guardPrivateRouteOnLoad();
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
    waitForAuthHydration,
    ensureAuthenticated,
    requireAuth,
    navigateWhenAuthReady,
    resolveSessionFromClient,
    waitForSessionPersisted,
    isAuthRequiredPage,
    isPublicPage,
    promptAuthForAction,
    guardPrivateRouteOnLoad,
    ACTION_LOGIN_MESSAGE,
    syncProfileNicknameFromMetadata,
    getUserWhenReady,
    resolveAuthUser,
    safeGetSessionUser,
    getEnrichedUser,
    fetchUserProfile,
    mergeUserWithProfile,
    isSessionStoredInLocalStorage,
    hasLocalSessionHint,
    getSessionFast,
    getSessionUserFast,
    isOAuthCallbackInUrl,
    alertLoginRequired,
    getClient,
    isSessionMissingError,
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
