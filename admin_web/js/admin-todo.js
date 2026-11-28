/**
 * P!CKLE Admin — 대시보드 상단 "처리가 필요한 요청" 카드
 * 서버 함수: pickle_admin_todo_counts (SQL 147). 60초마다 새로 고침.
 */
(function () {
  'use strict';

  var ITEMS = [
    { key: 'appeals',   icon: '📮', label: '이의제기 · 재게시 요청', href: 'admin_reports.html?tab=appeal' },
    { key: 'inquiries', icon: '🎧', label: '미답변 1:1 문의',        href: 'admin_cs.html' },
    { key: 'legal',     icon: '⚖️', label: '권리침해 신고 심사',     href: 'admin_reports.html?tab=legal' },
    { key: 'reports',   icon: '🚨', label: '일반 신고 심사',         href: 'admin_reports.html' },
  ];

  function sb() {
    return window.getPickleSupabaseClient ? window.getPickleSupabaseClient() : null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function waitText(iso) {
    if (!iso) return '';
    var h = (Date.now() - new Date(iso).getTime()) / 3600000;
    if (isNaN(h) || h < 0) return '';
    if (h < 1) return '방금 접수';
    if (h < 24) return '가장 오래된 요청 ' + Math.floor(h) + '시간 전';
    return '가장 오래된 요청 ' + Math.floor(h / 24) + '일 전';
  }

  function render(data) {
    var root = document.getElementById('todoRoot');
    if (!root) return;
    var total = 0;
    var cards = ITEMS.map(function (it) {
      var d = data[it.key];
      if (!d) return '';
      var n = Number(d.count) || 0;
      total += n;
      var hot = n > 0;
      var overdue = hot && d.oldest && (Date.now() - new Date(d.oldest).getTime()) > 24 * 3600000;
      return '<div class="todo-card' + (hot ? ' hot' : '') + '" data-href="' + esc(it.href) + '" role="link" tabindex="0">' +
        '<div class="todo-label">' + it.icon + ' ' + esc(it.label) + '</div>' +
        '<div class="todo-count">' + n + '<span>건</span></div>' +
        '<div class="todo-sub' + (overdue ? ' overdue' : '') + '">' + (hot ? esc(waitText(d.oldest)) : '모두 처리됨 ✅') + '</div></div>';
    }).join('');
    root.innerHTML =
      '<div class="kpi-section-title">🔔 처리가 필요한 요청 ' +
      (total > 0 ? '<span class="todo-total">총 ' + total + '건 대기</span>' : '<span class="todo-total ok">대기 없음</span>') + '</div>' +
      '<div class="todo-grid">' + cards + '</div>';
  }

  async function load() {
    var client = sb();
    var root = document.getElementById('todoRoot');
    if (!client || !root) return;
    try {
      var res = await client.rpc('pickle_admin_todo_counts');
      if (res.error || !res.data || res.data.ok === false) {
        root.innerHTML = ''; // SQL 미적용·권한 없음 → 카드 숨김
        return;
      }
      render(res.data);
    } catch (e) {
      console.warn('[Admin Todo] 불러오기 실패', e);
    }
  }

  document.addEventListener('click', function (e) {
    var card = e.target.closest && e.target.closest('.todo-card');
    if (card && card.getAttribute('data-href')) window.location.href = card.getAttribute('data-href');
  });

  window.AdminTodo = { load: load };

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(load, 600);
    setInterval(load, 60000);
  });
})();
