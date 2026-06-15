/**
 * P!CKLE — notifications.html 알림 목록 페이지
 */
(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function getApi() {
    if (!window.PickleNotifications) {
      throw new Error('PickleNotifications 모듈을 불러오지 못했습니다.');
    }
    return window.PickleNotifications;
  }

  function isOAuthCallback() {
    return (
      window.location.hash.includes('access_token=') ||
      window.location.hash.includes('type=recovery') ||
      (window.PickleOAuthCallbackGuard &&
        window.PickleOAuthCallbackGuard.shouldSuppressLoginAlert &&
        window.PickleOAuthCallbackGuard.shouldSuppressLoginAlert())
    );
  }

  async function requireUser() {
    if (window.PickleAuth && window.PickleAuth.getUserWhenReady) {
      var user = await window.PickleAuth.getUserWhenReady();
      if (!user) {
        if (isOAuthCallback()) return null;
        window.PickleAuth.goToLogin({ redirect: 'notifications.html' });
        return null;
      }
      return user;
    }

    if (window.PickleAuth && window.PickleAuth.init) {
      await window.PickleAuth.init();
      if (!window.PickleAuth.isLoggedIn()) {
        if (isOAuthCallback()) return null;
        window.PickleAuth.goToLogin({ redirect: 'notifications.html' });
        return null;
      }
      return window.PickleAuth.getUser();
    }

    if (window.PickleOAuthCallbackGuard?.waitForOAuthSession) {
      await window.PickleOAuthCallbackGuard.waitForOAuthSession();
    }

    var sb = window.PickleSupabase.getClient();
    var sessionResult = await sb.auth.getSession();
    if (sessionResult.data && sessionResult.data.session && sessionResult.data.session.user) {
      return sessionResult.data.session.user;
    }
    if (isOAuthCallback()) return null;
    window.location.href = 'login.html?redirect=notifications.html';
    return null;
  }

  function renderEmpty() {
    var list = $('notiPageList');
    if (!list) return;
    list.innerHTML =
      '<li class="noti-page-empty">' +
      '<div class="noti-page-empty-icon">🔕</div>' +
      '<p class="noti-page-empty-title">아직 알림이 없어요</p>' +
      '<p class="noti-page-empty-desc">불판에 참여하면 여기에 소식이 쌓여요!</p>' +
      '</li>';
  }

  function renderError(message) {
    var list = $('notiPageList');
    if (!list) return;
    list.innerHTML =
      '<li class="noti-page-empty">' +
      '<div class="noti-page-empty-icon">⚠️</div>' +
      '<p class="noti-page-empty-title">알림을 불러오지 못했습니다</p>' +
      '<p class="noti-page-empty-desc">' +
      getApi().escapeHtml(message || '잠시 후 다시 시도해 주세요.') +
      '</p>' +
      '</li>';
  }

  function renderList(items) {
    var list = $('notiPageList');
    if (!list) return;

    if (!items.length) {
      renderEmpty();
      updateUnreadSummary(0);
      return;
    }

    var api = getApi();
    var unread = 0;

    list.innerHTML = items
      .map(function (row) {
        if (!row.is_read) unread += 1;
        var meta = api.getTypeMeta(row.type);
        var unreadClass = row.is_read ? '' : ' unread';
        return (
          '<li class="noti-page-item' +
          unreadClass +
          ' ' +
          meta.css +
          '" data-id="' +
          api.escapeHtml(row.id) +
          '" data-link="' +
          api.escapeHtml(row.link_url || '') +
          '" data-read="' +
          (row.is_read ? '1' : '0') +
          '" tabindex="0" role="button">' +
          '<div class="noti-page-icon">' +
          meta.icon +
          '</div>' +
          '<div class="noti-page-body">' +
          '<p class="noti-page-message">' +
          api.escapeHtml(row.message) +
          '</p>' +
          '<span class="noti-page-time">' +
          api.escapeHtml(api.formatRelativeTime(row.created_at)) +
          '</span>' +
          '</div>' +
          (!row.is_read ? '<span class="noti-page-dot" aria-hidden="true"></span>' : '') +
          '</li>'
        );
      })
      .join('');

    updateUnreadSummary(unread);
    bindItemClicks(items);
  }

  function updateUnreadSummary(count) {
    var el = $('notiUnreadCount');
    if (!el) return;
    if (count > 0) {
      el.textContent = '미읽음 ' + count + '건';
      el.hidden = false;
    } else {
      el.textContent = '';
      el.hidden = true;
    }

    var btn = $('btnMarkAllRead');
    if (btn) btn.disabled = count === 0;
  }

  async function handleItemActivate(itemEl, user) {
    if (!itemEl || !user) return;

    var id = itemEl.getAttribute('data-id');
    var link = itemEl.getAttribute('data-link') || '';
    var isRead = itemEl.getAttribute('data-read') === '1';
    var api = getApi();

    if (!isRead && id) {
      await api.markAsRead(id, user.id);
      itemEl.classList.remove('unread');
      itemEl.setAttribute('data-read', '1');
      var dot = itemEl.querySelector('.noti-page-dot');
      if (dot) dot.remove();
      await api.refreshBellBadge();
      var remaining = document.querySelectorAll('.noti-page-item.unread').length;
      updateUnreadSummary(remaining);
    }

    if (link) {
      window.location.href = link;
    }
  }

  function bindItemClicks(items) {
    var userPromise = requireUser();

    document.querySelectorAll('.noti-page-item').forEach(function (item) {
      item.addEventListener('click', function () {
        userPromise.then(function (user) {
          if (user) handleItemActivate(item, user);
        });
      });
      item.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          userPromise.then(function (user) {
            if (user) handleItemActivate(item, user);
          });
        }
      });
    });
  }

  async function loadNotifications() {
    var list = $('notiPageList');
    if (!list) return;

    list.innerHTML =
      '<li class="noti-page-loading">' +
      '<div class="noti-page-spinner" aria-hidden="true"></div>' +
      '<p>알림을 불러오는 중...</p>' +
      '</li>';

    try {
      var user = await requireUser();
      if (!user) return;

      if (window.PickleNotifications && window.PickleNotifications.subscribeRealtime) {
        window.PickleNotifications.subscribeRealtime(user.id);
      }

      var api = getApi();
      var rows = await api.fetchNotifications(user.id, 80);
      renderList(rows);
    } catch (err) {
      console.error('[P!CKLE Notifications Page]', err);
      renderError(err.message || String(err));
    }
  }

  function bindMarkAllRead() {
    var btn = $('btnMarkAllRead');
    if (!btn) return;

    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        var user = await requireUser();
        if (!user) return;

        var api = getApi();
        await api.markAllAsRead(user.id);
        document.querySelectorAll('.noti-page-item.unread').forEach(function (item) {
          item.classList.remove('unread');
          item.setAttribute('data-read', '1');
          var dot = item.querySelector('.noti-page-dot');
          if (dot) dot.remove();
        });
        updateUnreadSummary(0);
        await api.refreshBellBadge();
      } catch (err) {
        console.error('[P!CKLE Notifications Page] mark all', err);
        alert('모두 읽음 처리에 실패했습니다.');
      } finally {
        btn.disabled = document.querySelectorAll('.noti-page-item.unread').length === 0;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindMarkAllRead();
    loadNotifications();

    document.addEventListener('pickle:notification-insert', function () {
      loadNotifications();
    });
  });
})();
