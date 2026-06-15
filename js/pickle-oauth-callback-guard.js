/**
 * P!CKLE — OAuth 콜백 URL hash 감지 (리다이렉트 루프 방지)
 */
(function () {
  'use strict';

  function isOAuthCallbackHash() {
    var hash = window.location.hash || '';
    return hash.indexOf('access_token') !== -1 || hash.indexOf('type=recovery') !== -1;
  }

  function shouldBlockAuthRedirect() {
    if (window.location.hash.includes('access_token') || window.location.hash.includes('type=recovery')) {
      return true;
    }
    return isOAuthCallbackHash();
  }

  function getKakaoOAuthRedirectTo() {
    return window.location.origin + '/user_app/index.html';
  }

  window.PickleOAuthCallbackGuard = {
    isOAuthCallbackHash: isOAuthCallbackHash,
    shouldBlockAuthRedirect: shouldBlockAuthRedirect,
    getKakaoOAuthRedirectTo: getKakaoOAuthRedirectTo,
  };
})();
