/**
 * P!CKLE — result.html 취향 통계 (모자이크 잠금 해제 — 팝업 없이 항상 표시)
 */
(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function setTasteStatsLocked(locked) {
    var wrap = $('tasteStatsWrap');
    if (!wrap) return;
    wrap.classList.toggle('is-locked', !!locked);
  }

  function bootstrap() {
    setTasteStatsLocked(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
