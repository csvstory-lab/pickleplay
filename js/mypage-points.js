/**
 * P!CKLE — 마이페이지 포인트 표시 (잔액 + 이용 내역)
 * 서버 함수: pickle_my_points (SQL 144)
 */
(function () {
  'use strict';

  function getClient() {
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.getClient) return window.PickleSupabaseBootstrap.getClient();
    if (window.PickleSupabase && window.PickleSupabase.getClient) return window.PickleSupabase.getClient();
    if (window.getPickleSupabaseClient) return window.getPickleSupabaseClient();
    return null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtNum(n) {
    return Number(n || 0).toLocaleString('ko-KR');
  }
  function fmtDate(d) {
    var t = new Date(d);
    if (!d || isNaN(t.getTime())) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return t.getFullYear() + '.' + p(t.getMonth() + 1) + '.' + p(t.getDate()) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes());
  }

  var cache = null;

  async function fetchPoints() {
    var sb = getClient();
    if (!sb || !sb.auth) return null;
    var sess = await sb.auth.getSession();
    if (!(sess && sess.data && sess.data.session)) return null;
    var res = await sb.rpc('pickle_my_points', { p_limit: 50 });
    if (res.error || !res.data || res.data.ok === false) return null; // SQL 미적용 등 → 조용히 숨김 유지
    return res.data;
  }

  function renderSummary(data) {
    var box = document.querySelector('.point-summary-box');
    if (!box) return;
    var val = document.getElementById('pointSummaryVal');
    if (val) val.innerHTML = '💰 ' + fmtNum(data.balance) + ' <span>P</span>';
    var total = document.getElementById('ptTotalVal');
    if (total) total.textContent = fmtNum(data.balance) + ' P';
    box.classList.remove('feature-hidden');
  }

  function renderList(data) {
    var el = document.getElementById('ptList');
    if (!el) return;
    var logs = (data && data.logs) || [];
    if (!logs.length) {
      el.innerHTML = '<div style="text-align:center;color:#a1a1aa;padding:36px 0;font-weight:700;">아직 포인트 내역이 없어요.<br>투표·댓글·불판 작성으로 포인트를 모아보세요!</div>';
      return;
    }
    el.innerHTML = logs.map(function (l) {
      var amt = Number(l.amount) || 0;
      return '<div class="pt-item"><div class="pt-info"><div class="pt-title">' + esc(l.reason) + '</div>' +
        '<div class="pt-date">' + fmtDate(l.created_at) + '</div></div>' +
        '<div class="pt-amount ' + (amt >= 0 ? 'pt-plus' : 'pt-minus') + '">' + (amt >= 0 ? '+' : '') + fmtNum(amt) + ' P</div></div>';
    }).join('');
  }

  async function refresh() {
    try {
      var data = await fetchPoints();
      if (!data) return;
      cache = data;
      renderSummary(data);
      renderList(data);
    } catch (e) {
      console.warn('[P!CKLE Mypage] 포인트 표시 실패', e);
    }
  }

  var original = window.openPointSheet;
  window.openPointSheet = function () {
    if (typeof original === 'function') original();
    if (cache) renderList(cache);
    refresh();
  };

  window.PickleMypagePoints = { refresh: refresh };

  if (document.readyState === 'complete') refresh();
  else window.addEventListener('load', function () { setTimeout(refresh, 300); });
})();
