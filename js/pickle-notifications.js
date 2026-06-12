/**
 * P!CKLE — 알림 (Supabase notifications 연동)
 *
 * · 종 아이콘 빨간 점 · notifications.html · Realtime 배지 갱신
 * · comment 알림: DB 트리거 즉시 생성
 * · end / honor 알림: pg_cron 1분 배치 (최대 1분 지연 — 서비스 정책상 허용)
 */
(function () {
  'use strict';

  var STYLE_ID = 'pickle-notifications-styles';
  var boundBells = false;
  var realtimeChannel = null;
  var realtimeUserId = null;

  var TYPE_META = {
    comment: { icon: '💬', css: 'type-comment' },
    vote: { icon: '🗳️', css: 'type-vote' },
    end: { icon: '⏳', css: 'type-end' },
    honor: { icon: '🏅', css: 'type-honor' },
    mypick: { icon: '✔️', css: 'type-mypick' },
    result: { icon: '🏆', css: 'type-result' },
    system: { icon: '📢', css: 'type-system' },
  };

  function getClient() {
    if (!window.PickleSupabase || !window.PickleSupabase.getClient) {
      return null;
    }
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
      '  content: "" !important;' +
      '  display: block !important;' +
      '  position: absolute;' +
      '  top: 0;' +
      '  right: 0;' +
      '  width: 10px;' +
      '  height: 10px;' +
      '  background: #ff0033;' +
      '  border-radius: 50%;' +
      '  border: 2px solid var(--bg-color, #09090b);' +
      '  box-shadow: 0 0 8px rgba(255, 0, 51, 0.85);' +
      '  pointer-events: none;' +
      '}';
    document.head.appendChild(style);
  }

  async function ensureAuthReady() {
    if (window.PickleAuth && window.PickleAuth.init) {
      await window.PickleAuth.init();
      if (window.PickleAuth.isLoggedIn()) {
        return window.PickleAuth.getUser();
      }
    }

    var sb = getClient();
    if (!sb) return null;

    var result = await sb.auth.getUser();
    return result.data && result.data.user ? result.data.user : null;
  }

  async function fetchUnreadCount(userId) {
    var sb = getClient();
    if (!sb || !userId) return 0;

    var res = await sb
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (res.error) {
      console.warn('[P!CKLE Notifications] unread count', res.error);
      return 0;
    }

    return res.count || 0;
  }

  async function fetchNotifications(userId, limit) {
    var sb = getClient();
    if (!sb || !userId) return [];

    var res = await sb
      .from('notifications')
      .select('id, type, message, link_url, is_read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit || 50);

    if (res.error) {
      throw res.error;
    }

    return res.data || [];
  }

  async function markAsRead(notificationId, userId) {
    var sb = getClient();
    if (!sb || !notificationId || !userId) return { ok: false };

    var res = await sb
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .eq('is_read', false);

    if (res.error) {
      console.warn('[P!CKLE Notifications] markAsRead', res.error);
      return { ok: false, error: res.error };
    }

    return { ok: true };
  }

  async function markAllAsRead(userId) {
    var sb = getClient();
    if (!sb || !userId) return { ok: false };

    var res = await sb
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (res.error) {
      console.warn('[P!CKLE Notifications] markAllAsRead', res.error);
      return { ok: false, error: res.error };
    }

    return { ok: true };
  }

  function setBellUnreadState(hasUnread) {
    document.querySelectorAll('.noti-bell').forEach(function (bell) {
      if (hasUnread) {
        bell.classList.add('noti-bell--unread');
        bell.setAttribute('aria-label', '읽지 않은 알림 있음');
      } else {
        bell.classList.remove('noti-bell--unread');
        bell.setAttribute('aria-label', '알림');
      }
      bell.removeAttribute('data-count');
    });
  }

  async function refreshBellBadge() {
    injectStyles();

    try {
      var user = await ensureAuthReady();
      if (!user) {
        setBellUnreadState(false);
        return 0;
      }

      var count = await fetchUnreadCount(user.id);
      setBellUnreadState(count > 0);
      return count;
    } catch (err) {
      console.warn('[P!CKLE Notifications] refreshBellBadge', err);
      setBellUnreadState(false);
      return 0;
    }
  }

  function goToNotifications(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    ensureAuthReady().then(function (user) {
      if (!user) {
        if (window.PickleAuth && window.PickleAuth.goToLogin) {
          window.PickleAuth.goToLogin({ redirect: 'notifications.html' });
        } else {
          window.location.href = 'login.html?redirect=notifications.html';
        }
        return;
      }
      window.location.href = 'notifications.html';
    });
  }

  function bindBellIcons() {
    if (boundBells) return;
    boundBells = true;

    document.querySelectorAll('.noti-bell').forEach(function (bell) {
      if (bell.dataset.pickleNotiBound === '1') return;
      bell.dataset.pickleNotiBound = '1';

      if (!bell.getAttribute('role')) bell.setAttribute('role', 'button');
      if (!bell.hasAttribute('tabindex')) bell.setAttribute('tabindex', '0');
      if (!bell.getAttribute('aria-label')) bell.setAttribute('aria-label', '알림');

      bell.removeAttribute('onclick');
      bell.addEventListener('click', goToNotifications);
      bell.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          goToNotifications(ev);
        }
      });
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
    if (diffSec < 604800) return Math.floor(diffSec / 86400) + '일 전';

    var d = new Date(iso);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return m + '월 ' + day + '일';
  }

  function getTypeMeta(type) {
    return TYPE_META[type] || TYPE_META.system;
  }

  function teardownRealtime() {
    if (!realtimeChannel) return;
    try {
      var sb = getClient();
      if (sb) sb.removeChannel(realtimeChannel);
    } catch (_) {
      /* ignore */
    }
    realtimeChannel = null;
    realtimeUserId = null;
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
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: 'user_id=eq.' + userId,
        },
        function () {
          refreshBellBadge();
          document.dispatchEvent(new CustomEvent('pickle:notification-insert'));
        }
      )
      .subscribe(function (status) {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[P!CKLE Notifications] Realtime 구독 실패');
        }
      });
  }

  async function initBell() {
    injectStyles();
    bindBellIcons();

    var user = await ensureAuthReady();
    if (user) {
      subscribeRealtime(user.id);
    } else {
      teardownRealtime();
    }

    await refreshBellBadge();
  }

  window.PickleNotifications = {
    TYPE_META: TYPE_META,
    getTypeMeta: getTypeMeta,
    formatRelativeTime: formatRelativeTime,
    escapeHtml: escapeHtml,
    fetchUnreadCount: fetchUnreadCount,
    fetchNotifications: fetchNotifications,
    markAsRead: markAsRead,
    markAllAsRead: markAllAsRead,
    refreshBellBadge: refreshBellBadge,
    goToNotifications: goToNotifications,
    bindBellIcons: bindBellIcons,
    subscribeRealtime: subscribeRealtime,
    teardownRealtime: teardownRealtime,
    init: initBell,
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.querySelector('.noti-bell')) return;
    initBell();
  });

  window.addEventListener('pageshow', function () {
    if (document.querySelector('.noti-bell')) {
      refreshBellBadge();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && document.querySelector('.noti-bell')) {
      refreshBellBadge();
    }
  });
})();
