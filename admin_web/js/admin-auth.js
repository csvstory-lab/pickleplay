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

  var ROLE_LABELS = {
    super: '최고관리자',
    marketer: '마케터',
    cs: 'CS 매니저',
    account: '재무/정산',
    advertiser: '광고주',
  };

  var headerUiInitialized = false;

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
      ' <span style="color:#52525b;">(' + escapeHtml(getRoleLabel(role || '')) + ')</span></div>' +
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

  function getRoleLabel(role) {
    return ROLE_LABELS[role] || role || '관리자';
  }

  function resolveDisplayName(roleInfo, user) {
    var fromRole = roleInfo && roleInfo.display_name ? String(roleInfo.display_name).trim() : '';
    var meta = user && user.user_metadata ? user.user_metadata : {};
    var fromMeta =
      (meta.display_name && String(meta.display_name).trim()) ||
      (meta.full_name && String(meta.full_name).trim()) ||
      (meta.name && String(meta.name).trim()) ||
      '';
    var fromEmail =
      user && user.email ? String(user.email).split('@')[0] : '';
    return fromRole || fromMeta || fromEmail || '관리자';
  }

  function getAvatarInitial(name) {
    var text = String(name || 'A').trim();
    return text ? text.charAt(0).toUpperCase() : 'A';
  }

  function injectAdminHeaderAssets() {
    if (!document.querySelector('link[href*="admin-header.css"]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'css/admin-header.css';
      document.head.appendChild(link);
    }
  }

  var HEADER_USER_BLOCK =
    '<div class="admin-profile admin-header-user" id="adminHeaderUser">' +
    '<button type="button" class="admin-header-user-btn" id="btnHeaderUserMenu" aria-haspopup="true" aria-expanded="false">' +
    '<span id="header-user-info"></span><span class="admin-header-caret">▾</span></button>' +
    '<div class="admin-avatar" id="header-user-avatar">A</div>' +
    '<div class="admin-header-dropdown" id="headerUserDropdown" hidden>' +
    '<button type="button" class="admin-header-menu-item" id="btnHeaderChangePassword">🔐 비밀번호 변경</button>' +
    '<button type="button" class="admin-header-menu-item admin-header-menu-logout" id="btnHeaderLogout">로그아웃</button>' +
    '</div></div>';

  function ensureAdminHeaderSlot() {
    if (document.getElementById('header-user-info')) return;

    var header = document.querySelector('header.top-header');
    if (!header) return;

    var wrap = document.createElement('div');
    wrap.innerHTML = HEADER_USER_BLOCK;
    var block = wrap.firstElementChild;
    if (block) header.appendChild(block);
  }

  function ensureMyPasswordModal() {
    if (document.getElementById('myPasswordModal')) return;

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="modal-overlay" id="myPasswordModal" aria-hidden="true">' +
      '<div class="modal-container" role="dialog" aria-labelledby="myPasswordModalTitle">' +
      '<div class="modal-header">' +
      '<h3 class="modal-title" id="myPasswordModalTitle">🔐 내 비밀번호 변경</h3>' +
      '<button type="button" class="btn-close-my-pw" id="btnCloseMyPasswordModal" style="background:none;border:none;color:#71717a;font-size:1.4rem;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div class="modal-body">' +
      '<form id="myPasswordForm">' +
      '<label for="myNewPassword">새 비밀번호 (8자 이상)</label>' +
      '<input type="password" id="myNewPassword" minlength="8" autocomplete="new-password" required>' +
      '<label for="myConfirmPassword">새 비밀번호 확인</label>' +
      '<input type="password" id="myConfirmPassword" minlength="8" autocomplete="new-password" required>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn-modal-cancel" id="btnCancelMyPassword">취소</button>' +
      '<button type="submit" class="btn-modal-save" id="btnSaveMyPassword">저장</button>' +
      '</div></form></div></div></div>';

    document.body.appendChild(wrap.firstElementChild);
  }

  function renderAdminHeaderInfo(roleInfo, user) {
    ensureAdminHeaderSlot();
    injectAdminHeaderAssets();

    var infoEl = document.getElementById('header-user-info');
    if (!infoEl) return;

    var role = roleInfo && roleInfo.role ? roleInfo.role : '';
    var roleLabel = getRoleLabel(role);
    var displayName = resolveDisplayName(roleInfo, user);

    infoEl.textContent = roleLabel + ' ' + displayName + ' 님';

    var avatarEl = document.getElementById('header-user-avatar');
    if (avatarEl) avatarEl.textContent = getAvatarInitial(displayName);
  }

  function closeHeaderDropdown() {
    var dropdown = document.getElementById('headerUserDropdown');
    var btn = document.getElementById('btnHeaderUserMenu');
    if (dropdown) dropdown.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function openMyPasswordModal() {
    closeHeaderDropdown();
    ensureMyPasswordModal();
    var modal = document.getElementById('myPasswordModal');
    var p1 = document.getElementById('myNewPassword');
    var p2 = document.getElementById('myConfirmPassword');
    if (p1) p1.value = '';
    if (p2) p2.value = '';
    if (modal) {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeMyPasswordModal() {
    var modal = document.getElementById('myPasswordModal');
    if (modal) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  async function submitMyPasswordChange(e) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
      e.stopPropagation();
    }

    var p1 = document.getElementById('myNewPassword');
    var p2 = document.getElementById('myConfirmPassword');
    var saveBtn = document.getElementById('btnSaveMyPassword');
    var password = p1 ? p1.value : '';
    var confirm = p2 ? p2.value : '';

    if (password.length < 8) {
      alert('❌ 새 비밀번호는 8자 이상이어야 합니다.');
      return false;
    }
    if (password !== confirm) {
      alert('❌ 비밀번호 확인이 일치하지 않습니다.');
      return false;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중…';
    }

    try {
      var sb = getClient();
      var res = await sb.auth.updateUser({ password: password });
      if (res.error) throw res.error;

      closeMyPasswordModal();
      alert('✅ 비밀번호가 변경되었습니다.\n다음 로그인부터 새 비밀번호를 사용해 주세요.');
      return true;
    } catch (err) {
      console.error('[AdminAuth] submitMyPasswordChange', err);
      alert('❌ 비밀번호 변경 실패\n\n' + (err.message || String(err)));
      return false;
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '저장';
      }
    }
  }

  function setupAdminHeaderUI(roleInfo, user) {
    injectAdminHeaderAssets();
    ensureAdminHeaderSlot();
    ensureMyPasswordModal();
    renderAdminHeaderInfo(roleInfo, user);

    if (headerUiInitialized) return;
    headerUiInitialized = true;

    document.addEventListener('click', function (e) {
      var menuBtn = document.getElementById('btnHeaderUserMenu');
      var dropdown = document.getElementById('headerUserDropdown');
      var userWrap = document.getElementById('adminHeaderUser');

      if (menuBtn && (e.target === menuBtn || menuBtn.contains(e.target))) {
        e.preventDefault();
        e.stopPropagation();
        if (!dropdown) return;
        var willOpen = dropdown.hidden;
        dropdown.hidden = !willOpen;
        menuBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        return;
      }

      if (userWrap && !userWrap.contains(e.target)) {
        closeHeaderDropdown();
      }
    });

    document.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'btnHeaderChangePassword') {
        e.preventDefault();
        e.stopPropagation();
        openMyPasswordModal();
      }
      if (e.target && e.target.id === 'btnHeaderLogout') {
        e.preventDefault();
        e.stopPropagation();
        closeHeaderDropdown();
        if (confirm('관리자 세션을 종료하시겠습니까?')) {
          signOut();
        }
      }
    });

    document.addEventListener('click', function (e) {
      if (e.target && (e.target.id === 'btnCloseMyPasswordModal' || e.target.id === 'btnCancelMyPassword')) {
        e.preventDefault();
        closeMyPasswordModal();
      }
      if (e.target && e.target.id === 'myPasswordModal') {
        closeMyPasswordModal();
      }
    });

    document.addEventListener('submit', function (e) {
      if (e.target && e.target.id === 'myPasswordForm') {
        submitMyPasswordChange(e);
      }
    });
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
    setupAdminHeaderUI(roleInfo, session.user);

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
    getRoleLabel: getRoleLabel,
    renderAdminHeaderInfo: renderAdminHeaderInfo,
    setupAdminHeaderUI: setupAdminHeaderUI,
    openMyPasswordModal: openMyPasswordModal,
    submitMyPasswordChange: submitMyPasswordChange,
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
