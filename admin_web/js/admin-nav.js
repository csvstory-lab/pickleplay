/**
 * P!CKLE Admin — 사이드바 네비게이션 · 레거시 URL · 페이지 init 방어
 */
(function () {
  'use strict';

  var ROUTE_ALIASES = {
    'admin_board_list.html': 'admin_post_list.html',
  };

  var currentPage = (function () {
    var path = window.location.pathname || '';
    var parts = path.split('/');
    return parts[parts.length - 1] || '';
  })();

  if (ROUTE_ALIASES[currentPage]) {
    window.location.replace(ROUTE_ALIASES[currentPage]);
    return;
  }

  function resolveHref(href) {
    if (!href) return '';
    var raw = String(href).trim();
    var file = raw.split('?')[0].split('#')[0];
    return ROUTE_ALIASES[file] || raw;
  }

  function navigateTo(href) {
    try {
      var target = resolveHref(href);
      if (!target || target === '#') return;
      window.location.href = target;
    } catch (err) {
      console.error('[Admin Nav] navigation failed:', err);
    }
  }

  function bindSidebarNavigation() {
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar || sidebar.dataset.navBound === '1') return;
    sidebar.dataset.navBound = '1';

    sidebar.querySelectorAll('.nav-item, .nav-sub-item').forEach(function (item) {
      var onclick = item.getAttribute('onclick') || '';
      var match = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
      if (!match) return;

      var target = resolveHref(match[1]);
      item.setAttribute('data-nav-href', target);
      item.removeAttribute('onclick');

      item.addEventListener('click', function (e) {
        if (e.target.closest('a, button, input, select, textarea')) return;
        var href = item.getAttribute('data-nav-href');
        if (!href) return;
        navigateTo(href);
      });

      item.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var href = item.getAttribute('data-nav-href');
        if (!href) return;
        e.preventDefault();
        navigateTo(href);
      });
    });
  }

  function safeInit(pageName, initFn) {
    if (typeof initFn !== 'function') return;
    try {
      var result = initFn();
      if (result && typeof result.then === 'function') {
        return result.catch(function (err) {
          console.error('[Admin ' + pageName + '] init failed:', err);
        });
      }
      return result;
    } catch (err) {
      console.error('[Admin ' + pageName + '] init failed:', err);
      return undefined;
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  window.addEventListener('error', function (event) {
    console.error('[Admin Nav] Uncaught error:', event.error || event.message);
  });

  window.addEventListener('unhandledrejection', function (event) {
    console.error('[Admin Nav] Unhandled rejection:', event.reason);
  });

  window.PickleAdminNav = {
    ROUTE_ALIASES: ROUTE_ALIASES,
    resolveHref: resolveHref,
    navigateTo: navigateTo,
    bindSidebarNavigation: bindSidebarNavigation,
    safeInit: safeInit,
    $: $,
  };

  document.addEventListener('DOMContentLoaded', function () {
    try {
      bindSidebarNavigation();
    } catch (err) {
      console.error('[Admin Nav] sidebar bind failed:', err);
    }
  });
})();
