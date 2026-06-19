/**
 * P!CKLE — 어드민 세션·user_roles 권한 조회 (user_app / admin 공용 RPC)
 * admin_web 페이지는 js/admin-auth.js (PickleAdminWorkspace) 사용
 */
(function () {
  'use strict';

  function getClient(sb) {
    if (sb) return sb;
    if (typeof window.getPickleSupabaseClient === 'function') {
      return window.getPickleSupabaseClient();
    }
    if (window.supabaseClient) return window.supabaseClient;
    throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
  }

  async function fetchMyAdminRole(sb) {
    if (window.PickleAdminWorkspace && window.PickleAdminWorkspace.fetchMyRole) {
      return window.PickleAdminWorkspace.fetchMyRole(sb);
    }

    var client = getClient(sb);
    var res = await client.rpc('pickle_get_my_user_role');

    if (res.error) {
      console.error('[P!CKLE AdminAuth] 역할 RPC HTTP 오류:', {
        message: res.error.message,
        details: res.error.details,
        hint: res.error.hint,
        code: res.error.code,
      });
      return { ok: false, is_admin: false, reason: 'rpc_error', error: res.error };
    }

    return res.data || { ok: false, is_admin: false };
  }

  async function diagnoseManualPenaltyAccess(sb) {
    var client = getClient(sb);
    var sessionRes = await client.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    var roleInfo = await fetchMyAdminRole(client);

    return {
      hasSession: !!session,
      sessionEmail: session && session.user ? session.user.email : null,
      roleInfo: roleInfo,
      canProceed: roleInfo.ok === true && roleInfo.is_admin === true,
    };
  }

  window.PickleAdminAuth = {
    fetchMyAdminRole: fetchMyAdminRole,
    diagnoseManualPenaltyAccess: diagnoseManualPenaltyAccess,
  };
})();
