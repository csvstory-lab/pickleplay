/**
 * P!CKLE — 메인 이벤트 팝업 바텀 시트
 */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'pickle_popup_hide_';
  var rootEl = null;
  var currentPopup = null;

  function getClient() {
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.getClient) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    return null;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 오늘 23:59:59.999 (로컬) 만료 시각 */
  function getTodayDismissExpiryMs() {
    var d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  function isPopupDismissedForToday(popupId) {
    if (!popupId) return true;
    try {
      var key = STORAGE_PREFIX + String(popupId);
      var raw = localStorage.getItem(key);
      if (!raw) return false;
      var expiry = Number(raw);
      if (!Number.isFinite(expiry)) {
        localStorage.removeItem(key);
        return false;
      }
      if (Date.now() < expiry) return true;
      localStorage.removeItem(key);
      return false;
    } catch (e) {
      return false;
    }
  }

  function dismissPopupForToday(popupId) {
    if (!popupId) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + String(popupId), String(getTodayDismissExpiryMs()));
    } catch (e) {
      /* noop */
    }
  }

  function ensureRoot() {
    if (rootEl) return rootEl;

    rootEl = document.createElement('div');
    rootEl.className = 'pickle-popup-root';
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-hidden', 'true');
    rootEl.innerHTML =
      '<div class="pickle-popup-backdrop" data-popup-close></div>' +
      '<div class="pickle-popup-sheet" role="document">' +
      '  <div class="pickle-popup-handle" aria-hidden="true"></div>' +
      '  <h2 class="pickle-popup-title" id="picklePopupTitle"></h2>' +
      '  <a class="pickle-popup-image-wrap" id="picklePopupImageLink" href="#" target="_blank" rel="noopener noreferrer">' +
      '    <img class="pickle-popup-image" id="picklePopupImage" alt="" />' +
      '  </a>' +
      '  <div class="pickle-popup-actions">' +
      '    <button type="button" class="pickle-popup-btn pickle-popup-btn--muted" id="picklePopupBtnHideToday">오늘 하루 보지 않기</button>' +
      '    <button type="button" class="pickle-popup-btn pickle-popup-btn--primary" id="picklePopupBtnClose">닫기</button>' +
      '  </div>' +
      '</div>';

    document.body.appendChild(rootEl);

    rootEl.querySelector('[data-popup-close]').addEventListener('click', closeSheet);
    document.getElementById('picklePopupBtnClose').addEventListener('click', closeSheet);
    document.getElementById('picklePopupBtnHideToday').addEventListener('click', function () {
      if (currentPopup && currentPopup.id) {
        dismissPopupForToday(currentPopup.id);
      }
      closeSheet();
    });

    return rootEl;
  }

  function closeSheet() {
    if (!rootEl) return;
    rootEl.classList.remove('is-open');
    rootEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    currentPopup = null;
  }

  function openSheet(popup) {
    if (!popup || !popup.image_url) return;

    var el = ensureRoot();
    currentPopup = popup;

    var titleEl = document.getElementById('picklePopupTitle');
    var imgEl = document.getElementById('picklePopupImage');
    var linkEl = document.getElementById('picklePopupImageLink');

    var title = String(popup.title || '').trim();
    if (titleEl) {
      titleEl.textContent = title;
      titleEl.style.display = title ? '' : 'none';
    }

    if (imgEl) {
      imgEl.src = popup.image_url;
      imgEl.alt = title || '이벤트 팝업';
    }

    var link = String(popup.link_url || '').trim();
    if (linkEl) {
      if (link) {
        linkEl.href = link;
        linkEl.style.pointerEvents = '';
        linkEl.setAttribute('tabindex', '0');
      } else {
        linkEl.href = '#';
        linkEl.style.pointerEvents = 'none';
        linkEl.setAttribute('tabindex', '-1');
        linkEl.addEventListener(
          'click',
          function (e) {
            e.preventDefault();
          },
          { once: true }
        );
      }
    }

    el.setAttribute('aria-label', title || '이벤트 안내');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(function () {
      el.classList.add('is-open');
    });
  }

  async function fetchActivePopup() {
    var sb = getClient();
    if (!sb) return null;

    var nowIso = new Date().toISOString();
    var result = await sb
      .from('popups')
      .select('id, title, image_url, link_url, is_active, start_date, end_date')
      .eq('is_active', true)
      .lte('start_date', nowIso)
      .gte('end_date', nowIso)
      .order('created_at', { ascending: false })
      .limit(5);

    if (result.error) {
      console.warn('[P!CKLE Popup] fetch failed', result.error);
      return null;
    }

    var rows = result.data || [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || !row.id || !row.image_url) continue;
      if (isPopupDismissedForToday(row.id)) continue;
      return row;
    }

    return null;
  }

  async function initMainPopup() {
    if (document.body && document.body.dataset && document.body.dataset.navPage !== 'home') {
      return;
    }

    try {
      var popup = await fetchActivePopup();
      if (!popup) return;
      openSheet(popup);
    } catch (err) {
      console.warn('[P!CKLE Popup] init failed', err);
    }
  }

  window.PicklePopup = {
    initMainPopup: initMainPopup,
    closeSheet: closeSheet,
    isPopupDismissedForToday: isPopupDismissedForToday,
    dismissPopupForToday: dismissPopupForToday,
  };

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(initMainPopup, 400);
  });
})();
