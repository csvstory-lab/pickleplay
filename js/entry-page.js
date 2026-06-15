/**
 * P!CKLE root index.html — Supabase 인증 상태 체크 및 진입 분기 (루프 방지)
 */
(function () {
  'use strict';

  var FEED_URL = 'user_app/index.html';
  var LOGIN_URL = 'user_app/login.html';

  function redirect(url) {
    window.location.replace(url);
  }

  function hasAuthCallbackInUrl() {
    var hash = window.location.hash || '';
    var search = window.location.search || '';
    return (
      hash.indexOf('access_token=') !== -1 ||
      hash.indexOf('type=recovery') !== -1 ||
      search.indexOf('code=') !== -1
    );
  }

  function goToMain() {
    console.log('인증 성공, 메인 화면으로 이동');
    redirect(FEED_URL);
  }

  function goToLogin() {
    console.log('최종 인증 실패, 로그인 페이지로 이동');
    redirect(LOGIN_URL);
  }

  function routeByAuth() {
    var b = window.PickleSupabaseBootstrap;
    if (!b || !b.isReady()) {
      console.warn('[P!CKLE Entry]', b ? b.getErrorMessage() : 'bootstrap missing');
      redirect(LOGIN_URL);
      return;
    }

    var supabase = b.getClient();

    supabase.auth.getSession().then(function (result) {
      var session = result.data && result.data.session;
      console.log('[P!CKLE Entry] 초기 세션 확인:', session);

      if (session) {
        console.log('세션 확인됨, 메인 화면 유지');
        goToMain();
        return;
      }

      console.log('초기 세션 없음, 인증 상태 변경 대기 중…');

      var authState = supabase.auth.onAuthStateChange(function (event, nextSession) {
        console.log('[P!CKLE Entry] 상태 변경 감지:', event, nextSession);

        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          if (nextSession) {
            console.log('인증 성공, 메인 유지');
            authState.data.subscription.unsubscribe();
            goToMain();
          } else if (event === 'INITIAL_SESSION' && hasAuthCallbackInUrl()) {
            console.log('[P!CKLE Entry] OAuth 콜백 처리 대기 중…');
          } else {
            authState.data.subscription.unsubscribe();
            goToLogin();
          }
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', routeByAuth);
  } else {
    routeByAuth();
  }
})();
