/**
 * P!CKLE root index.html — user_app 진입 분기
 */
(function () {
  'use strict';

  var FEED_URL = 'user_app/index.html';
  var LOGIN_URL = 'user_app/login.html';

  function routeByAuth() {
    var b = window.PickleSupabaseBootstrap;
    if (!b || !b.isReady()) {
      console.warn('[P!CKLE Entry]', b ? b.getErrorMessage() : 'bootstrap missing');
      window.location.href = LOGIN_URL;
      return;
    }

    var supabase = b.getClient();

    supabase.auth.getSession().then(function (result) {
      var session = result.data && result.data.session;
      console.log('[P!CKLE Entry] 현재 세션 상태:', session);

      // 1. 이미 로그인 되어있다면 메인 앱으로 이동
      if (session) {
        window.location.href = FEED_URL;
        return;
      }

      // 2. URL에 인증 정보가 있는지 체크 (카카오 로그인 콜백 처리)
      var hash = window.location.hash;
      var isOAuthCallback =
        hash.indexOf('access_token=') !== -1 || hash.indexOf('type=recovery') !== -1;

      if (isOAuthCallback) {
        console.log('인증 정보 감지 -> 1.5초 후 재확인');
        setTimeout(function () {
          supabase.auth.getSession().then(function (retry) {
            var postCallbackSession = retry.data && retry.data.session;
            if (postCallbackSession) {
              window.location.href = FEED_URL;
            } else {
              window.location.href = LOGIN_URL;
            }
          });
        }, 1500);
      } else {
        // 3. 인증 정보도 없고 로그인도 안 됨 -> 바로 로그인 페이지로 이동
        console.log('인증 정보 없음 -> 로그인 페이지로 이동');
        window.location.href = LOGIN_URL;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', routeByAuth);
  } else {
    routeByAuth();
  }
})();
