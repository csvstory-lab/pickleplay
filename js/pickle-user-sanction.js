/**
 * P!CKLE — 유저 제재 상태 검사 (영구 정지 / 기간 정지)
 */
(function () {
  'use strict';

  var PERMANENT_BAN_ALERT =
    '이 계정은 클린 커뮤니티 정책 위반으로 영구 정지되었습니다.';

  function getSupabaseClient(supabase) {
    if (supabase) return supabase;
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    return null;
  }

  function formatRestrictedUntil(value) {
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    return y + '년 ' + m + '월 ' + day + '일 ' + h + '시';
  }

  function isRestrictedActive(restrictedUntil) {
    if (!restrictedUntil) return false;
    var until = new Date(restrictedUntil);
    if (Number.isNaN(until.getTime())) return false;
    return until.getTime() > Date.now();
  }

  /**
   * 댓글 등록 직전 — DB에서 최신 제재 상태 재조회 (디버깅 로그 포함)
   * @returns {Promise<{ blocked: boolean, userData?: object, error?: object }>}
   */
  async function checkCommentSubmitSanction(currentUser, supabase) {
    if (!currentUser || !currentUser.id) {
      return { blocked: false };
    }

    var sb = getSupabaseClient(supabase);
    if (!sb) {
      console.warn('[P!CKLE UserSanction] Supabase 클라이언트 없음');
      return { blocked: false };
    }

    // 현재 유저의 상태를 DB에서 확실하게 다시 가져와서 확인
    var result = await sb
      .from('users')
      .select('is_banned, restricted_until')
      .eq('id', currentUser.id)
      .single();

    var userData = result.data;
    var error = result.error;

    if (error) {
      console.error('현재 유저의 DB 제재 상태 조회 실패:', error);
      return { blocked: false, error: error };
    }

    console.log('현재 유저의 DB 제재 상태:', userData);

    var restrictedActive =
      userData &&
      userData.restricted_until &&
      new Date(userData.restricted_until) > new Date();

    if (userData && (userData.is_banned === true || restrictedActive)) {
      console.log('경고! 차단 대상 유저입니다.');
      alert('제재된 유저입니다.');
      return { blocked: true, userData: userData };
    }

    return { blocked: false, userData: userData };
  }

  async function fetchUserSanctionRow(userId, supabase) {
    if (!userId) return null;

    var sb = getSupabaseClient(supabase);
    if (!sb) return null;

    var result = await sb
      .from('users')
      .select('is_banned, restricted_until')
      .eq('id', userId)
      .single();

    if (result.error) {
      console.warn('[P!CKLE UserSanction] 제재 상태 조회 실패', result.error);
      return null;
    }

    return result.data || null;
  }

  /**
   * @returns {Promise<boolean>} true면 차단됨(alert 표시)
   */
  async function blockIfUserSanctioned(userId, supabase) {
    var row = await fetchUserSanctionRow(userId, supabase);
    if (!row) return false;

    if (row.is_banned === true) {
      alert(PERMANENT_BAN_ALERT);
      return true;
    }

    if (isRestrictedActive(row.restricted_until)) {
      alert(
        '정지된 유저입니다. ' +
          formatRestrictedUntil(row.restricted_until) +
          '까지 이용이 제한됩니다.'
      );
      return true;
    }

    return false;
  }

  window.PickleUserSanction = {
    formatRestrictedUntil: formatRestrictedUntil,
    checkCommentSubmitSanction: checkCommentSubmitSanction,
    fetchUserSanctionRow: fetchUserSanctionRow,
    blockIfUserSanctioned: blockIfUserSanctioned,
  };
})();
