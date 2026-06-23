/**
 * P!CKLE — 메인 이벤트 팝업 바텀 시트 (Swiper 롤링, 최대 3장)
 */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'pickle_popup_hide_';
  var MAX_POPUPS = 3;
  var AUTOPLAY_DELAY = 3000;

  var rootEl = null;
  var swiperInstance = null;
  var currentPopups = [];

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

  function dismissAllCurrentPopupsForToday() {
    currentPopups.forEach(function (popup) {
      if (popup && popup.id) {
        dismissPopupForToday(popup.id);
      }
    });
  }

  function destroySwiper() {
    if (swiperInstance) {
      try {
        swiperInstance.destroy(true, true);
      } catch (e) {
        /* noop */
      }
      swiperInstance = null;
    }
  }

  function updateFraction(swiper) {
    var fractionEl = document.getElementById('picklePopupFraction');
    if (!fractionEl || !swiper) return;

    var total = currentPopups.length;
    if (total <= 1) {
      fractionEl.classList.add('is-single');
      fractionEl.textContent = '';
      return;
    }

    fractionEl.classList.remove('is-single');
    var current = (typeof swiper.realIndex === 'number' ? swiper.realIndex : swiper.activeIndex) + 1;
    fractionEl.textContent = current + ' / ' + total;
  }

  function buildSlideHtml(popup) {
    var title = String(popup.title || '').trim();
    var alt = escapeHtml(title || '이벤트 팝업');
    var link = String(popup.link_url || '').trim();
    var imgSrc = escapeHtml(popup.image_url || '');

    if (link) {
      return (
        '<div class="swiper-slide">' +
        '<a class="pickle-popup-slide-link" href="' +
        escapeHtml(link) +
        '" target="_blank" rel="noopener noreferrer">' +
        '<img class="pickle-popup-image" src="' +
        imgSrc +
        '" alt="' +
        alt +
        '" />' +
        '</a>' +
        '</div>'
      );
    }

    return (
      '<div class="swiper-slide">' +
      '<a class="pickle-popup-slide-link is-static" href="#" tabindex="-1" aria-disabled="true">' +
      '<img class="pickle-popup-image" src="' +
      imgSrc +
      '" alt="' +
      alt +
      '" />' +
      '</a>' +
      '</div>'
    );
  }

  function bindStaticSlideLinks() {
    if (!rootEl) return;
    rootEl.querySelectorAll('.pickle-popup-slide-link.is-static').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
      });
    });
  }

  function initSwiper(popups) {
    destroySwiper();

    var wrapper = document.getElementById('picklePopupSwiperWrapper');
    var swiperEl = document.getElementById('picklePopupSwiper');
    if (!wrapper || !swiperEl || !popups.length) return;

    wrapper.innerHTML = popups.map(buildSlideHtml).join('');
    bindStaticSlideLinks();

    var fractionEl = document.getElementById('picklePopupFraction');
    if (fractionEl) {
      if (popups.length <= 1) {
        fractionEl.classList.add('is-single');
        fractionEl.textContent = '';
      } else {
        fractionEl.classList.remove('is-single');
        fractionEl.textContent = '1 / ' + popups.length;
      }
    }

    if (typeof window.Swiper === 'undefined') {
      console.warn('[P!CKLE Popup] Swiper not loaded');
      return;
    }

    var enableLoop = popups.length > 1;
    swiperInstance = new window.Swiper(swiperEl, {
      slidesPerView: 1,
      spaceBetween: 0,
      loop: enableLoop,
      speed: 420,
      allowTouchMove: enableLoop,
      autoplay: enableLoop
        ? {
            delay: AUTOPLAY_DELAY,
            disableOnInteraction: false,
            pauseOnMouseEnter: true,
          }
        : false,
      on: {
        init: function (swiper) {
          updateFraction(swiper);
        },
        slideChange: function (swiper) {
          updateFraction(swiper);
        },
      },
    });
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
      '<div class="pickle-popup-float">' +
      '  <div class="pickle-popup-header">' +
      '    <button type="button" class="pickle-popup-hide-today" id="picklePopupBtnHideToday">오늘 하루 보지 않기</button>' +
      '    <button type="button" class="pickle-popup-close" id="picklePopupBtnClose" aria-label="닫기">' +
      '      <i class="ph ph-x" aria-hidden="true"></i>' +
      '    </button>' +
      '  </div>' +
      '  <div class="pickle-popup-sheet" role="document">' +
      '    <div class="pickle-popup-swiper swiper" id="picklePopupSwiper">' +
      '      <div class="swiper-wrapper" id="picklePopupSwiperWrapper"></div>' +
      '      <div class="pickle-popup-fraction" id="picklePopupFraction" aria-live="polite"></div>' +
      '    </div>' +
      '    <h2 class="pickle-popup-title" id="picklePopupTitle"></h2>' +
      '  </div>' +
      '</div>';

    document.body.appendChild(rootEl);

    rootEl.querySelector('[data-popup-close]').addEventListener('click', closeSheet);
    document.getElementById('picklePopupBtnClose').addEventListener('click', closeSheet);
    document.getElementById('picklePopupBtnHideToday').addEventListener('click', function () {
      dismissAllCurrentPopupsForToday();
      closeSheet();
    });

    return rootEl;
  }

  function closeSheet() {
    if (!rootEl) return;
    destroySwiper();
    rootEl.classList.remove('is-open');
    rootEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    currentPopups = [];
  }

  function openSheet(popups) {
    if (!popups || !popups.length) return;

    var el = ensureRoot();
    currentPopups = popups.slice();

    var titleEl = document.getElementById('picklePopupTitle');
    var titles = popups
      .map(function (p) {
        return String(p.title || '').trim();
      })
      .filter(Boolean);

    if (titleEl) {
      titleEl.textContent = titles.join(', ') || '이벤트 안내';
    }

    el.setAttribute('aria-label', titles[0] || '이벤트 안내');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    initSwiper(popups);

    requestAnimationFrame(function () {
      el.classList.add('is-open');
      if (swiperInstance && swiperInstance.autoplay && swiperInstance.autoplay.start) {
        swiperInstance.autoplay.start();
      }
    });
  }

  async function fetchActivePopups() {
    var sb = getClient();
    if (!sb) return [];

    var nowIso = new Date().toISOString();
    var result = await sb
      .from('popups')
      .select('id, title, image_url, link_url, is_active, start_date, end_date')
      .eq('is_active', true)
      .lte('start_date', nowIso)
      .gte('end_date', nowIso)
      .order('created_at', { ascending: false })
      .limit(10);

    if (result.error) {
      console.warn('[P!CKLE Popup] fetch failed', result.error);
      return [];
    }

    var rows = result.data || [];
    var eligible = [];

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || !row.id || !row.image_url) continue;
      if (isPopupDismissedForToday(row.id)) continue;
      eligible.push(row);
      if (eligible.length >= MAX_POPUPS) break;
    }

    return eligible;
  }

  async function initMainPopup() {
    if (document.body && document.body.dataset && document.body.dataset.navPage !== 'home') {
      return;
    }

    try {
      var popups = await fetchActivePopups();
      if (!popups.length) return;
      openSheet(popups);
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
