/**
 * P!CKLE root index.html — user_app 진입 분기
 * 비회원도 메인 피드(user_app/index.html) 열람 허용
 */
(function () {
  'use strict';

  var FEED_URL = 'user_app/index.html';
  var LOGIN_URL = 'user_app/login.html';

  function goFeed(extraHash) {
    window.location.href = FEED_URL + (extraHash || '');
  }

  function routeByAuth() {
    if (
      window.location.hash.includes('access_token') ||
      window.location.hash.includes('type=recovery')
    ) {
      console.log('[P!CKLE Entry] OAuth hash 감지 — user_app/index.html로 hash 유지 이동');
      goFeed(window.location.hash);
      return;
    }

    var b = window.PickleSupabaseBootstrap;
    if (!b || !b.isReady()) {
      console.warn('[P!CKLE Entry] bootstrap 미준비 — 메인 피드로 이동 (게스트 허용)');
      goFeed();
      return;
    }

    var supabase = b.getClient();

    supabase.auth.getSession().then(function (result) {
      var session = result.data && result.data.session;
      console.log('[P!CKLE Entry] 현재 세션 상태:', session ? 'logged-in' : 'guest');

      if (session) {
        goFeed();
        return;
      }

      var hash = window.location.hash;
      var isOAuthCallback =
        hash.indexOf('access_token=') !== -1 || hash.indexOf('type=recovery') !== -1;

      if (isOAuthCallback) {
        console.log('[P!CKLE Entry] OAuth 콜백 재확인');
        setTimeout(function () {
          supabase.auth.getSession().then(function (retry) {
            var postCallbackSession = retry.data && retry.data.session;
            if (postCallbackSession) {
              goFeed();
            } else {
              window.location.href = LOGIN_URL;
            }
          });
        }, 1500);
        return;
      }

      console.log('[P!CKLE Entry] 비회원 — 메인 피드로 이동');
      goFeed();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', routeByAuth);
  } else {
    routeByAuth();
  }
})();
