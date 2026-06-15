/**
 * P!CKLE — OAuth 콜백 URL hash 감지 · 세션 대기 · 로그인 알림/리다이렉트 차단
 */
(function () {
  'use strict';

  var oauthWaitPromise = null;
  var oauthWaitInProgress = false;
  var nativeAlert = window.alert;

  /** @returns {boolean} URL hash에 OAuth 토큰이 있는지 */
  function isOAuthCallback() {
    var hash = window.location.hash || '';
    return hash.indexOf('access_token=') !== -1 || hash.indexOf('type=recovery') !== -1;
  }

  function isOAuthCallbackHash() {
    return isOAuthCallback();
  }

  function shouldBlockAuthRedirect() {
    return isOAuthCallback();
  }

  function shouldSuppressLoginAlert() {
    return (
      isOAuthCallback() ||
      oauthWaitInProgress ||
      !!window.__PICKLE_OAUTH_CALLBACK_PENDING
    );
  }

  /**
   * 세션 없을 때만 로그인 알림·리다이렉트 (OAuth 콜백 중에는 절대 실행 안 함)
   * @returns {boolean} 알림/리다이렉트를 실행했으면 true
   */
  function promptLoginRequired(message, onRedirect) {
    if (shouldSuppressLoginAlert()) {
      return false;
    }
    alert(message || '로그인이 필요합니다.');
    if (typeof onRedirect === 'function') {
      onRedirect();
    }
    return true;
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
    if (!isOAuthCallback()) return;
    if (window.history && window.history.replaceState) {
      window.history.replaceState(
        null,
        document.title,
        window.location.pathname + window.location.search
      );
    }
  }

  function markOAuthPending() {
    if (isOAuthCallback()) {
      window.__PICKLE_OAUTH_CALLBACK_PENDING = true;
    }
  }

  function isLoginRelatedAlertMessage(msg) {
    return /로그인이 필요|login required|auth session missing/i.test(String(msg || ''));
  }

  /** OAuth 콜백 중 로그인 관련 alert 전역 차단 (누락된 호출 경로 대비) */
  function installLoginAlertGuard() {
    window.alert = function (msg) {
      if (shouldSuppressLoginAlert() && isLoginRelatedAlertMessage(msg)) {
        console.log('[P!CKLE OAuth] login alert suppressed:', msg);
        return;
      }
      return nativeAlert.call(window, msg);
    };
  }

  /**
   * URL hash에 OAuth 토큰이 있을 때 Supabase 세션 파싱 완료까지 대기
   * @returns {Promise<object|null>} session 또는 null
   */
  function waitForOAuthSession(options) {
    var timeoutMs = (options && options.timeoutMs) || 5000;

    if (!isOAuthCallback() && !window.__PICKLE_OAUTH_CALLBACK_PENDING) {
      return Promise.resolve(null);
    }

    if (oauthWaitPromise) return oauthWaitPromise;

    oauthWaitInProgress = true;
    window.__PICKLE_OAUTH_CALLBACK_PENDING = true;

    oauthWaitPromise = new Promise(function (resolve) {
      var sb = getSupabaseClientForOAuth();
      if (!sb || !sb.auth) {
        setTimeout(function () {
          if (!isOAuthCallback()) {
            oauthWaitInProgress = false;
            window.__PICKLE_OAUTH_CALLBACK_PENDING = false;
          }
          resolve(null);
        }, timeoutMs);
        return;
      }

      var settled = false;
      var subscription = null;

      function finish(session) {
        if (settled) return;
        settled = true;

        if (subscription && typeof subscription.unsubscribe === 'function') {
          subscription.unsubscribe();
        }

        if (session && sb.auth && typeof sb.auth.setSession === 'function') {
          sb.auth
            .setSession(session)
            .then(function () {
              oauthWaitInProgress = false;
              window.__PICKLE_OAUTH_CALLBACK_PENDING = false;
              clearOAuthHashFromUrl();
              resolve(session);
            })
            .catch(function () {
              oauthWaitInProgress = false;
              window.__PICKLE_OAUTH_CALLBACK_PENDING = false;
              clearOAuthHashFromUrl();
              resolve(session);
            });
          return;
        }

        if (session) {
          oauthWaitInProgress = false;
          window.__PICKLE_OAUTH_CALLBACK_PENDING = false;
          clearOAuthHashFromUrl();
          resolve(session);
          return;
        }

        if (isOAuthCallback()) {
          oauthWaitInProgress = false;
          resolve(null);
          return;
        }

        oauthWaitInProgress = false;
        window.__PICKLE_OAUTH_CALLBACK_PENDING = false;
        resolve(null);
      }

      var changeResult = sb.auth.onAuthStateChange(function (event, session) {
        if (
          session &&
          (event === 'SIGNED_IN' ||
            event === 'INITIAL_SESSION' ||
            event === 'TOKEN_REFRESHED')
        ) {
          finish(session);
        }
      });
      subscription =
        changeResult && changeResult.data ? changeResult.data.subscription : null;

      sb.auth.getSession().then(function (res) {
        if (res.data && res.data.session) {
          finish(res.data.session);
        }
      });

      setTimeout(function () {
        sb.auth.getSession().then(function (res) {
          finish((res.data && res.data.session) || null);
        });
      }, timeoutMs);
    });

    return oauthWaitPromise;
  }

  markOAuthPending();
  installLoginAlertGuard();

  window.PickleOAuthCallbackGuard = {
    isOAuthCallback: isOAuthCallback,
    isOAuthCallbackHash: isOAuthCallbackHash,
    shouldBlockAuthRedirect: shouldBlockAuthRedirect,
    shouldSuppressLoginAlert: shouldSuppressLoginAlert,
    promptLoginRequired: promptLoginRequired,
    getKakaoOAuthRedirectTo: getKakaoOAuthRedirectTo,
    waitForOAuthSession: waitForOAuthSession,
    clearOAuthHashFromUrl: clearOAuthHashFromUrl,
  };
})();
