/**
 * P!CKLE — 레거시 상단 대메뉴(🔥 메인 / ≡ 카테고리 / 🏅 전당 후보작) 제거
 * HTML·캐시·구버전 JS가 주입해도 #categoryNav 칩 바만 남깁니다.
 */
(function () {
  'use strict';

  var LEGACY_SELECTOR =
    '#appTopNav, .app-nav-scroll, nav.app-nav-scroll, [data-legacy-app-nav="1"]';

  function isCategoryNav(el) {
    return !!(el && el.id === 'categoryNav');
  }

  function navContainsLegacyMainMenu(nav) {
    if (!nav || isCategoryNav(nav)) return false;
    var text = String(nav.textContent || '');
    return text.indexOf('🔥 메인') !== -1 && text.indexOf('≡ 카테고리') !== -1;
  }

  function removeLegacyAppNav(root) {
    var scope = root || document;

    scope.querySelectorAll(LEGACY_SELECTOR).forEach(function (el) {
      if (!isCategoryNav(el)) el.remove();
    });

    scope
      .querySelectorAll('#mainHeader nav, header#mainHeader nav, header nav')
      .forEach(function (nav) {
        if (navContainsLegacyMainMenu(nav)) nav.remove();
      });

    scope.querySelectorAll('.app-nav-tab').forEach(function (tab) {
      if (tab.closest('#categoryNav')) return;
      var nav = tab.closest('nav');
      if (nav && !isCategoryNav(nav)) {
        nav.remove();
        return;
      }
      var wrapper =
        tab.closest('#appTopNav, .app-nav-scroll') || tab.parentElement;
      if (wrapper && !isCategoryNav(wrapper)) wrapper.remove();
    });

    scope.querySelectorAll('a[data-page], button[data-page]').forEach(function (el) {
      if (el.closest('#categoryNav')) return;
      var page = el.getAttribute('data-page');
      if (page !== 'home' && page !== 'category' && page !== 'hall') return;
      var nav = el.closest('nav') || el.closest('.app-nav-scroll');
      if (nav && !isCategoryNav(nav)) nav.remove();
    });
  }

  function run() {
    removeLegacyAppNav(document);
  }

  window.PickleHeaderLegacyCleanup = {
    remove: removeLegacyAppNav,
    run: run,
  };

  run();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  }

  if (typeof MutationObserver === 'undefined') return;

  var scheduled = false;
  var observer = new MutationObserver(function () {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      run();
    });
  });

  function observeHeader() {
    var header = document.getElementById('mainHeader');
    if (!header) return;
    observer.observe(header, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeHeader);
  } else {
    observeHeader();
  }
})();
