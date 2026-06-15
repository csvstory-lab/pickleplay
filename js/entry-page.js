/**
 * P!CKLE root index.html — 로그인 상태에 따라 진입 페이지 분기
 */
(function () {
  'use strict';

  var FEED_URL = 'user_app/index.html';
  var LOGIN_URL = 'user_app/login.html';

  function redirect(url) {
    window.location.replace(url);
  }

  async function routeByAuth() {
    var b = window.PickleSupabaseBootstrap;
    if (!b || !b.isReady()) {
      console.warn('[P!CKLE Entry]', b ? b.getErrorMessage() : 'bootstrap missing');
      // redirect(LOGIN_URL);
      return;
    }

    try {
      var sb = b.getClient();
      console.log('[P!CKLE Entry] supabase.auth.getSession():', sb.auth.getSession());
      var sessionResult = await sb.auth.getSession();
      console.log('[P!CKLE Entry] getSession resolved:', sessionResult);

      setTimeout(function () {
        console.log('[P!CKLE Entry] getSession @500ms:', sb.auth.getSession());
        sb.auth.getSession().then(function (late) {
          console.log('[P!CKLE Entry] getSession @500ms resolved:', late);
        });
      }, 500);

      sb.auth.onAuthStateChange(function (event, session) {
        console.log('[P!CKLE Entry] onAuthStateChange:', event, session);
        console.log(sb.auth.getSession());
      });

      var result = await sb.auth.getUser();
      if (result.error) throw result.error;
      // redirect(result.data.user ? FEED_URL : LOGIN_URL);
      if (result.data.user) {
        redirect(FEED_URL);
      } else {
        console.log('[P!CKLE Entry] user 없음 — login 리다이렉트 비활성화(디버그)');
      }
    } catch (err) {
      console.warn('[P!CKLE Entry]', err);
      // redirect(LOGIN_URL);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', routeByAuth);
  } else {
    routeByAuth();
  }
})();
