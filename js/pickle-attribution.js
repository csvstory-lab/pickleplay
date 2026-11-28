/**
 * P!CKLE — 유입 출처 수집 (SNS 링크의 utm 값, 이전 사이트 주소)
 *
 *  · 처음 들어온 경로(첫 방문)만 이 브라우저에 저장하고, 서버(RPC pickle_record_attribution, SQL 156)로 1회 보냅니다.
 *  · 로그인된 상태가 되면 같은 함수를 한 번 더 불러 "가입한 회원"과 연결합니다. (서버가 가입 직전 방문인지 판단)
 *  · 개인정보는 보내지 않습니다: utm 값 4개, 이전 사이트 "도메인"만, 접속한 "경로"(쿼리 제외).
 *  · 루트 주소(/)는 피드로 바로 이동하며 ?utm_... 값을 버리므로, 이 파일을 entry-page.js 보다 먼저 불러 이동 전에 저장합니다.
 *  · SQL 156 이 아직 적용되지 않았거나 호출이 실패해도 화면 동작에는 영향이 없고, 실패하면 그 접속 중에는 다시 시도하지 않습니다.
 */
(function () {
  'use strict';

  var STORE_KEY = 'pk_attr_v1';
  var ANON_KEY_STORAGE = 'pk_anon_key'; // pickle-mvp.js 와 같은 키(같은 브라우저 식별값)
  var LINKED_FLAG = 'pk_attr_linked_uid';
  var FAIL_FLAG = 'pk_attr_fail';

  function lsGet(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }
  function ssGet(k) {
    try { return window.sessionStorage.getItem(k); } catch (e) { return null; }
  }
  function ssSet(k, v) {
    try { window.sessionStorage.setItem(k, v); } catch (e) { /* ignore */ }
  }

  function getClient() {
    try {
      if (typeof window.getPickleSupabaseClient === 'function') return window.getPickleSupabaseClient();
      if (window.PickleSupabase && window.PickleSupabase.getClient) return window.PickleSupabase.getClient();
      if (window.supabaseClient) return window.supabaseClient;
    } catch (e) { /* ignore */ }
    return null;
  }

  function getAnonKey() {
    var k = lsGet(ANON_KEY_STORAGE);
    if (!k) {
      k = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      if (!lsSet(ANON_KEY_STORAGE, k)) return null;
    }
    return k;
  }

  function clean(v, max) {
    return String(v == null ? '' : v).trim().slice(0, max || 64);
  }

  function readIncoming() {
    var out = { src: '', med: '', cmp: '', cnt: '', ref: '', page: '' };
    try {
      var sp = new URLSearchParams(window.location.search || '');
      out.src = clean(sp.get('utm_source'));
      out.med = clean(sp.get('utm_medium'));
      out.cmp = clean(sp.get('utm_campaign'));
      out.cnt = clean(sp.get('utm_content'));
    } catch (e) { /* 오래된 브라우저: utm 없이 진행 */ }
    try {
      if (document.referrer) {
        var host = new URL(document.referrer).hostname.toLowerCase();
        var own = String(window.location.hostname || '').toLowerCase();
        // 같은 사이트 안에서 이동한 것은 외부 유입이 아님
        if (host && host !== own && !/(^|\.)pickleplay\.kr$/.test(host)) out.ref = host.slice(0, 128);
      }
    } catch (e) { /* ignore */ }
    out.page = clean(window.location.pathname || '/', 128);
    return out;
  }

  function isMeaningful(o) {
    return !!(o && (o.src || o.ref));
  }

  function readStored() {
    try {
      var raw = lsGet(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /** 첫 방문 값을 저장. 처음이 "직접 방문"이었다면 이후 utm/외부 링크 값으로 한 번 갱신 */
  function capture() {
    var incoming = readIncoming();
    var stored = readStored();
    var next = null;

    if (!stored) {
      next = incoming;
    } else if (!isMeaningful(stored) && isMeaningful(incoming)) {
      next = incoming;
    }
    if (next) {
      next.sent = false;
      lsSet(STORE_KEY, JSON.stringify(next));
      return next;
    }
    return stored;
  }

  async function currentUserId(sb) {
    try {
      var res = await sb.auth.getSession();
      var s = res && res.data && res.data.session;
      return s && s.user && s.user.id ? s.user.id : null;
    } catch (e) {
      return null;
    }
  }

  async function flush() {
    if (ssGet(FAIL_FLAG) === '1') return false;
    var sb = getClient();
    var stored = readStored();
    if (!sb || !stored) return false;
    var anon = getAnonKey();
    if (!anon) return false;

    var uid = await currentUserId(sb);
    var needSend = !stored.sent;
    var needLink = !!uid && ssGet(LINKED_FLAG) !== uid;
    if (!needSend && !needLink) return true;

    try {
      var res = await sb.rpc('pickle_record_attribution', {
        p_anon_key: anon,
        p_utm_source: stored.src || null,
        p_utm_medium: stored.med || null,
        p_utm_campaign: stored.cmp || null,
        p_utm_content: stored.cnt || null,
        p_referrer_host: stored.ref || null,
        p_landing_page: stored.page || null,
      });
      if (res && res.error) {
        ssSet(FAIL_FLAG, '1'); // 함수가 없거나 실패 → 이번 접속에서는 더 시도하지 않음
        return false;
      }
      if (needSend) {
        stored.sent = true;
        lsSet(STORE_KEY, JSON.stringify(stored));
      }
      if (uid) ssSet(LINKED_FLAG, uid);
      return true;
    } catch (e) {
      ssSet(FAIL_FLAG, '1');
      return false;
    }
  }

  /** Supabase 클라이언트가 준비될 때까지 잠깐 기다렸다가 전송 (루트 주소처럼 곧 이동하는 페이지에서는 저장만 남음) */
  function flushWhenReady() {
    var tries = 0;
    (function tick() {
      if (getClient()) {
        flush();
        return;
      }
      tries += 1;
      if (tries < 24) setTimeout(tick, 250);
    })();
  }

  window.PickleAttribution = {
    capture: capture,
    flush: flush,
    _read: readStored,
  };

  capture();
  flushWhenReady();
})();
