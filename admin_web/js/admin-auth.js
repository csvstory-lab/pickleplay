/**
 * P!CKLE Admin Workspace — RBAC (Auth + user_roles + 사이드바 + 페이지 가드)
 */
(function () {
  'use strict';

  var LOGIN_PAGE = 'admin_login.html';
  var DASHBOARD_PAGE = 'admin_dashboard.html';
  var SPONSOR_PAGE = 'admin_sponsor.html';
  var SESSION_KEY = 'pickle_admin_role_cache';

  var ROLES = {
    SUPER: 'super',
    MARKETER: 'marketer',
    CS: 'cs',
    ACCOUNT: 'account',
    ADVERTISER: 'advertiser',
  };

  /** 페이지 파일명 → 메뉴 키 */
  var PAGE_TO_MENU = {
    'admin_dashboard.html': 'dashboard',
    'admin_sponsor.html': 'sponsor',
    'admin_users.html': 'users',
    'admin_categories.html': 'categories',
    'admin_post_list.html': 'posts',
    'admin_post_detail.html': 'posts',
    'admin_board_list.html': 'posts',
    'admin_events.html': 'events',
    'admin_reports.html': 'reports',
    'admin_ai_filter.html': 'ai_filter',
    'admin_statistics.html': 'statistics',
    'admin_cs.html': 'cs',
    'admin_settings.html': 'settings',
  };

  /** onclick href → 메뉴 키 */
  var HREF_TO_MENU = {
    'admin_dashboard.html': 'dashboard',
    'admin_sponsor.html': 'sponsor',
    'admin_users.html': 'users',
    'admin_categories.html': 'categories',
    'admin_post_list.html': 'posts',
    'admin_events.html': 'events',
    'admin_reports.html': 'reports',
    'admin_ai_filter.html': 'ai_filter',
    'admin_statistics.html': 'statistics',
    'admin_cs.html': 'cs',
    'admin_settings.html': 'settings',
  };

  /** 역할별 접근 가능 메뉴 */
  var MENU_ACCESS = {
    super: ['dashboard', 'users', 'categories', 'posts', 'ads', 'events', 'reports', 'ai_filter', 'statistics', 'cs', 'settings'],
    marketer: ['dashboard', 'categories', 'posts', 'events', 'statistics'],
    cs: ['dashboard', 'users', 'categories', 'posts', 'reports', 'ai_filter', 'cs'],
    account: ['dashboard', 'ads', 'statistics'],
    advertiser: ['sponsor', 'statistics'],
  };

  function getDefaultLandingPage(role) {
    return role === ROLES.ADVERTISER ? SPONSOR_PAGE : DASHBOARD_PAGE;
  }

  /**
   * 로그인 후 이동 URL (role 기본 랜딩 + redirect 쿼리 검증)
   */
  function getPostLoginUrl(role, redirectParam) {
    var target = redirectParam ? String(redirectParam).trim() : '';

    if (target && PAGE_TO_MENU[target]) {
      if (role === ROLES.ADVERTISER && target === DASHBOARD_PAGE) {
        return SPONSOR_PAGE;
      }
      if (canAccessMenu(role, PAGE_TO_MENU[target])) {
        return target;
      }
    }

    return getDefaultLandingPage(role);
  }

  function getForbiddenFallbackPage(role) {
    return getDefaultLandingPage(role);
  }

  var cachedRole = null;

  function getClient() {
    if (typeof window.getPickleSupabaseClient === 'function') {
      return window.getPickleSupabaseClient();
    }
    if (window.supabaseClient) return window.supabaseClient;
    throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
  }

  function getCurrentPage() {
    var path = window.location.pathname || '';
    var parts = path.split('/');
    return parts[parts.length - 1] || DASHBOARD_PAGE;
  }

  function isLoginPage() {
    return getCurrentPage() === LOGIN_PAGE;
  }

  function extractHrefFromOnclick(el) {
    if (!el) return null;
    var onclick = el.getAttribute('onclick') || '';
    var match = onclick.match(/['"](admin_[^'"]+\.html)['"]/);
    return match ? match[1] : null;
  }

  function redirect(url) {
    window.location.replace(url);
  }

  async function fetchMyRole(sb, options) {
    var force = options && options.forceRefresh;
    if (!force && cachedRole) return cachedRole;

    var client = sb || getClient();
    var res = await client.rpc('pickle_get_my_user_role');

    if (res.error) {
      console.error('[AdminAuth] 역할 RPC 오류:', {
        message: res.error.message,
        details: res.error.details,
        code: res.error.code,
      });
      cachedRole = { ok: false, is_admin: false, reason: 'rpc_error' };
      return cachedRole;
    }

    cachedRole = res.data || { ok: false, is_admin: false };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(cachedRole));
    } catch (e) { /* ignore */ }

    console.log('[AdminAuth] 세션 역할:', cachedRole);
    return cachedRole;
  }

  async function verifyStaffAfterAuth(sb) {
    var roleInfo = await fetchMyRole(sb, { forceRefresh: true });

    if (!roleInfo.ok || roleInfo.is_admin !== true) {
      await sb.auth.signOut();
      var msg = '접근 권한이 없거나 정지된 계정입니다.';
      if (roleInfo.reason === 'not_in_user_roles') {
        msg = '관리자 등록(user_roles)에 없는 계정입니다.';
      } else if (roleInfo.reason === 'suspended') {
        msg = '접근 권한이 없거나 정지된 계정입니다.';
      }
      return { ok: false, message: msg, roleInfo: roleInfo };
    }

    return { ok: true, roleInfo: roleInfo };
  }

  /**
   * admin_login.html — 이메일/비밀번호 로그인 + 2차 user_roles 검증
   */
  async function loginWithPassword(email, password) {
    var sb = getClient();
    email = String(email || '').trim().toLowerCase();
    password = String(password || '');

    if (!email || !password) {
      return { ok: false, message: '이메일과 비밀번호를 입력해 주세요.' };
    }

    console.log('[AdminAuth] 로그인 시도:', email);

    var signInRes = await sb.auth.signInWithPassword({ email: email, password: password });

    if (signInRes.error) {
      console.error('[AdminAuth] Auth 실패:', signInRes.error.message);
      return { ok: false, message: signInRes.error.message || '로그인에 실패했습니다.' };
    }

    var verify = await verifyStaffAfterAuth(sb);
    if (!verify.ok) {
      console.warn('[AdminAuth] 2차 검증 실패:', verify.roleInfo);
      return { ok: false, message: verify.message };
    }

    console.log('[AdminAuth] ✅ 로그인 성공 —', verify.roleInfo.role);
    return {
      ok: true,
      roleInfo: verify.roleInfo,
      landingUrl: getPostLoginUrl(verify.roleInfo.role, null),
    };
  }

  async function signOut() {
    cachedRole = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
    var sb = getClient();
    await sb.auth.signOut();
    redirect(LOGIN_PAGE);
  }

  function canAccessMenu(role, menuKey) {
    if (!role || !menuKey) return false;
    var allowed = MENU_ACCESS[role] || [];
    return allowed.indexOf(menuKey) !== -1;
  }

  function applySidebarRBAC(role) {
    var allowed = MENU_ACCESS[role] || [];
    var sidebar = document.querySelector('aside.sidebar');
    if (!sidebar) return;

    sidebar.querySelectorAll('.nav-item, .nav-sub-item').forEach(function (el) {
      var href = extractHrefFromOnclick(el);
      if (!href) return;
      var menuKey = HREF_TO_MENU[href];
      if (menuKey && allowed.indexOf(menuKey) === -1) {
        el.style.display = 'none';
      } else {
        el.style.display = '';
      }
    });

    injectSessionFooter(sidebar, role);
  }

  function injectSessionFooter(sidebar, role) {
    if (sidebar.querySelector('.admin-session-footer')) return;

    var footer = document.createElement('div');
    footer.className = 'admin-session-footer';
    footer.style.cssText =
      'margin-top:auto;padding:16px 25px;border-top:1px solid #27272a;font-size:0.75rem;color:#71717a;';
    footer.innerHTML =
      '<div style="margin-bottom:8px;color:#a1a1aa;font-weight:700;">' +
      escapeHtml((cachedRole && cachedRole.display_name) || '관리자') +
      ' <span style="color:#52525b;">(' + escapeHtml(role || '') + ')</span></div>' +
      '<button type="button" id="btnAdminLogout" style="width:100%;padding:8px;border-radius:6px;' +
      'border:1px solid #3f3f46;background:#18181b;color:#fff;font-weight:800;cursor:pointer;">로그아웃</button>';

    sidebar.appendChild(footer);
    footer.querySelector('#btnAdminLogout').addEventListener('click', function () {
      if (confirm('관리자 세션을 종료하시겠습니까?')) {
        signOut();
      }
    });
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function guardAdminPage() {
    if (isLoginPage()) return { ok: true, skipped: true };

    var sb = getClient();
    var sessionRes = await sb.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;

    if (!session) {
      console.warn('[AdminAuth] 세션 없음 → 로그인 페이지');
      redirect(LOGIN_PAGE + '?redirect=' + encodeURIComponent(getCurrentPage()));
      return { ok: false, reason: 'no_session' };
    }

    var roleInfo = await fetchMyRole(sb);
    if (!roleInfo.ok || roleInfo.is_admin !== true) {
      await sb.auth.signOut();
      alert('접근 권한이 없거나 정지된 계정입니다.');
      redirect(LOGIN_PAGE);
      return { ok: false, reason: roleInfo.reason || 'forbidden' };
    }

    var role = roleInfo.role;
    var page = getCurrentPage();
    var menuKey = PAGE_TO_MENU[page];

    applySidebarRBAC(role);

    if (role === ROLES.ADVERTISER && page === DASHBOARD_PAGE) {
      console.log('[AdminAuth] advertiser → 스폰서 홈으로 리다이렉트');
      redirect(SPONSOR_PAGE);
      return { ok: false, reason: 'advertiser_home_redirect' };
    }

    if (menuKey && !canAccessMenu(role, menuKey)) {
      console.warn('[AdminAuth] 페이지 접근 거부:', page, 'role=', role);
      alert('이 메뉴에 대한 접근 권한이 없습니다.');
      redirect(getForbiddenFallbackPage(role));
      return { ok: false, reason: 'page_forbidden' };
    }

    return { ok: true, roleInfo: roleInfo };
  }

  /**
   * super 전용 — Edge Function으로 Auth + user_roles 발급
   */
  async function provisionStaffAccount(payload) {
    var sb = getClient();
    var roleInfo = await fetchMyRole(sb);
    if (roleInfo.role !== ROLES.SUPER) {
      return { ok: false, reason: 'forbidden', message: '최고 관리자만 계정을 발급할 수 있습니다.' };
    }

    console.log('[AdminAuth] 관리자 발급 요청:', payload.email, payload.mode);

    var invokeRes = await sb.functions.invoke('admin-provision-user', { body: payload });

    if (invokeRes.error) {
      console.warn('[AdminAuth] Edge Function 실패 — RPC fallback:', invokeRes.error);
      return fallbackProvisionStaff(sb, payload, invokeRes.error);
    }

    var data = invokeRes.data;
    if (!data || data.ok !== true) {
      console.warn('[AdminAuth] Edge Function 거부:', data);
      return fallbackProvisionStaff(sb, payload, data);
    }

    console.log('[AdminAuth] ✅ 발급 완료:', data);
    return { ok: true, data: data, via: 'edge_function' };
  }

  async function fallbackProvisionStaff(sb, payload, priorError) {
    var rpcRes = await sb.rpc('admin_provision_staff', {
      p_email: payload.email,
      p_display_name: payload.display_name,
      p_department: payload.department,
      p_role: payload.role,
      p_status: payload.status,
    });

    if (rpcRes.error || !rpcRes.data || rpcRes.data.ok !== true) {
      return {
        ok: false,
        reason: 'provision_failed',
        message: (rpcRes.error && rpcRes.error.message) || '저장에 실패했습니다.',
        priorError: priorError,
      };
    }

    return {
      ok: true,
      data: rpcRes.data,
      via: 'rpc_only',
      warning:
        'user_roles는 저장되었으나 Auth 계정 생성은 Edge Function(admin-provision-user) 배포 후 가능합니다.',
    };
  }

  async function initLoginPage() {
    if (!isLoginPage()) return;

    var sb = getClient();
    var sessionRes = await sb.auth.getSession();
    if (sessionRes.data && sessionRes.data.session) {
      var verify = await verifyStaffAfterAuth(sb);
      if (verify.ok) {
        var params = new URLSearchParams(window.location.search);
        redirect(getPostLoginUrl(verify.roleInfo.role, params.get('redirect')));
      }
    }

    var params = new URLSearchParams(window.location.search);
    var redirectTo = params.get('redirect');
    if (redirectTo && PAGE_TO_MENU[redirectTo]) {
      window.__pickleAdminRedirect = redirectTo;
    }
  }

  function boot() {
    if (isLoginPage()) {
      initLoginPage().catch(function (err) {
        console.error('[AdminAuth] login init 실패', err);
      });
      return;
    }

    guardAdminPage().catch(function (err) {
      console.error('[AdminAuth] guard 실패', err);
      alert('인증 확인 중 오류가 발생했습니다.');
      redirect(LOGIN_PAGE);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.PickleAdminWorkspace = {
    ROLES: ROLES,
    MENU_ACCESS: MENU_ACCESS,
    PAGE_TO_MENU: PAGE_TO_MENU,
    getClient: getClient,
    fetchMyRole: fetchMyRole,
    loginWithPassword: loginWithPassword,
    signOut: signOut,
    guardAdminPage: guardAdminPage,
    applySidebarRBAC: applySidebarRBAC,
    canAccessMenu: canAccessMenu,
    provisionStaffAccount: provisionStaffAccount,
    getDefaultLandingPage: getDefaultLandingPage,
    getPostLoginUrl: getPostLoginUrl,
  };

  // pickle-penalties 등 기존 모듈 호환
  window.PickleAdminAuth = {
    fetchMyAdminRole: fetchMyRole,
    diagnoseManualPenaltyAccess: async function (sb) {
      var roleInfo = await fetchMyRole(sb);
      var sessionRes = await (sb || getClient()).auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      return {
        hasSession: !!session,
        sessionEmail: session && session.user ? session.user.email : null,
        roleInfo: roleInfo,
        canProceed: roleInfo.ok === true && roleInfo.is_admin === true,
      };
    },
  };
})();
