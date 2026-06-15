/**
 * P!CKLE — OAuth 콜백 URL hash 감지 · 세션 대기 (리다이렉트/알림 루프 방지)
 */
(function () {
  'use strict';

  var oauthWaitPromise = null;
  var oauthWaitInProgress = false;

  function isOAuthCallbackHash() {
    var hash = window.location.hash || '';
    return hash.indexOf('access_token') !== -1 || hash.indexOf('type=recovery') !== -1;
  }

  function shouldBlockAuthRedirect() {
    return isOAuthCallbackHash();
  }

  function getKakaoOAuthRedirectTo() {
    return window.location.origin + '/user_app/index.html';
  }

  function getSupabaseClientForOAuth() {
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.getClient) {
      try {
        return window.PickleSupabaseBootstrap.getClient();
      } catch (e) {
        return null;
      }
    }
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      try {
        return window.PickleSupabase.getClient();
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function clearOAuthHashFromUrl() {
    if (!isOAuthCallbackHash()) return;
    if (window.history && window.history.replaceState) {
      window.history.replaceState(
        null,
        document.title,
        window.location.pathname + window.location.search
      );
    }
  }

  function markOAuthPending() {
    if (isOAuthCallbackHash()) {
      window.__PICKLE_OAUTH_CALLBACK_PENDING = true;
    }
  }

  function shouldSuppressLoginAlert() {
    return (
      oauthWaitInProgress ||
      !!window.__PICKLE_OAUTH_CALLBACK_PENDING ||
      isOAuthCallbackHash()
    );
  }

  /**
   * URL hash에 OAuth 토큰이 있을 때 Supabase 세션 파싱 완료까지 대기 (최대 ~2초)
   * @returns {Promise<object|null>} session 또는 null
   */
  function waitForOAuthSession(options) {
    var timeoutMs = (options && options.timeoutMs) || 2000;

    if (!isOAuthCallbackHash() && !window.__PICKLE_OAUTH_CALLBACK_PENDING) {
      return Promise.resolve(null);
    }

    if (oauthWaitPromise) return oauthWaitPromise;

    oauthWaitInProgress = true;
    window.__PICKLE_OAUTH_CALLBACK_PENDING = true;

    oauthWaitPromise = new Promise(function (resolve) {
      var sb = getSupabaseClientForOAuth();
      if (!sb || !sb.auth) {
        setTimeout(function () {
          oauthWaitInProgress = false;
          window.__PICKLE_OAUTH_CALLBACK_PENDING = false;
          resolve(null);
        }, timeoutMs);
        return;
      }

      var settled = false;
      var subscription = null;

      function settle(session) {
        if (settled) return;
        settled = true;
        oauthWaitInProgress = false;
        window.__PICKLE_OAUTH_CALLBACK_PENDING = false;

        if (subscription && typeof subscription.unsubscribe === 'function') {
          subscription.unsubscribe();
        }

        if (session) {
          clearOAuthHashFromUrl();
        }

        resolve(session || null);
      }

      var changeResult = sb.auth.onAuthStateChange(function (event, session) {
        if (
          session &&
          (event === 'SIGNED_IN' ||
            event === 'INITIAL_SESSION' ||
            event === 'TOKEN_REFRESHED')
        ) {
          settle(session);
        }
      });
      subscription =
        changeResult && changeResult.data ? changeResult.data.subscription : null;

      sb.auth.getSession().then(function (res) {
        if (res.data && res.data.session) {
          settle(res.data.session);
        }
      });

      setTimeout(function () {
        sb.auth.getSession().then(function (res) {
          settle((res.data && res.data.session) || null);
        });
      }, timeoutMs);
    });

    return oauthWaitPromise;
  }

  markOAuthPending();

  window.PickleOAuthCallbackGuard = {
    isOAuthCallbackHash: isOAuthCallbackHash,
    shouldBlockAuthRedirect: shouldBlockAuthRedirect,
    shouldSuppressLoginAlert: shouldSuppressLoginAlert,
    getKakaoOAuthRedirectTo: getKakaoOAuthRedirectTo,
    waitForOAuthSession: waitForOAuthSession,
    clearOAuthHashFromUrl: clearOAuthHashFromUrl,
  };
})();
