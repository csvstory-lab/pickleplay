/**
 * P!CKLE — 어드민 세션·user_roles 권한 조회 (RPC 기반, 406 방지)
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

  /**
   * pickle_get_my_user_role RPC — user_roles 직접 SELECT 대체
   * @returns {Promise<{ ok: boolean, is_admin?: boolean, role?: string, email?: string, mode?: string, reason?: string }>}
   */
  async function fetchMyAdminRole(sb) {
    var client = getClient(sb);
    var res = await client.rpc('pickle_get_my_user_role');

    if (res.error) {
      console.error('[P!CKLE AdminAuth] 역할 RPC HTTP 오류:', {
        message: res.error.message,
        details: res.error.details,
        hint: res.error.hint,
        code: res.error.code,
        status: res.error.status,
      });
      return { ok: false, is_admin: false, reason: 'rpc_error', error: res.error };
    }

    var payload = res.data || {};
    console.log('[P!CKLE AdminAuth] 내 관리자 역할:', payload);
    return payload;
  }

  /**
   * 수동 제재 RPC 호출 전 세션·권한 진단
   */
  async function diagnoseManualPenaltyAccess(sb) {
    var client = getClient(sb);
    var sessionRes = await client.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    var roleInfo = await fetchMyAdminRole(client);

    var diagnosis = {
      hasSession: !!session,
      sessionEmail: session && session.user ? session.user.email : null,
      roleInfo: roleInfo,
      canProceed:
        roleInfo.ok === true &&
        (roleInfo.is_admin === true || roleInfo.mode === 'anon_admin_workspace'),
    };

    if (!diagnosis.canProceed) {
      console.warn('[P!CKLE AdminAuth] ⚠️ 수동 제재 권한 없음 — 일반 유저 세션이 어드민과 공유 중일 수 있음', diagnosis);
    }

    return diagnosis;
  }

  window.PickleAdminAuth = {
    fetchMyAdminRole: fetchMyAdminRole,
    diagnoseManualPenaltyAccess: diagnoseManualPenaltyAccess,
  };
})();
