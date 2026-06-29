/**
 * P!CKLE — 공통 상단바 · 하단바 (index.html 기준)
 */
(function () {
  'use strict';

  var DEFAULT_LOGO_SVG =
    '<svg class="logo-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 202.42 50.55" role="img" aria-label="P!CKLE">' +
    '<path fill="#fff" d="M33.02,7.68c2.43,1.16,4.31,2.81,5.63,4.94,1.33,2.14,1.99,4.66,1.99,7.57s-.66,5.38-1.99,7.51c-1.33,2.14-3.2,3.77-5.63,4.92-2.43,1.14-5.28,1.71-8.56,1.71h-6.79v10.27h-9.61V5.94h16.4c3.28,0,6.13.58,8.56,1.74ZM29.13,24.59c1.2-1.05,1.8-2.51,1.8-4.39s-.6-3.45-1.8-4.5c-1.2-1.05-2.95-1.57-5.27-1.57h-6.19v12.04h6.19c2.32,0,4.08-.52,5.27-1.57Z"/>' +
    '<path fill="#fff" d="M66.98,42.76c-3.06-1.71-5.45-4.1-7.18-7.15-1.73-3.06-2.6-6.5-2.6-10.33s.87-7.27,2.62-10.33c1.75-3.06,4.15-5.44,7.21-7.15,3.06-1.71,6.48-2.57,10.27-2.57,3.28,0,6.24.61,8.89,1.82,2.65,1.22,4.86,2.98,6.63,5.3l-6.19,5.97c-2.39-3.02-5.34-4.53-8.84-4.53-2.1,0-3.97.48-5.61,1.44-1.64.96-2.92,2.31-3.84,4.06-.92,1.75-1.38,3.75-1.38,5.99s.46,4.24,1.38,5.99c.92,1.75,2.2,3.1,3.84,4.06,1.64.96,3.51,1.44,5.61,1.44,3.57,0,6.52-1.53,8.84-4.58l6.19,5.97c-1.77,2.32-3.98,4.1-6.63,5.33-2.65,1.23-5.63,1.85-8.95,1.85-3.79,0-7.22-.86-10.27-2.57Z"/>' +
    '<path fill="#fff" d="M105.81,34.89v9.72h-9.56V5.94h9.56v16.79l14.97-16.79h10.61l-15.02,17.18,15.85,21.49h-11.16l-10.99-14.47-4.25,4.75Z"/>' +
    '<path fill="#fff" d="M144.43,5.94v30.49h17.9v8.17h-27.51V5.94h9.61Z"/>' +
    '<path fill="#fff" d="M194.36,44.61h-29V5.94h28.28v8.06h-18.78v7.07h16.63v7.84h-16.63v7.62h19.5v8.06Z"/>' +
    '<path fill="#85db67" d="M49.15,5.23c1.25,0,2.35.47,3.31,1.4.96.93,1.44,2.1,1.44,3.49v18.38c0,1.39-.48,2.55-1.44,3.49-.96.93-2.06,1.4-3.31,1.4-1.39,0-2.57-.47-3.52-1.4-.96-.93-1.44-2.1-1.44-3.49V10.12c0-1.39.48-2.55,1.44-3.49.96-.93,2.13-1.4,3.52-1.4ZM53.9,40.51c0,1.29-.48,2.42-1.44,3.38-.96.96-2.06,1.44-3.31,1.44-1.39,0-2.57-.48-3.52-1.44-.96-.96-1.44-2.09-1.44-3.38s.48-2.49,1.44-3.45c.96-.96,2.13-1.44,3.52-1.44,1.25,0,2.35.48,3.31,1.44.96.96,1.44,2.11,1.44,3.45Z"/>' +
    '</svg>';

  function getLogoSvg() {
    if (window.PICKLE_LOGO && window.PICKLE_LOGO.svg) {
      return window.PICKLE_LOGO.svg;
    }
    return DEFAULT_LOGO_SVG;
  }

  function logoHomeClick() {
    return (
      'if(window.PickleAuth&&window.PickleAuth.navigateWhenAuthReady){' +
      'PickleAuth.navigateWhenAuthReady(\'index.html\');return false;}' +
      'location.href=\'index.html\';return false;'
    );
  }

  var HEADER_HTML =
    '<header id="mainHeader">' +
    '<div class="top-row" id="headerTopRow">' +
    '<a class="logo-link" href="index.html" aria-label="P!CKLE 홈" onclick="' +
    logoHomeClick() +
    '">' +
    '<h1 class="logo">' +
    getLogoSvg() +
    '</h1>' +
    '</a>' +
    '<div class="header-actions">' +
    '<button type="button" class="btn-category" onclick="toggleCategorySheet()"><i class="ph-fill ph-fire" aria-hidden="true"></i> 전체 불판</button>' +
    '<i class="ph ph-magnifying-glass icon-search-top" onclick="PickleAuth.navigateWhenAuthReady(\'search.html\')"></i>' +
    '<i class="ph ph-bell noti-bell" onclick="alert(\'알림 기능은 준비 중입니다.\')"></i>' +
    '</div>' +
    '</div>' +
    '</header>' +
    '<div class="noti-overlay" id="commonOverlay" onclick="closeAllDrawers()"></div>' +
    '<div class="bottom-sheet" id="categorySheet">' +
    '<div class="sheet-header">' +
    '<div class="sheet-title">불판 주제</div>' +
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
