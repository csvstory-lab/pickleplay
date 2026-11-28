/**
 * P!CKLE Admin — 게시물 이의제기 · 재게시 요청 처리 (admin_reports.html 3번째 탭)
 * 서버 함수: pickle_admin_appeals / pickle_admin_resolve_appeal / pickle_admin_appeals_pending_count
 */
(function () {
  'use strict';

  var PAGE_SIZE = 30;
  var state = { status: 'pending', page: 1, rows: [], current: null, busy: false };

  var SOURCE_LABEL = {
    infringement: '⚖️ 권리침해 임시조치',
    report: '🚨 신고 누적/제재',
    admin: '🛠 관리자 직접 숨김',
  };
  var STATUS_LABEL = { pending: '검토 대기', accepted: '재게시 승인', rejected: '반려', withdrawn: '작성자 철회' };

  function sb() {
    return window.getPickleSupabaseClient ? window.getPickleSupabaseClient() : null;
  }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(d) {
    if (!d) return '-';
    var t = new Date(d);
    if (isNaN(t.getTime())) return '-';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return t.getFullYear() + '.' + p(t.getMonth() + 1) + '.' + p(t.getDate()) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes());
  }
  function daysLeft(d) {
    if (!d) return null;
    var ms = new Date(d).getTime() - Date.now();
    return Math.ceil(ms / 86400000);
  }

  function errText(res) {
    var m = {
      forbidden: '권한이 없습니다.',
      not_found: '요청을 찾을 수 없습니다.',
      already_handled: '이미 처리된 요청입니다.',
      note_required: '반려 사유를 5자 이상 입력해 주세요.',
      invalid_decision: '처리 구분이 올바르지 않습니다.',
    };
    return m[res && res.reason] || ('처리하지 못했습니다. (' + ((res && res.reason) || 'error') + ')');
  }

  function renderRows() {
    var tb = $('appealTableBody');
    if (!tb) return;
    if (!state.rows.length) {
      tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-sub);font-weight:800;">해당하는 이의제기가 없습니다.</td></tr>';
      return;
    }
    tb.innerHTML = state.rows.map(function (r, i) {
      var left = daysLeft(r.temp_until);
      var tempInfo = r.blind_source === 'infringement' && r.temp_until
        ? '<div style="font-size:.75rem;color:var(--neon-blue);margin-top:4px;">임시조치 만료 ' + fmt(r.temp_until) + (left != null ? (left > 0 ? ' (D-' + left + ')' : ' (기간 경과)') : '') + '</div>'
        : '';
      var badgeColor = r.status === 'pending' ? 'var(--neon-pink)' : (r.status === 'accepted' ? 'var(--neon-green)' : '#a1a1aa');
      var action = r.status === 'pending'
        ? '<button class="btn-search" style="background:var(--neon-pink);color:#fff;" onclick="AdminAppeals.open(' + i + ')">검토하기</button>'
        : '<button class="btn-search" onclick="AdminAppeals.open(' + i + ')">내용 보기</button>';
      return '<tr>' +
        '<td>' + fmt(r.created_at) + '<div style="font-size:.75rem;color:var(--text-sub);margin-top:4px;">' + esc(r.appeal_no) + '번째 요청</div></td>' +
        '<td>' + esc(r.author_nickname || '(알 수 없음)') + '</td>' +
        '<td><div style="font-weight:800;">' + esc(r.post_title || '(제목 없음)') + '</div>' +
          '<div style="font-size:.75rem;color:var(--text-sub);margin-top:4px;">' + esc(SOURCE_LABEL[r.blind_source] || r.blind_source || '') + ' · 신고 ' + esc(r.report_count) + '건</div>' + tempInfo + '</td>' +
        '<td style="max-width:320px;color:#d4d4d8;">' + esc(String(r.message || '').slice(0, 80)) + (String(r.message || '').length > 80 ? '…' : '') + '</td>' +
        '<td style="text-align:center;"><span style="font-weight:800;color:' + badgeColor + ';">' + esc(STATUS_LABEL[r.status] || r.status) + '</span></td>' +
        '<td style="text-align:center;">' + action + '</td></tr>';
    }).join('');
  }

  function renderPager(total) {
    var el = $('appealPagination');
    if (!el) return;
    var pages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
    var html = '';
    for (var i = 1; i <= pages; i++) {
      html += '<button class="page-btn ' + (i === state.page ? 'active-appeal' : '') + '" onclick="AdminAppeals.go(' + i + ')">' + i + '</button>';
    }
    el.innerHTML = html;
  }

  async function updateBadge() {
    var client = sb();
    if (!client) return;
    var res = await client.rpc('pickle_admin_appeals_pending_count');
    var n = res && !res.error ? Number(res.data) || 0 : 0;
    var el = $('appealPendingCount');
    if (el) el.textContent = n > 0 ? String(n) : '';
    var kpi = $('appealKpiPending');
    if (kpi) kpi.textContent = String(n);
  }

  async function load() {
    var client = sb();
    var tb = $('appealTableBody');
    if (!client || !tb) return;
    var sel = $('appealStatus');
    state.status = sel ? sel.value : state.status;
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--neon-green);font-weight:800;">🔍 불러오는 중...</td></tr>';
    var res = await client.rpc('pickle_admin_appeals', {
      p_status: state.status, p_limit: PAGE_SIZE, p_offset: (state.page - 1) * PAGE_SIZE,
    });
    if (res.error) {
      tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--alert-red);font-weight:800;">불러오지 못했습니다. (141번 SQL 적용 여부를 확인해 주세요) ' + esc(res.error.message || '') + '</td></tr>';
      return;
    }
    state.rows = res.data || [];
    renderRows();
    renderPager(state.rows.length ? Number(state.rows[0].total_count) : 0);
    updateBadge();
  }

  function setFilter() { state.page = 1; load(); }
  function go(p) { state.page = p; load(); }

  function open(i) {
    var r = state.rows[i];
    if (!r) return;
    state.current = r;
    var left = daysLeft(r.temp_until);
    var warn = '';
    if (r.blind_source === 'infringement' && r.infringement_status === 'temporary') {
      warn = '<div style="background:rgba(255,204,0,.08);border:1px solid rgba(255,204,0,.35);border-radius:8px;padding:10px 12px;margin:10px 0;font-size:.85rem;color:#ffcc00;">' +
        '⚠️ 권리침해 신고에 따른 <b>임시조치(30일)</b> 중인 글입니다' + (left != null && left > 0 ? ' (D-' + left + ')' : '') +
        '. 승인하면 신고인의 요청과 충돌할 수 있으니, 신고 건(권리침해 탭)을 먼저 확인하세요. 법적 판단은 전문가 검토를 거치는 것을 권장합니다.</div>';
    }
    var done = r.status !== 'pending';
    $('appealModalBody').innerHTML =
      '<div style="font-size:.8rem;color:var(--text-sub);margin-bottom:6px;">' + esc(SOURCE_LABEL[r.blind_source] || '') + ' · 숨김 일시 ' + fmt(r.blinded_at) + ' · 신고 ' + esc(r.report_count) + '건 · ' + esc(r.appeal_no) + '번째 요청</div>' +
      '<div style="font-weight:900;font-size:1.05rem;margin-bottom:4px;">' + esc(r.post_title || '(제목 없음)') + '</div>' +
      '<div style="font-size:.85rem;color:var(--text-sub);margin-bottom:10px;">작성자: ' + esc(r.author_nickname || '-') + ' · 접수 ' + fmt(r.created_at) + '</div>' +
      warn +
      '<div style="font-weight:800;margin:12px 0 6px;">✍️ 작성자 이의 내용</div>' +
      '<div style="background:#09090b;border:1px solid #3f3f46;border-radius:8px;padding:12px;white-space:pre-wrap;line-height:1.6;max-height:200px;overflow:auto;">' + esc(r.message) + '</div>' +
      (done
        ? '<div style="font-weight:800;margin:14px 0 6px;">📝 처리 결과: ' + esc(STATUS_LABEL[r.status] || r.status) + ' (' + fmt(r.handled_at) + ')</div><div style="background:#09090b;border:1px solid #3f3f46;border-radius:8px;padding:12px;white-space:pre-wrap;">' + esc(r.admin_note || '(메모 없음)') + '</div>'
        : '<div style="font-weight:800;margin:14px 0 6px;">📝 처리 메모 (반려 시 필수 · 작성자에게 알림으로 전달됩니다)</div>' +
          '<textarea id="appealNote" rows="3" maxlength="300" style="width:100%;background:#09090b;border:1px solid #3f3f46;color:#fff;border-radius:8px;padding:10px;font-family:inherit;" placeholder="예) 광고성 문구가 확인되어 숨김을 유지합니다 / 확인 결과 문제가 없어 재게시합니다"></textarea>' +
          '<div style="display:flex;gap:10px;margin-top:14px;">' +
          '<button class="btn-search" style="flex:1;background:var(--neon-green);color:#09090b;" onclick="AdminAppeals.resolve(\'accept\')">✅ 승인 (다시 공개)</button>' +
          '<button class="btn-search" style="flex:1;background:var(--neon-pink);color:#fff;" onclick="AdminAppeals.resolve(\'reject\')">⛔ 반려 (숨김 유지)</button></div>');
    $('appealModal').style.display = 'flex';
  }

  function closeModal() {
    var m = $('appealModal');
    if (m) m.style.display = 'none';
    state.current = null;
  }

  async function resolve(decision, force) {
    var r = state.current;
    var client = sb();
    if (!r || !client || state.busy) return;
    var note = ($('appealNote') && $('appealNote').value) || '';
    if (decision === 'reject' && note.trim().length < 5) {
      alert('반려 사유를 5자 이상 입력해 주세요.');
      return;
    }
    if (!force && !confirm(decision === 'accept' ? '이 불판을 다시 공개할까요?' : '반려하고 숨김을 유지할까요?')) return;
    state.busy = true;
    try {
      var res = await client.rpc('pickle_admin_resolve_appeal', {
        p_appeal_id: r.appeal_id, p_decision: decision, p_note: note, p_force: !!force,
      });
      if (res.error) { alert('처리 중 오류: ' + (res.error.message || '')); return; }
      var d = res.data || {};
      if (!d.ok && d.reason === 'temporary_active') {
        state.busy = false;
        if (confirm('권리침해 임시조치 기간 중인 글입니다.\n그래도 다시 공개할까요?')) {
          return resolve('accept', true);
        }
        return;
      }
      if (!d.ok) { alert(errText(d)); return; }
      alert(decision === 'accept' ? '✅ 재게시 승인 처리되었습니다. 작성자에게 알림이 전달됩니다.' : '⛔ 반려 처리되었습니다. 사유가 작성자에게 전달됩니다.');
      closeModal();
      await load();
    } finally {
      state.busy = false;
    }
  }

  window.AdminAppeals = { load: load, setFilter: setFilter, go: go, open: open, close: closeModal, resolve: resolve, updateBadge: updateBadge };

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(updateBadge, 800);
  });
})();
