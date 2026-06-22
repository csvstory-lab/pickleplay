/**
 * P!CKLE — 공통 상단바 · 하단바 (index.html 기준)
 */
(function () {
  'use strict';

  var HEADER_HTML =
    '<header id="mainHeader">' +
    '<div class="top-row" id="headerTopRow">' +
    '<h1 class="logo" onclick="PickleAuth.navigateWhenAuthReady(\'index.html\')">P!CKLE</h1>' +
    '<div class="header-actions">' +
    '<button type="button" class="btn-category" onclick="toggleCategorySheet()">전체 불판</button>' +
    '<i class="ph ph-magnifying-glass icon-search-top" onclick="PickleAuth.navigateWhenAuthReady(\'search.html\')"></i>' +
    '<i class="ph ph-bell noti-bell" onclick="alert(\'알림 기능은 준비 중입니다.\')"></i>' +
    '</div>' +
    '</div>' +
    '</header>' +
    '<div class="noti-overlay" id="commonOverlay" onclick="closeAllDrawers()"></div>' +
    '<div class="bottom-sheet" id="categorySheet">' +
    '<div class="sheet-header">' +
    '<div class="sheet-title">모든 불판 탐험 🚀</div>' +
    '<button type="button" class="btn-close" onclick="closeAllDrawers()">✕</button>' +
    '</div>' +
    '<div class="category-grid" id="categoryGrid"></div>' +
    '</div>';

  var ICON_HOME =
    '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6.5H9V20.5H5.5A1.5 1.5 0 0 1 4 19V10.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/>' +
    '</svg>';

  var ICON_RANKING =
    '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M8 20h8M12 17v3M7 4h10v2.8a5 5 0 0 1-10 0V4zM5 4H3.5v2a2.5 2.5 0 0 0 2.5 2.5M19 4h1.5v2a2.5 2.5 0 0 1-2.5 2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
    '</svg>';

  var ICON_EVENT =
    '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="3.5" y="8.5" width="17" height="12" rx="1.5" stroke="currentColor" stroke-width="1.8" fill="none"/>' +
    '<path d="M12 8.5v12M3.5 12.5h17M8 8.5V6.2a2 2 0 1 1 4 0V8.5M16 8.5V6.2a2 2 0 1 1 4 0V8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>' +
    '</svg>';

  var ICON_MYPAGE =
    '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="12" cy="8.5" r="3.8" stroke="currentColor" stroke-width="1.8" fill="none"/>' +
    '<path d="M5.5 19.5c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>' +
    '</svg>';

  function navClick(page) {
    return (
      'event.preventDefault();' +
      'if(window.PickleAuth&&window.PickleAuth.navigateWhenAuthReady){' +
      'PickleAuth.navigateWhenAuthReady(\'' +
      page +
      '\');}' +
      'else{location.href=\'' +
      page +
      '\';}'
    );
  }

  var FOOTER_HTML =
    '<nav class="bottom-nav" aria-label="하단 메뉴">' +
    '<a class="nav-btn" data-nav-page="home" href="index.html" onclick="' +
    navClick('index.html') +
    '">' +
    ICON_HOME +
    '<span class="nav-label">홈</span></a>' +
    '<a class="nav-btn" data-nav-page="ranking" href="ranking.html" onclick="' +
    navClick('ranking.html') +
    '">' +
    ICON_RANKING +
    '<span class="nav-label">랭킹</span></a>' +
    '<a class="nav-btn fire-btn" data-nav-page="create" href="create.html" onclick="' +
    navClick('create.html') +
    '" aria-label="불판 생성">' +
    '<i class="ph-fill ph-fire nav-icon"></i></a>' +
    '<a class="nav-btn" data-nav-page="event" href="event.html" onclick="' +
    navClick('event.html') +
    '">' +
    ICON_EVENT +
    '<span class="nav-label">이벤트</span></a>' +
    '<a class="nav-btn" data-nav-page="mypage" href="mypage.html" onclick="' +
    navClick('mypage.html') +
    '">' +
    ICON_MYPAGE +
    '<span class="nav-label">마이</span></a>' +
    '</nav>';

  function resolveNavPage() {
    var body = document.body;
    if (!body) return 'home';

    var explicit = body.getAttribute('data-nav-page') || body.getAttribute('data-page');
    if (explicit) {
      if (explicit === 'index') return 'home';
      return explicit;
    }

    var file = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (file === 'index.html' || file === '') return 'home';
    return file.replace(/\.html$/, '');
  }

  function setActiveNav(pageKey) {
    document.querySelectorAll('.bottom-nav .nav-btn').forEach(function (btn) {
      var key = btn.getAttribute('data-nav-page');
      btn.classList.toggle('active', !!key && key === pageKey);
    });
  }

  function closeAllDrawers() {
    var overlay = document.getElementById('commonOverlay');
    var sheet = document.getElementById('categorySheet');
    if (overlay) overlay.classList.remove('open');
    if (sheet) sheet.classList.remove('open');
    document.body.style.overflow = '';
  }

  function toggleCategorySheet() {
    var overlay = document.getElementById('commonOverlay');
    var sheet = document.getElementById('categorySheet');
    if (!overlay || !sheet) return;

    var willOpen = !sheet.classList.contains('open');
    closeAllDrawers();

    if (willOpen) {
      overlay.classList.add('open');
      sheet.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  function renderCommonLayout() {
    var headerRoot = document.getElementById('common-header');
    var footerRoot = document.getElementById('common-footer');

    if (headerRoot && !headerRoot.dataset.rendered) {
      headerRoot.innerHTML = HEADER_HTML;
      headerRoot.dataset.rendered = '1';
    }

    if (footerRoot && !footerRoot.dataset.rendered) {
      footerRoot.innerHTML = FOOTER_HTML;
      footerRoot.dataset.rendered = '1';
      setActiveNav(resolveNavPage());
    }

    if (window.PickleHeaderLegacyCleanup && window.PickleHeaderLegacyCleanup.run) {
      window.PickleHeaderLegacyCleanup.run();
    }

    if (window.PickleProfileModal && window.PickleProfileModal.ensure) {
      window.PickleProfileModal.ensure();
    }
  }

  window.closeAllDrawers = closeAllDrawers;
  window.toggleCategorySheet = toggleCategorySheet;

  window.PickleCommonLayout = {
    render: renderCommonLayout,
    setActiveNav: setActiveNav,
    resolveNavPage: resolveNavPage,
  };

  renderCommonLayout();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderCommonLayout);
  }
})();
