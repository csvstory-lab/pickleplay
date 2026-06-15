/**
 * P!CKLE root index.html — Supabase 인증 상태 체크 및 진입 분기
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
      console.log('[P!CKLE Entry] 초기 세션 확인:', session);

      // 1. 이미 로그인 되어있으면 메인으로
      if (session) {
        console.log('세션 확인됨, 메인 화면 이동');
        window.location.href = FEED_URL;
        return;
      }

      // 2. URL에 access_token이나 code가 있는지 확인 (카카오 콜백 중인지 판단)
      var isOAuthCallback =
        window.location.hash.indexOf('access_token') !== -1 ||
        window.location.search.indexOf('code') !== -1;

      if (isOAuthCallback) {
        console.log('OAuth 콜백 처리 중... 잠시 대기');
        supabase.auth.onAuthStateChange(function (event, nextSession) {
          if (event === 'SIGNED_IN' && nextSession) {
            console.log('인증 성공, 메인 이동');
            window.location.href = FEED_URL;
          }
        });
      } else {
        // 3. 로그인도 안 되어있고, 콜백 중도 아니면? 즉시 로그인 페이지로! (하얀 화면 방지)
        console.log('로그인 정보 없음 & 콜백 아님 -> 즉시 로그인 페이지로 이동');
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
