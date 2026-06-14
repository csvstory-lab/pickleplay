/**
 * P!CKLE — iOS Safari 등 모바일 핀치 줌 · 제스처 확대 차단
 */
(function () {
  'use strict';

  document.addEventListener(
    'touchmove',
    function (event) {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  document.addEventListener('gesturestart', function (event) {
    event.preventDefault();
  });

  document.addEventListener('gesturechange', function (event) {
    event.preventDefault();
  });

  document.addEventListener('gestureend', function (event) {
    event.preventDefault();
  });
})();
