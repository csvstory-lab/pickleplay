/**
 * P!CKLE — MVP 보조 기능
 *  1) 퍼널 계측: PickleMvp.logEvent(name, props)  → RPC pickle_log_event (SQL 134)
 *  2) 연속 참여 칩: 메인 상단에 "🔥 연속 N일" 표시        → RPC pickle_my_streak (SQL 134)
 *  3) 본인인증 안내 팝업: PickleMvp.showVerifyPrompt()    → 인증 연동 후 PickleVerify.start() 호출
 *
 * SQL 134 가 아직 적용되지 않았거나 RPC 호출이 실패해도 화면 동작에는 영향이 없도록
 * 모든 호출은 조용히 실패(try/catch)합니다.
 */
(function () {
  'use strict';

  var ANON_KEY_STORAGE = 'pk_anon_key';
  var MVP_SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  var DAILY_OPEN_STORAGE = 'pk_daily_open_date';

  function getClient() {
    try {
      if (typeof window.getPickleSupabaseClient === 'function') return window.getPickleSupabaseClient();
      if (window.PickleSupabase && window.PickleSupabase.getClient) return window.PickleSupabase.getClient();
      if (window.supabaseClient) return window.supabaseClient;
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function getAnonKey() {
    try {
      var k = window.localStorage.getItem(ANON_KEY_STORAGE);
      if (!k) {
        k = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        window.localStorage.setItem(ANON_KEY_STORAGE, k);
      }
      return k;
    } catch (e) {
      return null;
    }
  }

  function logEvent(name, props) {
    var sb = getClient();
    if (!sb || !name) return;
    try {
      sb.rpc('pickle_log_event', {
        p_name: name,
        p_anon_key: getAnonKey(),
        p_props: props || {},
      }).then(
        function () {},
        function () {}
      );
    } catch (e) {
      /* ignore */
    }
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function logDailyOpenOnce() {
    try {
      var key = todayKey();
      if (window.localStorage.getItem(DAILY_OPEN_STORAGE) === key) return;
      window.localStorage.setItem(DAILY_OPEN_STORAGE, key);
    } catch (e) {
      /* 저장소를 못 써도 계측은 시도 */
    }
    logEvent('daily_open', { page: (location.pathname || '').split('/').pop() || 'index' });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── 연속 참여 칩 ───────────────────────────────────────────── */
  async function renderStreakChip() {
    var main = document.querySelector('main');
    var sb = getClient();
    if (!main || !sb || document.getElementById('pickleStreakChip')) return;

    try {
      var sess = await sb.auth.getSession();
      if (!sess || !sess.data || !sess.data.session) return;

      var res = await sb.rpc('pickle_my_streak');
      if (res.error || !res.data || !res.data.ok) return;

      var cur = Number(res.data.current || 0);
      var votedToday = !!res.data.voted_today;
      var text;
      if (cur <= 0) {
        text = '오늘 첫 픽으로 연속 참여를 시작해 보세요';
      } else if (votedToday) {
        text = cur + '일 연속 참여 중! 내일도 이어가 보세요';
      } else {
        text = cur + '일 연속 참여 중 · 오늘 한 번 고르면 이어져요';
      }

      var chip = document.createElement('div');
      chip.id = 'pickleStreakChip';
      chip.setAttribute(
        'style',
        'margin:10px 16px 0;padding:10px 14px;border-radius:12px;background:rgba(57,255,20,0.08);' +
          'border:1px solid rgba(57,255,20,0.25);color:#d4d4d8;font-size:0.82rem;font-weight:800;' +
          'display:flex;align-items:center;gap:8px;'
      );
      chip.innerHTML = '<span aria-hidden="true">🔥</span><span>' + escapeHtml(text) + '</span>';
      main.insertBefore(chip, main.firstChild);
    } catch (e) {
      /* ignore */
    }
  }

  /* ── 본인인증 안내 팝업 ─────────────────────────────────────── */
  function showVerifyPrompt(options) {
    var old = document.getElementById('pickleVerifyPrompt');
    if (old) old.remove();

    var opts = options || {};
    logEvent('verify_prompt_view', { from: opts.from || 'coupon' });

    var overlay = document.createElement('div');
    overlay.id = 'pickleVerifyPrompt';
    overlay.setAttribute(
      'style',
      'position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:999;display:flex;' +
        'align-items:center;justify-content:center;padding:24px;'
    );
    overlay.innerHTML =
      '<div style="background:#18181b;border:1px solid #39ff14;border-radius:18px;padding:26px 22px;max-width:330px;width:100%;text-align:center;">' +
      '<div style="font-size:2.2rem;margin-bottom:10px;">🎟️</div>' +
      '<div style="font-size:1.02rem;font-weight:900;color:#fff;margin-bottom:8px;">본인인증하면 쿠폰 추첨에 참여할 수 있어요</div>' +
      '<div style="font-size:0.82rem;color:#a1a1aa;line-height:1.6;margin-bottom:16px;">' +
      '투표는 인증 없이도 계속 즐길 수 있어요.<br>쿠폰 혜택은 1인 1계정 확인을 위해 본인인증을 마친 회원에게만 드려요.<br>' +
      '주민등록번호는 수집하지 않아요.</div>' +
      '<button type="button" id="pickleVerifyPromptStart" style="width:100%;padding:13px;border:none;border-radius:12px;' +
      'background:#39ff14;color:#000;font-weight:900;margin-bottom:8px;">본인인증하고 쿠폰 받기</button>' +
      '<button type="button" id="pickleVerifyPromptClose" style="width:100%;padding:11px;border:none;border-radius:12px;' +
      'background:transparent;color:#71717a;font-weight:800;">나중에 할게요</button>' +
      '</div>';
    document.body.appendChild(overlay);

    function close(abandon) {
      if (abandon) logEvent('verify_abandon', { step: 'prompt' });
      overlay.remove();
    }

    document.getElementById('pickleVerifyPromptClose').addEventListener('click', function () {
      close(true);
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close(true);
    });
    document.getElementById('pickleVerifyPromptStart').addEventListener('click', function () {
      logEvent('verify_start', { from: opts.from || 'coupon' });
      if (window.PickleVerify && typeof window.PickleVerify.start === 'function') {
        close(false);
        window.PickleVerify.start();
      } else {
        // 본인인증 연동 전: 안내만 표시
        alert('본인인증은 곧 열릴 예정이에요. 조금만 기다려 주세요!');
      }
    });
  }

  window.PickleMvp = {
    logEvent: logEvent,
    showVerifyPrompt: showVerifyPrompt,
  };

  /** 약관 동의 확인 팝업: 같은 폴더의 pickle-consent.js 를 불러와 실행 (실패해도 무시) */
  function ensureConsent() {
    try {
      if (window.PickleConsent && window.PickleConsent.ensure) {
        window.PickleConsent.ensure();
        return;
      }
      if (!MVP_SCRIPT_SRC || document.getElementById('pickleConsentScript')) return;
      var s = document.createElement('script');
      s.id = 'pickleConsentScript';
      s.src = MVP_SCRIPT_SRC.replace(/pickle-mvp\.js.*$/, 'pickle-consent.js?v=20261128_c1');
      s.onload = function () {
        if (window.PickleConsent && window.PickleConsent.ensure) window.PickleConsent.ensure();
      };
      document.head.appendChild(s);
    } catch (e) {
      /* ignore */
    }
  }

  function init() {
    ensureConsent();
    logDailyOpenOnce();
    var page = (location.pathname || '').split('/').pop();
    if (page === '' || page === 'index.html') {
      renderStreakChip();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
