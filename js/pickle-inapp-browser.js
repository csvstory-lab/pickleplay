/**
 * P!CKLE — 인앱 브라우저(Kakao/Instagram 등) 감지 · 외부 브라우저 탈출
 * Google OAuth disallowed_useragent 대응
 */
(function () {
  'use strict';

  var ATTEMPT_KEY = 'pickle_inapp_escape_attempted';
  var OVERLAY_ID = 'pickleInAppEscapeOverlay';
  var STYLE_ID = 'pickle-inapp-escape-styles';

  var IN_APP_UA_PATTERNS = [
    /KAKAOTALK/i,
    /Instagram/i,
    /FBAN|FBAV/i,
    /FBIOS|FB_IAB/i,
    /Line\//i,
    /Twitter/i,
    /Snapchat/i,
    /LinkedInApp/i,
    /NAVER\(inapp/i,
    /DaumApps/i,
  ];

  function getUA() {
    return String(navigator.userAgent || '');
  }

  function isAndroid() {
    return /Android/i.test(getUA());
  }

  function isIOS() {
    return /iPhone|iPad|iPod/i.test(getUA());
  }

  function isIOSInAppWebView() {
    var ua = getUA();
    if (!isIOS()) return false;
    return /AppleWebKit/i.test(ua) && !/Safari/i.test(ua);
  }

  function isAndroidWebView() {
    var ua = getUA();
    return isAndroid() && (/wv\)/i.test(ua) || /Version\/[\d.]+/i.test(ua) && !/Chrome\/[\d.]+ Mobile Safari/i.test(ua));
  }

  function detectInAppAppName() {
    var ua = getUA();
    var i;
    if (/KAKAOTALK/i.test(ua)) return 'KakaoTalk';
    if (/Instagram/i.test(ua)) return 'Instagram';
    if (/FBAN|FBAV|FBIOS|FB_IAB/i.test(ua)) return 'Facebook';
    if (/Line\//i.test(ua)) return 'LINE';
    if (/Twitter/i.test(ua)) return 'Twitter';
    if (/NAVER\(inapp/i.test(ua)) return 'Naver';
    for (i = 0; i < IN_APP_UA_PATTERNS.length; i++) {
      if (IN_APP_UA_PATTERNS[i].test(ua)) return 'InApp';
    }
    if (isIOSInAppWebView()) return 'InApp';
    if (isAndroidWebView()) return 'InApp';
    return '';
  }

  function isInAppBrowser() {
    return !!detectInAppAppName();
  }

  function buildAndroidIntentUrl(targetUrl) {
    var url = String(targetUrl || window.location.href).split('#')[0];
    var withoutScheme = url.replace(/^https?:\/\//i, '');
    var fallback = encodeURIComponent(url);
    return (
      'intent://' +
      withoutScheme +
      '#Intent;scheme=https;action=android.intent.action.VIEW;' +
      'category=android.intent.category.BROWSABLE;' +
      'package=com.android.chrome;' +
      'S.browser_fallback_url=' +
      fallback +
      ';end'
    );
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '#pickleInAppEscapeOverlay{' +
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
      'padding:20px;background:rgba(0,0,0,0.82);backdrop-filter:blur(6px);' +
      'font-family:Pretendard,-apple-system,BlinkMacSystemFont,sans-serif;' +
      '}' +
      '#pickleInAppEscapeOverlay .pickle-inapp-card{' +
      'width:100%;max-width:360px;background:#18181b;color:#fff;' +
      'border:3px solid #39ff14;border-radius:20px;padding:28px 22px 24px;' +
      'box-shadow:8px 8px 0 #000;text-align:center;' +
      '}' +
      '#pickleInAppEscapeOverlay .pickle-inapp-badge{' +
      'display:inline-block;margin-bottom:14px;padding:6px 12px;' +
      'background:#ff007f;color:#fff;font-size:0.72rem;font-weight:900;' +
      'border:2px solid #000;border-radius:999px;box-shadow:3px 3px 0 #000;' +
      '}' +
      '#pickleInAppEscapeOverlay .pickle-inapp-title{' +
      'margin:0 0 12px;font-family:"Black Han Sans",sans-serif;font-size:1.35rem;' +
      'line-height:1.35;color:#39ff14;text-shadow:0 0 12px rgba(57,255,20,0.35);' +
      '}' +
      '#pickleInAppEscapeOverlay .pickle-inapp-text{' +
      'margin:0 0 18px;font-size:0.88rem;line-height:1.65;color:#d4d4d8;word-break:keep-all;' +
      '}' +
      '#pickleInAppEscapeOverlay .pickle-inapp-text strong{color:#fff;}' +
      '#pickleInAppEscapeOverlay .pickle-inapp-menu-icon{' +
      'display:inline-block;min-width:28px;padding:2px 8px;margin:0 2px;' +
      'background:#27272a;border:2px solid #fff;border-radius:8px;' +
      'font-weight:900;box-shadow:2px 2px 0 #000;' +
      '}' +
      '#pickleInAppEscapeOverlay .pickle-inapp-actions{' +
      'display:flex;flex-direction:column;gap:10px;' +
      '}' +
      '#pickleInAppEscapeOverlay .pickle-inapp-btn{' +
      'width:100%;padding:14px 16px;border:2px solid #000;border-radius:14px;' +
      'font-family:inherit;font-size:0.92rem;font-weight:900;cursor:pointer;' +
      'box-shadow:4px 4px 0 #000;transition:transform 0.15s;' +
      '}' +
      '#pickleInAppEscapeOverlay .pickle-inapp-btn:active{transform:translate(2px,2px);box-shadow:2px 2px 0 #000;}' +
      '#pickleInAppEscapeOverlay .pickle-inapp-btn--primary{' +
      'background:linear-gradient(90deg,#39ff14,#aaff00);color:#000;' +
      '}' +
      '#pickleInAppEscapeOverlay .pickle-inapp-btn--ghost{' +
      'background:#27272a;color:#a1a1aa;' +
      '}';
    document.head.appendChild(style);
  }

  function showEscapeOverlay(options) {
    options = options || {};
    injectStyles();

    var existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      existing.hidden = false;
      existing.style.display = 'flex';
      return;
    }

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'pickleInAppEscapeTitle');

    overlay.innerHTML =
      '<div class="pickle-inapp-card">' +
      '<span class="pickle-inapp-badge">⚠️ 인앱 브라우저 감지</span>' +
      '<h2 class="pickle-inapp-title" id="pickleInAppEscapeTitle">외부 브라우저에서 열어 주세요</h2>' +
      '<p class="pickle-inapp-text">' +
      '안전한 구글 로그인을 위해 현재 브라우저에서는 로그인이 제한됩니다. ' +
      '화면 우측 하단(또는 상단)의 <span class="pickle-inapp-menu-icon">⋮</span> 버튼을 눌러 ' +
      "<strong>'다른 브라우저로 열기(Safari 등)'</strong>를 선택해 주세요." +
      '</p>' +
      '<div class="pickle-inapp-actions">' +
      (isAndroid()
        ? '<button type="button" class="pickle-inapp-btn pickle-inapp-btn--primary" data-pickle-inapp-retry>Chrome으로 다시 열기</button>'
        : '') +
      '<button type="button" class="pickle-inapp-btn pickle-inapp-btn--ghost" data-pickle-inapp-dismiss>확인했어요</button>' +
      '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var dismissBtn = overlay.querySelector('[data-pickle-inapp-dismiss]');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        overlay.style.display = 'none';
      });
    }

    var retryBtn = overlay.querySelector('[data-pickle-inapp-retry]');
    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        tryAndroidIntentEscape(options.targetUrl || window.location.href);
      });
    }
  }

  function tryAndroidIntentEscape(targetUrl) {
    if (!isAndroid()) return false;
    try {
      window.location.href = buildAndroidIntentUrl(targetUrl);
      return true;
    } catch (err) {
      console.warn('[P!CKLE InApp]', err);
      return false;
    }
  }

  function runAutoEscape() {
    if (!isInAppBrowser()) return;

    if (isAndroid()) {
      if (sessionStorage.getItem(ATTEMPT_KEY) === '1') {
        showEscapeOverlay();
        return;
      }
      sessionStorage.setItem(ATTEMPT_KEY, '1');
      tryAndroidIntentEscape(window.location.href);
      window.setTimeout(function () {
        if (isInAppBrowser()) {
          showEscapeOverlay();
        }
      }, 1400);
      return;
    }

    showEscapeOverlay();
  }

  /**
   * Google OAuth 등 외부 브라우저 필수 — true면 호출 측에서 OAuth 중단
   */
  function requireExternalBrowserForOAuth() {
    if (!isInAppBrowser()) return false;

    if (isAndroid() && sessionStorage.getItem(ATTEMPT_KEY) !== '1') {
      sessionStorage.setItem(ATTEMPT_KEY, '1');
      tryAndroidIntentEscape(window.location.href);
      window.setTimeout(function () {
        showEscapeOverlay();
      }, 800);
      return true;
    }

    showEscapeOverlay();
    return true;
  }

  window.PickleInAppBrowser = {
    isInAppBrowser: isInAppBrowser,
    isAndroid: isAndroid,
    isIOS: isIOS,
    detectInAppAppName: detectInAppAppName,
    showEscapeOverlay: showEscapeOverlay,
    tryAndroidIntentEscape: tryAndroidIntentEscape,
    requireExternalBrowserForOAuth: requireExternalBrowserForOAuth,
    runAutoEscape: runAutoEscape,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAutoEscape);
  } else {
    runAutoEscape();
  }
})();
