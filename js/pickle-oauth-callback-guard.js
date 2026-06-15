/**
 * P!CKLE — OAuth 콜백 URL hash 감지 · 세션 대기 · 로그인 알림/리다이렉트 차단
 */
(function () {
  'use strict';

  var oauthWaitPromise = null;
  var oauthWaitInProgress = false;
  var nativeAlert = window.alert;

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

  /** 현재 user_app 기준 index.html — 배포 경로에 맞게 자동 계산 */
  function getKakaoOAuthRedirectTo() {
    return new URL('index.html', window.location.href).href;
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
   * Supabase detectSessionInUrl이 hash를 파싱할 때까지 getSession() 폴링
   * (수동 setSession 호출 없음 — 이중 처리로 세션이 깨지는 것 방지)
   */
  function waitForOAuthSession(options) {
    var timeoutMs = (options && options.timeoutMs) || 12000;

    if (!isOAuthCallback() && !window.__PICKLE_OAUTH_CALLBACK_PENDING) {
      return Promise.resolve(null);
    }

    if (oauthWaitInProgress && oauthWaitPromise) {
      return oauthWaitPromise;
    }

    oauthWaitInProgress = true;
    window.__PICKLE_OAUTH_CALLBACK_PENDING = true;

    oauthWaitPromise = new Promise(function (resolve) {
      var sb = getSupabaseClientForOAuth();
      if (!sb || !sb.auth) {
        setTimeout(function () {
          oauthWaitInProgress = false;
          oauthWaitPromise = null;
          if (!isOAuthCallback()) {
            window.__PICKLE_OAUTH_CALLBACK_PENDING = false;
          }
          resolve(null);
        }, 500);
        return;
      }

      var settled = false;
      var subscription = null;
      var pollTimer = null;
      var timeoutTimer = null;

      function done(session) {
        if (settled) return;
        settled = true;

        if (pollTimer) clearInterval(pollTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (subscription && typeof subscription.unsubscribe === 'function') {
          subscription.unsubscribe();
        }

        oauthWaitInProgress = false;
        oauthWaitPromise = null;

        if (session && session.access_token) {
          window.__PICKLE_OAUTH_CALLBACK_PENDING = false;
          clearOAuthHashFromUrl();
          console.log('[P!CKLE OAuth] session ready', session.user && session.user.id);
          resolve(session);
          return;
        }

        if (isOAuthCallback()) {
          console.warn('[P!CKLE OAuth] hash present but session not established');
          resolve(null);
          return;
        }

        window.__PICKLE_OAUTH_CALLBACK_PENDING = false;
        resolve(null);
      }

      function checkSession() {
        sb.auth.getSession().then(function (res) {
          if (res.data && res.data.session && res.data.session.access_token) {
            done(res.data.session);
          }
        });
      }

      var changeResult = sb.auth.onAuthStateChange(function (event, session) {
        if (
          session &&
          session.access_token &&
          (event === 'SIGNED_IN' ||
            event === 'INITIAL_SESSION' ||
            event === 'TOKEN_REFRESHED')
        ) {
          done(session);
        }
      });
      subscription =
        changeResult && changeResult.data ? changeResult.data.subscription : null;

      checkSession();
      pollTimer = setInterval(checkSession, 100);

      timeoutTimer = setTimeout(function () {
        sb.auth.getSession().then(function (res) {
          done((res.data && res.data.session) || null);
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
