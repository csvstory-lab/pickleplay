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

  function isSessionStoredInLocalStorage() {
    if (window.PickleAuth && window.PickleAuth.isSessionStoredInLocalStorage) {
      return window.PickleAuth.isSessionStoredInLocalStorage();
    }
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf('sb-') === 0 && key.indexOf('-auth-token') !== -1) {
          var raw = localStorage.getItem(key);
          if (raw && raw.indexOf('access_token') !== -1) {
            return true;
          }
        }
      }
    } catch (e) {
      /* ignore */
    }
    return false;
  }

  /**
   * setSession 성공 후 localStorage persist 확인 (hash 제거 전 필수)
   */
  function waitForSessionStored(sb, timeoutMs) {
    var limit = timeoutMs || 5000;
    var pollMs = 100;
    var started = Date.now();

    return new Promise(function (resolve) {
      function attempt() {
        if (!sb || !sb.auth) {
          resolve(false);
          return;
        }

        sb.auth.getSession().then(function (res) {
          var session = res.data && res.data.session;
          if (session && session.access_token && isSessionStoredInLocalStorage()) {
            resolve(true);
            return;
          }
          if (Date.now() - started >= limit) {
            resolve(false);
            return;
          }
          setTimeout(attempt, pollMs);
        }).catch(function () {
          if (Date.now() - started >= limit) {
            resolve(false);
            return;
          }
          setTimeout(attempt, pollMs);
        });
      }

      attempt();
    });
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
   * URL hash에 OAuth 토큰이 있을 때 Supabase 세션 파싱 + localStorage 저장 완료까지 대기
   * @returns {Promise<object|null>} session 또는 null
   */
  function waitForOAuthSession(options) {
    var timeoutMs = (options && options.timeoutMs) || 8000;

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
          oauthWaitInProgress = false;
          if (!isOAuthCallback()) {
            window.__PICKLE_OAUTH_CALLBACK_PENDING = false;
          }
          resolve(null);
        }, timeoutMs);
        return;
      }

      var settled = false;
      var subscription = null;

      function finalize(session, stored) {
        if (settled) return;
        settled = true;

        if (subscription && typeof subscription.unsubscribe === 'function') {
          subscription.unsubscribe();
        }

        oauthWaitInProgress = false;

        if (session && stored) {
          window.__PICKLE_OAUTH_CALLBACK_PENDING = false;
          clearOAuthHashFromUrl();
          resolve(session);
          return;
        }

        if (session && !stored) {
          console.warn(
            '[P!CKLE OAuth] session detected but localStorage persist not confirmed — hash kept'
          );
          resolve(session);
          return;
        }

        if (isOAuthCallback()) {
          resolve(null);
          return;
        }

        window.__PICKLE_OAUTH_CALLBACK_PENDING = false;
        resolve(null);
      }

      function finish(session) {
        if (settled) return;

        if (session && sb.auth && typeof sb.auth.setSession === 'function') {
          sb.auth
            .setSession({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            })
            .then(function () {
              return waitForSessionStored(sb, 5000);
            })
            .then(function (stored) {
              finalize(session, stored);
            })
            .catch(function (err) {
              console.warn('[P!CKLE OAuth] setSession failed', err);
              waitForSessionStored(sb, 2000).then(function (stored) {
                finalize(session, stored);
              });
            });
          return;
        }

        if (session) {
          waitForSessionStored(sb, 3000).then(function (stored) {
            finalize(session, stored);
          });
          return;
        }

        finalize(null, false);
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
    waitForSessionStored: waitForSessionStored,
    clearOAuthHashFromUrl: clearOAuthHashFromUrl,
  };
})();
