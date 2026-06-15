/**
 * P!CKLE — Supabase 설정 로드·검증 (공통)
 *
 * HTML script 순서 (필수):
 *   1) @supabase/supabase-js CDN
 *   2) supabase-config.js  (+ onload/onerror 플래그 권장)
 *   3) supabase-bootstrap.js
 *   4) 페이지별 JS (login-page.js 등)
 */
(function () {
  'use strict';

  var cachedClient = null;

  var PLACEHOLDER_PATTERNS = [
    'YOUR_SUPABASE',
    'YOUR_PROJECT_REF',
    'YOUR_PUBLISHABLE',
    'YOUR_ANON',
    'your-project-ref',
  ];

  function isPlaceholder(value) {
    var s = String(value || '').trim();
    if (!s) return true;
    var lower = s.toLowerCase();
    for (var i = 0; i < PLACEHOLDER_PATTERNS.length; i++) {
      if (lower.indexOf(PLACEHOLDER_PATTERNS[i].toLowerCase()) !== -1) {
        return true;
      }
    }
    return false;
  }

  function readConfig() {
    return window.PICKLE_SUPABASE_CONFIG || null;
  }

  function getScriptLoadState() {
    if (window.__PICKLE_CONFIG_SCRIPT_OK === false) {
      return 'failed';
    }
    if (window.__PICKLE_CONFIG_SCRIPT_OK === true) {
      return 'ok';
    }
    return 'unknown';
  }

  /**
   * @returns {string|null} 사용자-facing 오류 메시지. 정상이면 null
   */
  function getErrorMessage() {
    var loadState = getScriptLoadState();

    if (loadState === 'failed') {
      return (
        'Supabase 설정 파일(js/supabase-config.js)을 불러오지 못했습니다.\n\n' +
        '배포 환경(Vercel 등)에 supabase-config.js가 포함되어 있는지, ' +
        '경로(../js/ 또는 js/)가 맞는지 확인해 주세요.'
      );
    }

    var cfg = readConfig();
    if (!cfg) {
      if (loadState === 'unknown') {
        return (
          'Supabase 접속 정보가 아직 로드되지 않았습니다.\n\n' +
          'script 순서: Supabase CDN → supabase-config.js → supabase-bootstrap.js → 페이지 JS'
        );
      }
      return (
        'Supabase 접속 정보가 없습니다.\n\n' +
        'js/supabase-config.example.js 를 복사해 supabase-config.js 를 만들고 ' +
        'url, anonKey 를 입력해 주세요.'
      );
    }

    var url = String(cfg.url || '').trim();
    var anonKey = String(cfg.anonKey || '').trim();

    if (!url || !anonKey) {
      return 'Supabase url 또는 anonKey가 비어 있습니다. js/supabase-config.js 를 확인해 주세요.';
    }

    if (isPlaceholder(url) || isPlaceholder(anonKey)) {
      return (
        'Supabase URL/anonKey가 아직 예시 값입니다.\n\n' +
        'Supabase 대시보드 → Settings → API 값으로 js/supabase-config.js 를 수정해 주세요.'
      );
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      return 'Supabase JS 라이브러리가 로드되지 않았습니다. 페이지를 새로고침해 주세요.';
    }

    return null;
  }

  function isReady() {
    return getErrorMessage() === null;
  }

  function assertReady() {
    var msg = getErrorMessage();
    if (msg) {
      throw new Error(msg);
    }
  }

  function normalizeSupabaseUrl(url) {
    return String(url || '')
      .trim()
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/+$/, '');
  }

  function getClient() {
    assertReady();
    if (!cachedClient) {
      var cfg = readConfig();
      cachedClient = window.supabase.createClient(
        normalizeSupabaseUrl(cfg.url),
        String(cfg.anonKey).trim(),
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        }
      );
    }
    return cachedClient;
  }

  window.PickleSupabaseBootstrap = {
    isReady: isReady,
    getErrorMessage: getErrorMessage,
    assertReady: assertReady,
    getClient: getClient,
    readConfig: readConfig,
  };
})();
