/**
 * P!CKLE — 상단 앱 탭 (메인 / 카테고리 / 전당 후보작)
 */
(function () {
  'use strict';

  var TABS = [
    { page: 'home', href: 'index.html', label: '🔥 메인' },
    { page: 'category', href: 'category.html', label: '≡ 카테고리' },
    { page: 'hall', href: 'hall_of_fame.html', label: '🏅 전당 후보작' },
  ];

  function renderAppNav(containerId) {
    var nav = document.getElementById(containerId || 'appTopNav');
    if (!nav) return;

    var current = document.body.getAttribute('data-app-page') || '';

    nav.innerHTML = TABS.map(function (tab) {
      var active = tab.page === current ? ' active' : '';
      return (
        '<a href="' +
        tab.href +
        '" class="app-nav-tab' +
        active +
        '" data-page="' +
        tab.page +
        '">' +
        tab.label +
        '</a>'
      );
    }).join('');
  }

  window.PickleAppNav = {
    render: renderAppNav,
    TABS: TABS,
  };

  document.addEventListener('DOMContentLoaded', function () {
    renderAppNav('appTopNav');
  });
})();
