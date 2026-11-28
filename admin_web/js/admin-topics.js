/**
 * P!CKLE Admin — 주제 분류 (데이터 상품)
 * 서버 함수(SQL 158): admin_topic_list / admin_topic_queue / admin_topic_set / admin_topic_confirm_suggested /
 *                     admin_topic_run_suggest / admin_topic_upsert / admin_topic_keywords /
 *                     admin_topic_keyword_upsert / admin_topic_keyword_delete
 */
(function () {
  'use strict';

  var PAGE_SIZE = 50;
  var state = {
    view: 'queue',
    status: 'pending',
    search: '',
    offset: 0,
    total: 0,
    rows: [],
    topics: [],
    canEdit: false,
    selected: {},
    editing: null, // 수정 중인 topic_id (null = 추가)
  };

  var REASON_TEXT = {
    forbidden: '이 작업을 할 권한이 없습니다.',
    bad_count: '한 번에 1~200개까지 처리할 수 있습니다.',
    topic_not_assignable: '이 주제는 직접 지정할 수 없습니다. 소분류가 있는 주제는 소분류를 골라 주세요.',
    bad_name: '이름은 1~30자로 입력해 주세요.',
    bad_parent: '위치가 올바르지 않습니다. (대분류 아래에만 소분류를 만들 수 있습니다)',
    duplicate_name: '같은 위치에 같은 이름의 주제가 이미 있습니다.',
    has_children: '소분류가 있는 대분류는 소분류로 옮길 수 없습니다.',
    not_found: '대상을 찾을 수 없습니다.',
    bad_keyword: '키워드는 2~20자로 입력해 주세요.',
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
    var el = $('tpToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 2800);
  }
  function showSqlMissing(on) {
    var el = $('tpSqlMissing');
    if (el) el.style.display = on ? 'block' : 'none';
  }
  function isMissingFn(err) {
    var m = String((err && err.message) || '').toLowerCase();
    return !!err && (err.code === 'PGRST202' || m.indexOf('could not find the function') !== -1);
  }

  /** RPC 호출 공통 처리. 성공하면 data 반환, 실패하면 안내 후 null */
  async function call(fn, args) {
    var sb = client();
    if (!sb) {
      toast('연결을 준비하지 못했습니다. 새로고침해 주세요.');
      return null;
    }
    var res;
    try {
      res = await sb.rpc(fn, args || {});
    } catch (e) {
      toast('네트워크 오류가 발생했습니다.');
      return null;
    }
    if (res.error) {
      if (isMissingFn(res.error)) {
        showSqlMissing(true);
      } else {
        toast('오류: ' + (res.error.message || '알 수 없는 오류'));
      }
      return null;
    }
    var d = res.data;
    if (!d || d.ok !== true) {
      toast(REASON_TEXT[d && d.reason] || '처리하지 못했습니다.');
      return null;
    }
    showSqlMissing(false);
    return d;
  }

  /* ───────── 주제 선택 목록 ───────── */
  function topicLabel(t) {
    return t.name + (t.is_political ? ' (판매 제외)' : '');
  }
  function assignableOptionsHtml(placeholder) {
    var topics = state.topics.filter(function (t) { return t.is_active; });
    var tops = topics.filter(function (t) { return t.parent_id == null; });
    var html = '<option value="">' + esc(placeholder || '주제 선택') + '</option>';
    tops.forEach(function (p) {
      var kids = topics.filter(function (t) { return t.parent_id === p.topic_id; });
      if (kids.length) {
        html += '<optgroup label="' + esc(p.name) + '">';
        kids.forEach(function (k) {
          html += '<option value="' + k.topic_id + '">' + esc(topicLabel(k)) + '</option>';
        });
        html += '</optgroup>';
      } else {
        html += '<option value="' + p.topic_id + '">' + esc(topicLabel(p)) + '</option>';
      }
    });
    return html;
  }
  function refreshTopicSelects() {
    var b = $('tpBulkTopic');
    if (b) b.innerHTML = assignableOptionsHtml('일괄 지정할 주제');
    var k = $('tpKwTopic');
    if (k) k.innerHTML = assignableOptionsHtml('주제 선택');
  }

  /* ───────── 불판 분류 ───────── */
  function statusChips(r) {
    var chips = '';
    if (r.status === 'confirmed') chips += '<span class="tp-chip conf">확정</span>';
    else if (r.status === 'suggested') chips += '<span class="tp-chip sug">추천</span>';
    else chips += '<span class="tp-chip none">없음</span>';
    if (r.topic_name) chips += '<b>' + esc(r.topic_name) + '</b>';
    if (r.is_political) chips += ' <span class="tp-chip pol">판매 제외</span>';
    return chips;
  }

  function renderRows() {
    var body = $('tpBody');
    var rows = state.rows;
    if (!rows.length) {
      var msg = state.status === 'pending' ? '분류할 불판이 없습니다. 🎉' : '해당하는 불판이 없습니다.';
      body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#71717a;">' + esc(msg) + '</td></tr>';
      return;
    }
    var optionsHtml = assignableOptionsHtml('주제 선택');
    body.innerHTML = rows.map(function (r) {
      var id = esc(r.post_id);
      var checked = state.selected[r.post_id] ? ' checked' : '';
      var spon = r.is_sponsor ? ' <span class="tp-chip spon">스폰서</span>' : '';
      var btnLabel = r.status === 'confirmed' ? '변경' : '확정';
      return '<tr data-id="' + id + '">' +
        '<td><input type="checkbox" class="tp-row-check" data-id="' + id + '"' + checked + '></td>' +
        '<td class="post-title-cell"><span class="post-title" title="' + esc(r.title) + '">' + esc(r.title) + '</span>' + spon + '</td>' +
        '<td><span class="cat-badge">' + esc(r.category_name || r.category || '—') + '</span></td>' +
        '<td>' + esc(fmtDate(r.created_at)) + '</td>' +
        '<td>' + statusChips(r) +
          (r.status === 'confirmed' && r.confirmed_by ? '<span class="tp-sub" style="display:block;">' + esc(r.confirmed_by) + '</span>' : '') + '</td>' +
        '<td><select class="admin-select tp-row-select" data-id="' + id + '" data-current="' + (r.topic_id == null ? '' : r.topic_id) + '">' + optionsHtml + '</select></td>' +
        '<td><button type="button" class="btn-sm btn-confirm" data-act="set" data-id="' + id + '">' + btnLabel + '</button></td>' +
        '</tr>';
    }).join('');
    // 현재(추천/확정) 주제를 선택 상자에 미리 채워 둠
    body.querySelectorAll('select.tp-row-select').forEach(function (sel) {
      var cur = sel.getAttribute('data-current');
      if (cur) sel.value = cur;
    });
  }

  function renderCounts(c) {
    c = c || {};
    $('tpKpiUnclassified').textContent = c.unclassified != null ? c.unclassified : '—';
    $('tpKpiSuggested').textContent = c.suggested != null ? c.suggested : '—';
    $('tpKpiConfirmed').textContent = c.confirmed != null ? c.confirmed : '—';
    $('tpKpiPolitical').textContent = c.political != null ? c.political : '—';
    var pending = (Number(c.unclassified) || 0) + (Number(c.suggested) || 0);
    $('tpTabPending').textContent = c.unclassified != null ? '(' + pending + ')' : '';
    $('tpTabConfirmed').textContent = c.confirmed != null ? '(' + c.confirmed + ')' : '';
  }

  function updateSelCount() {
    var n = Object.keys(state.selected).length;
    $('tpSelCount').textContent = n + '개 선택';
    var all = $('tpCheckAll');
    if (all) {
      var vis = state.rows.length;
      all.checked = vis > 0 && state.rows.every(function (r) { return state.selected[r.post_id]; });
    }
  }

  function updatePager() {
    var page = Math.floor(state.offset / PAGE_SIZE) + 1;
    var pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    $('tpPageInfo').textContent = page + ' / ' + pages;
    $('tpPrev').disabled = state.offset <= 0;
    $('tpNext').disabled = state.offset + PAGE_SIZE >= state.total;
  }

  async function loadQueue() {
    var d = await call('admin_topic_queue', {
      p_status: state.status,
      p_search: state.search || null,
      p_limit: PAGE_SIZE,
      p_offset: state.offset,
    });
    if (!d) {
      $('tpBody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#71717a;">불러오지 못했습니다.</td></tr>';
      return;
    }
    state.rows = d.rows || [];
    state.total = Number(d.total) || 0;
    // 한 페이지 넘어가 비어 버리면 앞으로
    if (!state.rows.length && state.offset > 0) {
      state.offset = Math.max(0, state.offset - PAGE_SIZE);
      return loadQueue();
    }
    $('tpTotal').textContent = state.total;
    renderCounts(d.counts);
    renderRows();
    updateSelCount();
    updatePager();
  }

  async function setOne(postId) {
    var sel = document.querySelector('select.tp-row-select[data-id="' + postId + '"]');
    var topicId = sel && sel.value ? Number(sel.value) : null;
    if (!topicId) {
      toast('주제를 선택해 주세요.');
      return;
    }
    var d = await call('admin_topic_set', { p_post_ids: [postId], p_topic_id: topicId });
    if (!d) return;
    toast('확정했습니다.');
    delete state.selected[postId];
    await loadQueue();
  }

  function selectedIds() {
    return Object.keys(state.selected);
  }

  async function bulkConfirmSuggested() {
    var ids = selectedIds();
    if (!ids.length) {
      toast('먼저 불판을 선택해 주세요.');
      return;
    }
    var d = await call('admin_topic_confirm_suggested', { p_post_ids: ids });
    if (!d) return;
    toast(d.updated + '건을 추천대로 확정했습니다.' + (d.updated < ids.length ? ' (추천 상태가 아닌 ' + (ids.length - d.updated) + '건은 건너뜀)' : ''));
    state.selected = {};
    await loadQueue();
  }

  async function bulkSet() {
    var ids = selectedIds();
    var topicId = $('tpBulkTopic').value ? Number($('tpBulkTopic').value) : null;
    if (!ids.length) {
      toast('먼저 불판을 선택해 주세요.');
      return;
    }
    if (!topicId) {
      toast('일괄 지정할 주제를 선택해 주세요.');
      return;
    }
    var d = await call('admin_topic_set', { p_post_ids: ids, p_topic_id: topicId });
    if (!d) return;
    toast(d.updated + '건을 확정했습니다.');
    state.selected = {};
    await loadQueue();
  }

  async function runSuggest(redo) {
    var d = await call('admin_topic_run_suggest', { p_redo: !!redo });
    if (!d) return;
    toast(d.suggested + '건에 추천 주제를 ' + (redo ? '다시 ' : '') + '붙였습니다.');
    await loadQueue();
  }

  /* ───────── 주제·키워드 설정 ───────── */
  function renderTopics() {
    var body = $('tpTopicBody');
    var tops = state.topics.filter(function (t) { return t.parent_id == null; });
    var html = '';
    tops.forEach(function (p) {
      html += topicRow(p, false);
      state.topics.filter(function (t) { return t.parent_id === p.topic_id; }).forEach(function (k) {
        html += topicRow(k, true);
      });
    });
    body.innerHTML = html || '<tr><td colspan="7" style="text-align:center;padding:30px;color:#71717a;">주제가 없습니다.</td></tr>';
    $('tpAddTopicRow').style.display = state.canEdit ? '' : 'none';
    $('tpKwForm').style.display = state.canEdit ? '' : 'none';
    $('tpEditNote').style.display = state.canEdit ? 'none' : '';
  }
  function topicRow(t, child) {
    var kind = child ? '소분류' : (state.topics.some(function (x) { return x.parent_id === t.topic_id; }) ? '대분류 (소분류 있음)' : '대분류');
    return '<tr>' +
      '<td>' + (child ? '<span class="tp-indent"></span>└ ' : '') + '<b>' + esc(t.name) + '</b></td>' +
      '<td>' + esc(kind) + '</td>' +
      '<td>' + (t.is_political ? '<span class="tp-chip pol">제외</span>' : '<span class="tp-chip conf">포함</span>') + '</td>' +
      '<td>' + (t.is_active ? '사용 중' : '<span class="tp-sub">사용 안 함</span>') + '</td>' +
      '<td>' + (Number(t.confirmed_count) || 0) + '</td>' +
      '<td>' + (Number(t.suggested_count) || 0) + '</td>' +
      '<td>' + (state.canEdit ? '<button type="button" class="btn-sm btn-detail" data-act="edit" data-id="' + t.topic_id + '">수정</button>' : '') + '</td>' +
      '</tr>';
  }

  async function loadTopics() {
    var d = await call('admin_topic_list', {});
    if (!d) return false;
    state.topics = d.topics || [];
    state.canEdit = !!d.can_edit;
    refreshTopicSelects();
    renderTopics();
    return true;
  }

  async function loadKeywords() {
    var d = await call('admin_topic_keywords', {});
    if (!d) return;
    var groups = {};
    var order = [];
    (d.keywords || []).forEach(function (k) {
      if (!groups[k.topic_name]) {
        groups[k.topic_name] = [];
        order.push(k.topic_name);
      }
      groups[k.topic_name].push(k.keyword);
    });
    $('tpKwList').innerHTML = order.map(function (name) {
      return '<div class="tp-kw-group"><div class="tp-kw-title">' + esc(name) + ' <span class="tp-sub">' + groups[name].length + '개</span></div>' +
        groups[name].map(function (kw) {
          return '<span class="tp-kw">' + esc(kw) +
            (state.canEdit ? '<button type="button" data-act="kwdel" data-kw="' + esc(kw) + '" title="삭제">×</button>' : '') + '</span>';
        }).join('') + '</div>';
    }).join('') || '<div class="tp-sub">등록된 키워드가 없습니다.</div>';
  }

  async function addKeyword() {
    var kw = $('tpKwInput').value.trim();
    var topicId = $('tpKwTopic').value ? Number($('tpKwTopic').value) : null;
    if (!kw || !topicId) {
      toast('키워드와 주제를 모두 입력해 주세요.');
      return;
    }
    var d = await call('admin_topic_keyword_upsert', { p_keyword: kw, p_topic_id: topicId });
    if (!d) return;
    $('tpKwInput').value = '';
    toast('키워드를 저장했습니다. "추천 다시 계산"을 누르면 반영됩니다.');
    await loadKeywords();
  }

  async function deleteKeyword(kw) {
    if (!window.confirm('키워드 "' + kw + '"를 삭제할까요?')) return;
    var d = await call('admin_topic_keyword_delete', { p_keyword: kw });
    if (!d) return;
    toast('삭제했습니다.');
    await loadKeywords();
  }

  /* ───────── 주제 추가/수정 모달 ───────── */
  function openTopicModal(topicId) {
    var t = topicId == null ? null : state.topics.filter(function (x) { return x.topic_id === topicId; })[0];
    state.editing = t ? t.topic_id : null;
    $('tpModalTitle').textContent = t ? '주제 수정' : '주제 추가';
    $('tpMName').value = t ? t.name : '';
    $('tpMSort').value = t ? t.sort_order : 0;
    $('tpMPolitical').checked = t ? !!t.is_political : false;
    $('tpMActive').checked = t ? !!t.is_active : true;
    var hasKids = t && state.topics.some(function (x) { return x.parent_id === t.topic_id; });
    var opts = '<option value="">(대분류로 만들기)</option>';
    state.topics.filter(function (x) { return x.parent_id == null && (!t || x.topic_id !== t.topic_id); }).forEach(function (p) {
      opts += '<option value="' + p.topic_id + '">' + esc(p.name) + ' 아래 소분류</option>';
    });
    $('tpMParent').innerHTML = opts;
    $('tpMParent').value = t && t.parent_id != null ? String(t.parent_id) : '';
    $('tpMParent').disabled = !!hasKids;
    $('tpModalBg').classList.add('open');
    $('tpMName').focus();
  }
  function closeTopicModal() {
    $('tpModalBg').classList.remove('open');
    state.editing = null;
  }
  async function saveTopic() {
    var d = await call('admin_topic_upsert', {
      p_topic_id: state.editing,
      p_parent_id: $('tpMParent').value ? Number($('tpMParent').value) : null,
      p_name: $('tpMName').value.trim(),
      p_is_political: $('tpMPolitical').checked,
      p_is_active: $('tpMActive').checked,
      p_sort_order: Number($('tpMSort').value) || 0,
    });
    if (!d) return;
    closeTopicModal();
    toast('저장했습니다.');
    await loadTopics();
    await loadKeywords();
  }

  /* ───────── 화면 전환·이벤트 ───────── */
  async function switchView(v) {
    state.view = v;
    document.querySelectorAll('.tp-view-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === v);
    });
    $('tpQueueView').style.display = v === 'queue' ? '' : 'none';
    $('tpSettingsView').style.display = v === 'settings' ? '' : 'none';
    if (v === 'settings') {
      await loadTopics();
      await loadKeywords();
    } else {
      await loadQueue();
    }
  }

  function bind() {
    if (state.bound) return;
    state.bound = true;
    document.querySelectorAll('.tp-view-btn').forEach(function (b) {
      b.addEventListener('click', function () { switchView(b.getAttribute('data-view')); });
    });
    document.querySelectorAll('#tpTabs .hall-tab').forEach(function (b) {
      b.addEventListener('click', function () {
        state.status = b.getAttribute('data-status');
        state.offset = 0;
        state.selected = {};
        document.querySelectorAll('#tpTabs .hall-tab').forEach(function (x) { x.classList.toggle('active', x === b); });
        loadQueue();
      });
    });
    $('tpBtnSearch').addEventListener('click', function () {
      state.search = $('tpSearch').value.trim();
      state.offset = 0;
      loadQueue();
    });
    $('tpSearch').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('tpBtnSearch').click();
    });
    $('tpBtnReset').addEventListener('click', function () {
      $('tpSearch').value = '';
      state.search = '';
      state.offset = 0;
      loadQueue();
    });
    $('tpBtnSuggest').addEventListener('click', function () { runSuggest(false); });
    $('tpBtnRedo').addEventListener('click', function () {
      if (window.confirm('확정하지 않은 추천 주제를 현재 키워드 기준으로 다시 계산할까요?\n(이미 확정한 불판은 바뀌지 않습니다)')) runSuggest(true);
    });
    $('tpPrev').addEventListener('click', function () {
      state.offset = Math.max(0, state.offset - PAGE_SIZE);
      loadQueue();
    });
    $('tpNext').addEventListener('click', function () {
      state.offset += PAGE_SIZE;
      loadQueue();
    });
    $('tpCheckAll').addEventListener('change', function (e) {
      state.rows.forEach(function (r) {
        if (e.target.checked) state.selected[r.post_id] = true;
        else delete state.selected[r.post_id];
      });
      document.querySelectorAll('.tp-row-check').forEach(function (c) { c.checked = e.target.checked; });
      updateSelCount();
    });
    $('tpBody').addEventListener('change', function (e) {
      var c = e.target.closest('.tp-row-check');
      if (!c) return;
      var id = c.getAttribute('data-id');
      if (c.checked) state.selected[id] = true;
      else delete state.selected[id];
      updateSelCount();
    });
    $('tpBody').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act="set"]');
      if (btn) setOne(btn.getAttribute('data-id'));
    });
    $('tpBtnBulkConfirm').addEventListener('click', bulkConfirmSuggested);
    $('tpBtnBulkSet').addEventListener('click', bulkSet);

    $('tpBtnAddTopic').addEventListener('click', function () { openTopicModal(null); });
    $('tpTopicBody').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act="edit"]');
      if (btn) openTopicModal(Number(btn.getAttribute('data-id')));
    });
    $('tpMCancel').addEventListener('click', closeTopicModal);
    $('tpMOk').addEventListener('click', saveTopic);
    $('tpModalBg').addEventListener('click', function (e) {
      if (e.target === $('tpModalBg')) closeTopicModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeTopicModal();
    });
    $('tpKwAdd').addEventListener('click', addKeyword);
    $('tpKwInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') addKeyword();
    });
    $('tpKwList').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act="kwdel"]');
      if (btn) deleteKeyword(btn.getAttribute('data-kw'));
    });
  }

  function init() {
    bind();
    return loadTopics().then(function (ok) {
      if (ok === false) {
        $('tpBody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#71717a;">SQL 158 적용 후 사용할 수 있습니다.</td></tr>';
        return;
      }
      return loadQueue();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var nav = window.PickleAdminNav;
    if (nav && nav.safeInit) nav.safeInit('Topics', init);
    else init();
  });

  window.PickleAdminTopics = { _state: state, reload: loadQueue };
})();
