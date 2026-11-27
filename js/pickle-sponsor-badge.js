/**
 * P!CKLE — 스폰서(광고) 불판 표시 공통 모듈
 *
 * 광고주/대행사가 집행한 스폰서 불판(posts.is_sponsor = true)은
 * 모든 노출 화면에서 "광고" 표시를 붙여 이용자가 광고임을 알 수 있게 한다.
 * (표시·광고 관련 법령상 광고 표시 의무 대응)
 *
 * 사용:
 *   PickleSponsor.badgeHtml(post)         → 인라인 배지 HTML (제목 옆/메타 줄)
 *   PickleSponsor.overlayHtml(post)       → 썸네일 좌상단 오버레이 배지 HTML
 *   PickleSponsor.isSponsor(post)         → boolean
 */
(function () {
  'use strict';

  var LABEL_KO = '광고';
  var ARIA = '광고(스폰서) 게시물';

  var CSS =
    '.pk-ad-badge{display:inline-flex;align-items:center;flex-shrink:0;' +
    'padding:1px 5px;border-radius:4px;font-size:0.6rem;font-weight:600;line-height:1.35;' +
    'letter-spacing:0;white-space:nowrap;vertical-align:middle;' +
    'color:#a1a1aa;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);' +
    'font-family:inherit;box-shadow:none;text-shadow:none;}' +
    '.feed-card-meta .pk-ad-badge{order:0 !important;margin-right:6px;}' +
    '.card-thumb-top{position:relative;}' +
    '.pk-ad-overlay{position:absolute;top:8px;left:8px;z-index:3;' +
    'color:#e4e4e7;background:rgba(0,0,0,0.5);border:none;}' +
    '.pk-ad-block{margin:0 0 6px;}' +
    '.pk-ad-notice{margin:6px 0 0;font-size:0.68rem;line-height:1.5;color:#71717a;word-break:keep-all;}';

  function injectStyle() {
    try {
      if (document.getElementById('pickleSponsorBadgeStyle')) return;
      var st = document.createElement('style');
      st.id = 'pickleSponsorBadgeStyle';
      st.textContent = CSS;
      (document.head || document.documentElement).appendChild(st);
    } catch (_) {}
  }

  function isSponsor(post) {
    return !!(post && (post.is_sponsor === true || post.is_sponsor === 'true' || post.is_sponsor === 't'));
  }

  function inner() {
    return LABEL_KO;
  }

  function badgeHtml(post, extraClass) {
    if (!isSponsor(post)) return '';
    return (
      '<span class="pk-ad-badge' +
      (extraClass ? ' ' + extraClass : '') +
      '" role="note" aria-label="' +
      ARIA +
      '">' +
      inner() +
      '</span>'
    );
  }

  function overlayHtml(post) {
    return badgeHtml(post, 'pk-ad-overlay');
  }

  injectStyle();

  window.PickleSponsor = {
    LABEL_KO: LABEL_KO,
    isSponsor: isSponsor,
    badgeHtml: badgeHtml,
    overlayHtml: overlayHtml,
    injectStyle: injectStyle,
  };
})();
