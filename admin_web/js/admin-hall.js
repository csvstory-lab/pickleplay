/**
 * P!CKLE Admin — 명예의 전당 후보작 관리
 * 서버 함수: admin_hall_candidates / admin_hall_decide (SQL 155)
 */
(function () {
  'use strict';

  var state = { status: 'pending', year: null, search: '' };
  var categoryMap = {};
  var pendingAction = null; // { postId, decision, title }

  var BADGES = {
    scale: { label: '⚔️ 신의 저울', cls: 'badge-scale' },
    landslide: { label: '👊 반박불가 팩폭', cls: 'badge-landslide' },
    debate: { label: '📢 방구석 100분 토론', cls: 'badge-debate' },
    dopamine: { label: '🚀 도파민 급발진', cls: 'badge-dopamine' },
  };

  var REASON_TEXT = {
    forbidden: '관리자 권한이 필요합니다.',
    note_required: '제외 사유를 입력해 주세요.',
    not_eligible: '공개 중이고 마감된 일반 불판만 선정할 수 있습니다.',
    not_found: '불판을 찾을 수 없습니다.',
    bad_decision: '처리 종류가 올바르지 않습니다.',
  };

  function $(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function client() {
    return window.getPickleSupabaseClient ? window.getPickleSupabaseClient() : null;
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function toast(msg) {
    var el = $('hallToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  async function loadCategories() {
    try {
      var sb = client();
      var res = await sb.from('categories').select('slug, name, icon');
      (res.data || []).forEach(function (c) {
        categoryMap[c.slug] = ((c.icon || '') + ' ' + (c.name || c.slug)).trim();
      });
    } catch (e) { /* 카테고리 이름은 없어도 동작 */ }
  }

  function buildYearOptions() {
    var sel = $('hallYear');
    if (!sel) return;
    var thisYear = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }));
    var html = '<option value="">전체</option>';
    for (var y = thisYear; y >= 2026; y -= 1) {
      html += '<option value="' + y + '">' + y + '년</option>';
    }
    sel.innerHTML = html;
    sel.value = String(thisYear);
    state.year = thisYear;
  }

  function statusBadge(r) {
    if (r.decision === 'approved') return '<span class="status-badge dec-approved">🏅 공식 선정</span>';
    if (r.decision === 'excluded') return '<span class="status-badge dec-excluded">🚫 제외</span>';
    if (r.auto_ok) return '<span class="status-badge dec-pending">검토 대기</span>';
    return '<span class="status-badge dec-auto-no">기준 미달</span>';
  }

  function actionButtons(r) {
    var id = esc(r.post_id);
    var detail = '<button type="button" class="btn-sm btn-detail" data-act="detail" data-id="' + id + '">상세</button>';
    if (r.decision === 'approved') {
      return '<div class="action-btns">' + detail +
        '<button type="button" class="btn-sm btn-exclude" data-act="excluded" data-id="' + id + '">제외로 변경</button>' +
        '<button type="button" class="btn-sm btn-reset-dec" data-act="reset" data-id="' + id + '">되돌리기</button></div>';
    }
    if (r.decision === 'excluded') {
      return '<div class="action-btns">' + detail +
        '<button type="button" class="btn-sm btn-approve" data-act="approved" data-id="' + id + '">선정</button>' +
        '<button type="button" class="btn-sm btn-reset-dec" data-act="reset" data-id="' + id + '">되돌리기</button></div>';
    }
    return '<div class="action-btns">' + detail +
      '<button type="button" class="btn-sm btn-approve" data-act="approved" data-id="' + id + '">선정</button>' +
      '<button type="button" class="btn-sm btn-exclude" data-act="excluded" data-id="' + id + '">제외</button></div>';
  }

  function renderRows(rows) {
    var body = $('hallBody');
    if (!rows.length) {
      var msg = {
        pending: '검토 대기 중인 후보가 없습니다. 🎉',
        approved: '아직 공식 선정한 불판이 없습니다.',
        excluded: '제외한 불판이 없습니다.',
        all: '해당하는 불판이 없습니다.',
      }[state.status];
      body.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#71717a;">' + esc(msg) + '</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (r) {
      var pctA = Number(r.pct_a) || 0;
      var pctB = 100 - pctA;
      var badges = (r.badges || []).map(function (b) {
        var d = BADGES[b];
        return d ? '<span class="badge-chip ' + d.cls + '">' + esc(d.label) + '</span>' : '';
      }).join('') || '<span style="color:#71717a;">—</span>';
      var reports = Number(r.reports) || 0;
      return '<tr data-row="' + esc(r.post_id) + '">' +
        '<td class="post-title-cell"><span class="post-title" title="' + esc(r.title) + '">' + esc(r.title) + '</span>' +
          '<span class="post-author">' + esc(r.author || '이름없음') + '</span>' +
          (r.note ? '<span class="note-line">📝 ' + esc(r.note) + '</span>' : '') + '</td>' +
        '<td><span class="cat-badge">' + esc(categoryMap[r.category] || r.category || '-') + '</span></td>' +
        '<td>' + esc(fmtDate(r.expires_at)) + '</td>' +
        '<td class="vote-summary"><span class="vote-count">총 ' + (Number(r.votes) || 0).toLocaleString('ko-KR') + '표</span>' +
          '<div class="mini-bar-wrapper"><div class="mini-bar-a" style="width:' + pctA + '%"></div><div class="mini-bar-b" style="width:' + pctB + '%"></div></div>' +
          '<div class="vote-pct"><span class="pct-a">A ' + pctA + '%</span><span class="pct-b">B ' + pctB + '%</span></div></td>' +
        '<td>' + (Number(r.comments) || 0).toLocaleString('ko-KR') + '</td>' +
        '<td>' + (reports > 0 ? '<span class="report-warn">⚠️ ' + reports + '건</span>' : '0') + '</td>' +
        '<td>' + badges + '</td>' +
        '<td>' + statusBadge(r) + '</td>' +
        '<td>' + actionButtons(r) + '</td>' +
        '</tr>';
    }).join('');
  }

  function showSqlMissing(show) {
    var el = $('hallSqlMissing');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  async function load() {
    var sb = client();
    if (!sb) return;
    $('hallBody').innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#71717a;">불러오는 중...</td></tr>';
    try {
      var res = await sb.rpc('admin_hall_candidates', {
        p_status: state.status,
        p_year: state.year,
        p_search: state.search || null,
        p_limit: 200,
      });
      if (res.error) {
        var m = String(res.error.message || '').toLowerCase();
        if (res.error.code === 'PGRST202' || m.indexOf('could not find the function') !== -1) {
          showSqlMissing(true);
          $('hallBody').innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#71717a;">SQL 155 적용 후 사용할 수 있습니다.</td></tr>';
          return;
        }
        throw res.error;
      }
      showSqlMissing(false);
      var d = res.data || {};
      if (d.ok === false) {
        $('hallBody').innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#71717a;">' + esc(REASON_TEXT[d.reason] || '불러오지 못했습니다.') + '</td></tr>';
        return;
      }
      var c = d.counts || {};
      $('hallKpiHurdle').textContent = (Number(d.hurdle) || 0).toLocaleString('ko-KR') + '표';
      $('hallKpiActive').textContent = (Number(d.active_users) || 0).toLocaleString('ko-KR') + '명';
      $('hallKpiPending').textContent = c.pending || 0;
      $('hallKpiApproved').textContent = c.approved || 0;
      $('hallKpiExcluded').textContent = c.excluded || 0;
      $('hallTabPending').textContent = '(' + (c.pending || 0) + ')';
      $('hallTabApproved').textContent = '(' + (c.approved || 0) + ')';
      $('hallTabExcluded').textContent = '(' + (c.excluded || 0) + ')';
      var rows = d.rows || [];
      $('hallTotal').textContent = rows.length;
      renderRows(rows);
    } catch (e) {
      console.error('[Admin Hall]', e);
      $('hallBody').innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#fb7185;">불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</td></tr>';
    }
  }

  /* ── 처리 (선정 / 제외 / 되돌리기) ── */
  function openModal(postId, decision, title) {
    pendingAction = { postId: postId, decision: decision, title: title };
    var t = $('hallModalTitle'), p = $('hallModalDesc'), n = $('hallModalNote');
    n.value = '';
    n.style.display = '';
    if (decision === 'approved') {
      t.textContent = '🏅 공식 선정';
      p.innerHTML = '"' + esc(title) + '" 불판을 명예의 전당 후보작으로 <b>공식 선정</b>합니다.<br>작성자에게 알림이 가고 픽클러 점수 +500이 반영됩니다. (메모는 선택)';
      n.placeholder = '선정 메모 (선택)';
    } else if (decision === 'excluded') {
      t.textContent = '🚫 제외';
      p.innerHTML = '"' + esc(title) + '" 불판을 전당 후보작에서 <b>제외</b>합니다. 회원 화면에서 숨겨지며 작성자에게는 알리지 않습니다.<br>이미 선정했던 불판이면 지급한 +500 점수도 회수됩니다.';
      n.placeholder = '제외 사유 (필수) — 예: 저작권 의심, 부적절한 표현';
    } else {
      t.textContent = '↩️ 되돌리기';
      p.innerHTML = '"' + esc(title) + '" 불판의 선정/제외를 취소하고 <b>검토 전 상태</b>로 돌립니다.<br>선정했던 불판이면 지급한 +500 점수도 회수됩니다.';
      n.style.display = 'none';
    }
    $('hallModalBg').classList.add('open');
    if (decision !== 'reset') setTimeout(function () { n.focus(); }, 50);
  }
  function closeModal() {
    $('hallModalBg').classList.remove('open');
    pendingAction = null;
  }

  async function submitModal() {
    if (!pendingAction) return;
    var a = pendingAction;
    var note = $('hallModalNote').value.trim();
    if (a.decision === 'excluded' && !note) {
      toast('제외 사유를 입력해 주세요.');
      return;
    }
    var btn = $('hallModalOk');
    btn.disabled = true;
    try {
      var res = await client().rpc('admin_hall_decide', {
        p_post_id: a.postId,
        p_decision: a.decision,
        p_note: note || null,
      });
      if (res.error) throw res.error;
      var d = res.data || {};
      if (d.ok === false) {
        toast(REASON_TEXT[d.reason] || '처리하지 못했습니다.');
        return;
      }
      closeModal();
      toast(
        (a.decision === 'approved' ? '공식 선정했습니다.' : a.decision === 'excluded' ? '제외했습니다.' : '되돌렸습니다.') +
        (d.bonus_ok === false ? ' (점수 반영은 확인이 필요합니다)' : '')
      );
      await load();
    } catch (e) {
      console.error('[Admin Hall] decide', e);
      toast('처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      btn.disabled = false;
    }
  }

  function bind() {
    $('hallTabs').addEventListener('click', function (e) {
      var b = e.target.closest('.hall-tab');
      if (!b) return;
      state.status = b.getAttribute('data-status');
      document.querySelectorAll('.hall-tab').forEach(function (x) { x.classList.toggle('active', x === b); });
      load();
    });
    $('hallBtnSearch').addEventListener('click', function () {
      state.search = $('hallSearch').value.trim();
      var y = $('hallYear').value;
      state.year = y ? Number(y) : null;
      load();
    });
    $('hallSearch').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('hallBtnSearch').click();
    });
    $('hallBtnReset').addEventListener('click', function () {
      $('hallSearch').value = '';
      buildYearOptions();
      state.search = '';
      load();
    });
    $('hallBody').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      var act = btn.getAttribute('data-act');
      if (act === 'detail') {
        window.location.href = 'admin_post_detail.html?id=' + encodeURIComponent(id);
        return;
      }
      var row = btn.closest('tr');
      var title = row && row.querySelector('.post-title') ? row.querySelector('.post-title').textContent : '';
      openModal(id, act, title);
    });
    $('hallModalCancel').addEventListener('click', closeModal);
    $('hallModalOk').addEventListener('click', submitModal);
    $('hallModalBg').addEventListener('click', function (e) {
      if (e.target === $('hallModalBg')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  function init() {
    buildYearOptions();
    bind();
    return loadCategories().then(load);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var nav = window.PickleAdminNav;
    if (nav && nav.safeInit) nav.safeInit('Hall', init);
    else init();
  });
})();
