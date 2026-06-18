/**
 * P!CKLE — 알림 (Supabase notifications + 제재 내역 통합 연동판 완결본)
 */
(function () {
  'use strict';

  var STYLE_ID = 'pickle-notifications-styles';
  var boundBells = false;
  var bellInitialized = false;
  var realtimeChannel = null;
  var realtimeUserId = null;

  var TYPE_META = {
    comment: { icon: '💬', css: 'type-comment' },
    reply: { icon: '↩️', css: 'type-reply' },
    vote: { icon: '🗳️', css: 'type-vote' },
    end: { icon: '⏳', css: 'type-end' },
    honor: { icon: '🏅', css: 'type-honor' },
    mypick: { icon: '✔️', css: 'type-mypick' },
    result: { icon: '🏆', css: 'type-result' },
    system: { icon: '📢', css: 'type-system' },
    penalty: { icon: '🚨', css: 'type-penalty' } // 💡 제재 알림 아이콘
  };

  function getClient() {
    if (!window.PickleSupabase || !window.PickleSupabase.getClient) return null;
    return window.PickleSupabase.getClient();
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.noti-bell::after { content: none !important; display: none !important; }' +
      '.noti-bell.noti-bell--unread::after {' +
      '  content: attr(data-unread-count) !important;' +
      '  display: flex !important;' +
      '  align-items: center;' +
      '  justify-content: center;' +
      '  position: absolute;' +
      '  top: -5px;' +
      '  right: -7px;' +
      '  min-width: 17px;' +
      '  height: 17px;' +
      '  padding: 0 4px;' +
      '  background: #ff0033;' +
      '  color: #fff;' +
      '  font-size: 0.58rem;' +
      '  font-weight: 900;' +
      '  line-height: 1;' +
      '  border-radius: 999px;' +
      '  border: 2px solid var(--bg-color, #09090b);' +
      '  box-shadow: 0 0 8px rgba(255, 0, 51, 0.85);' +
      '  pointer-events: none;' +
      '  font-family: "Pretendard", sans-serif;' +
      '}';
    document.head.appendChild(style);
  }

  async function ensureAuthReady() {
    if (window.PickleAuth && window.PickleAuth.ensureAuthenticated) {
      var auth = await window.PickleAuth.ensureAuthenticated({ skipProfile: true });
      return auth && auth.user ? auth.user : null;
    }
    if (window.PickleAuth && window.PickleAuth.getUserWhenReady) {
      return window.PickleAuth.getUserWhenReady();
    }
    var sb = getClient();
    if (!sb) return null;
    var sessionResult = await sb.auth.getSession();
    return sessionResult.data?.session?.user ?? null;
  }

  async function fetchUnreadPenaltyCount(userId) {
    var sb = getClient();
    if (!sb || !userId) return 0;
    var res = await sb.from('penalty_logs').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false);
    return res.error ? 0 : (res.count || 0);
  }

  async function fetchUnreadCount(userId) {
    var sb = getClient();
    if (!sb || !userId) return 0;
    var res = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false);
    return res.error ? 0 : (res.count || 0);
  }

  async function fetchNotifications(userId, limit) {
    var sb = getClient();
    if (!sb || !userId) return [];
    var targetLimit = limit || 50;

    var resNotif = await sb.from('notifications').select('id, type, message, link_url, is_read, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(targetLimit);
    var resPenalty = await sb.from('penalty_logs').select('id, penalty_type, reason, points_added, is_read, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(targetLimit);

    var notifs = resNotif.data || [];
    var penalties = resPenalty.data || [];

    var mappedPenalties = penalties.map(function (p) {
      return {
        id: 'penalty_' + p.id,
        type: 'penalty',
        message: '🚨 클린 규정 제재 안내: [' + p.reason + '] 조치로 벌점 +' + p.points_added + '점이 누적되었습니다.',
        link_url: 'mypage.html',
        is_read: p.is_read,
        created_at: p.created_at
      };
    });

    var combined = notifs.concat(mappedPenalties);
    combined.sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return combined.slice(0, targetLimit);
  }

  async function markAsRead(notificationId, userId) {
    var sb = getClient();
    if (!sb || !notificationId || !userId) return { ok: false };

    if (String(notificationId).startsWith('penalty_')) {
      var realPenaltyId = String(notificationId).replace('penalty_', '');
      var resPen = await sb.from('penalty_logs').update({ is_read: true }).eq('id', realPenaltyId).eq('user_id', userId);
      return resPen.error ? { ok: false } : { ok: true };
    }

    var res = await sb.from('notifications').update({ is_read: true }).eq('id', notificationId).eq('user_id', userId);
    return res.error ? { ok: false } : { ok: true };
  }

  async function markAllAsRead(userId) {
    var sb = getClient();
    if (!sb || !userId) return { ok: false };
    await sb.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
    await sb.from('penalty_logs').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
    return { ok: true };
  }

  function setBellUnreadState(totalCount) {
    var count = Number(totalCount) || 0;
    var badgeLabel = count > 99 ? '99+' : String(count);

    document.querySelectorAll('.noti-bell').forEach(function (bell) {
      if (count > 0) {
        bell.classList.add('noti-bell--unread');
        bell.setAttribute('data-unread-count', badgeLabel);
        bell.setAttribute('aria-label', '읽지 않은 알림 ' + count + '건');
      } else {
        bell.classList.remove('noti-bell--unread');
        bell.removeAttribute('data-unread-count');
        bell.setAttribute('aria-label', '알림');
      }
    });
  }

  async function refreshBellBadge() {
    injectStyles();
    try {
      var user = await ensureAuthReady();
      if (!user) { setBellUnreadState(0); return 0; }
      var notifCount = await fetchUnreadCount(user.id);
      var penaltyCount = await fetchUnreadPenaltyCount(user.id);
      setBellUnreadState(notifCount + penaltyCount);
      return notifCount + penaltyCount;
    } catch (err) {
      setBellUnreadState(0);
      return 0;
    }
  }

  function goToNotifications(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    window.location.href = 'notifications.html';
  }

  function bindBellIcons() {
    if (boundBells) return;
    boundBells = true;
    document.querySelectorAll('.noti-bell').forEach(function (bell) {
      if (bell.dataset.pickleNotiBound === '1') return;
      bell.dataset.pickleNotiBound = '1';
      bell.removeAttribute('onclick');
      bell.addEventListener('click', goToNotifications);
    });
  }

  function formatRelativeTime(iso) {
    if (!iso) return '';
    var then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    var diffSec = Math.floor((Date.now() - then) / 1000);
    if (diffSec < 60) return '방금 전';
    if (diffSec < 3600) return Math.floor(diffSec / 60) + '분 전';
    if (diffSec < 86400) return Math.floor(diffSec / 3600) + '시간 전';
    return new Date(iso).toLocaleDateString('ko-KR');
  }

  function getTypeMeta(type) {
    return TYPE_META[type] || TYPE_META.system;
  }

  function subscribeRealtime(userId) {
    var sb = getClient();
    if (!sb || !userId) return;
    if (realtimeUserId === userId && realtimeChannel) return;

    teardownRealtime();
    realtimeUserId = userId;
    realtimeChannel = sb
      .channel('pickle-notifications-' + userId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + userId },
        function () { refreshBellBadge(); }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'penalty_logs', filter: 'user_id=eq.' + userId },
        function () { refreshBellBadge(); }
      )
      .subscribe();
  }

  function teardownRealtime() {
    if (!realtimeChannel) return;
    try {
      var sb = getClient();
      if (sb) sb.removeChannel(realtimeChannel);
    } catch (_) {}
    realtimeChannel = null;
    realtimeUserId = null;
  }

  async function initBell() {
    if (bellInitialized || window.__PICKLE_NOTI_BELL_INIT__) return;
    bellInitialized = true;
    window.__PICKLE_NOTI_BELL_INIT__ = true;

    injectStyles();
    bindBellIcons();
    var user = await ensureAuthReady();
    if (user) subscribeRealtime(user.id);
    await refreshBellBadge();
  }

  // 💡 [핵심 교정] 외부 파일(notifications-page.js)이 정상 구동할 수 있도록 누락되었던 핵심 유틸 도구들을 주머니에 전부 다시 채워 넣었습니다.
  window.PickleNotifications = {
    TYPE_META: TYPE_META,
    getTypeMeta: getTypeMeta,
    formatRelativeTime: formatRelativeTime,
    escapeHtml: escapeHtml,
    fetchUnreadCount: fetchUnreadCount,
    fetchUnreadPenaltyCount: fetchUnreadPenaltyCount,
    fetchNotifications: fetchNotifications,
    markAsRead: markAsRead,
    markAllAsRead: markAllAsRead,
    refreshBellBadge: refreshBellBadge,
    goToNotifications: goToNotifications,
    bindBellIcons: bindBellIcons,
    subscribeRealtime: subscribeRealtime,
    teardownRealtime: teardownRealtime,
    init: initBell
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.querySelector('.noti-bell')) return;
    initBell();
  });
})();