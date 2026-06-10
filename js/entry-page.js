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
      redirect(LOGIN_URL);
      return;
    }

    try {
      var sb = b.getClient();
      var result = await sb.auth.getUser();
      if (result.error) throw result.error;
      redirect(result.data.user ? FEED_URL : LOGIN_URL);
    } catch (err) {
      console.warn('[P!CKLE Entry]', err);
      redirect(LOGIN_URL);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', routeByAuth);
  } else {
    routeByAuth();
  }
})();
