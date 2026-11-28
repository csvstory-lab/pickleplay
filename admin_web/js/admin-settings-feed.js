/**
 * P!CKLE Admin — 시스템 설정 > 메인 노출 (오늘의 픽클 / 지금 뜨거운 불판 가중치)
 * SQL: pickle_feed_ranking_136.sql (pickle_feed_get_config / set_config / ranked / stats)
 * 이 파일은 #feedAdminRoot 안에 화면을 직접 그린다.
 */
(function () {
  'use strict';

  /* 화면에 보일 항목 정의 — key 는 DB 설정 키와 동일 */
  var GROUPS = [
    {
      title: '👑 오늘의 픽클 (메인 맨 위 카드)',
      desc: '메인 상단 가로 카드 영역입니다.',
      fields: [
        { key: 'king_count', label: '카드 개수', help: '메인 맨 위에 보여줄 카드 수 (1~6)', suffix: '개', min: 1, max: 6, int: true },
        { key: 'new_slot_count', label: '새 불판 자리', help: '그중 새로 올라온 불판을 시험 노출할 자리 수. 0이면 사용 안 함', suffix: '개', min: 0, max: 3, int: true },
        { key: 'new_slot_hours', label: '새 불판 기준', help: '올라온 지 이 시간 이내(이미지 있고 신고 없는 글)만 새 불판으로 봅니다', suffix: '시간 이내', min: 0, max: 72, int: true },
        { key: 'king_category_cap', label: '같은 카테고리 최대', help: '오늘의 픽클 안에서 한 카테고리가 차지할 수 있는 최대 개수', suffix: '개', min: 1, max: 6, int: true },
        { key: 'king_report_exclude', label: '신고 제외 기준', help: '처리 대기 신고가 이 수 이상이면 오늘의 픽클에서 빼고 점수도 깎습니다', suffix: '건 이상', min: 1, max: 50, int: true },
        { key: 'report_penalty', label: '신고 글 점수 배율', help: '위 기준에 걸린 글의 점수에 곱합니다. 0.3 = 70% 감점, 1 = 감점 없음', suffix: '배', min: 0, max: 1, step: 0.05 },
      ],
    },
    {
      title: '🔥 점수 계산 (누가 더 위로 올라가나)',
      desc: '점수 = (기본점 + 최근 투표×배점 + 최근 댓글×배점 + 누적 참여 로그점수) × 접전/마감 가산 ÷ 시간 감쇠',
      fields: [
        { key: 'recent_hours', label: '"최근"으로 보는 시간', help: '이 시간 안의 투표·댓글을 최근 참여로 계산', suffix: '시간', min: 1, max: 72, int: true },
        { key: 'w_vote_recent', label: '최근 투표 1건당', help: '클수록 투표가 빨리 붙는 글이 유리', suffix: '점', min: 0, max: 100, step: 0.1 },
        { key: 'w_comment_recent', label: '최근 댓글 1건당', help: '댓글은 참여도가 높으므로 투표보다 크게 둡니다', suffix: '점', min: 0, max: 100, step: 0.1 },
        { key: 'w_total', label: '누적 참여 반영', help: '지금까지의 전체 참여(투표+댓글×2+공유×3)를 로그로 반영하는 비중. 0이면 최근 참여만 봅니다', suffix: '배', min: 0, max: 20, step: 0.1 },
        { key: 'w_fresh', label: '새 글 기본점', help: '참여가 0건이어도 주는 점수. 새 글끼리는 최신순이 됩니다', suffix: '점', min: 0, max: 20, step: 0.1 },
        { key: 'decay_hours', label: '시간 감쇠 기준', help: '이 시간이 지나면 점수가 눈에 띄게 줄기 시작합니다 (클수록 오래 유지)', suffix: '시간', min: 1, max: 240, int: true },
        { key: 'gravity', label: '감쇠 세기', help: '클수록 오래된 글이 빨리 가라앉습니다 (권장 1~2, 최대 5)', suffix: '', min: 0, max: 5, step: 0.05 },
        { key: 'close_race_bonus', label: '접전 가산', help: 'A/B가 50:50에 가까울수록 최대 이만큼 가산 (0.3 = 최대 +30%)', suffix: '배', min: 0, max: 5, step: 0.05 },
        { key: 'close_race_min_votes', label: '접전 가산 최소 투표', help: '투표가 이 수 이상일 때만 접전 가산을 줍니다', suffix: '표', min: 0, max: 1000, int: true },
        { key: 'deadline_bonus', label: '마감 임박 가산', help: '마감이 가까운 글 가산 (0.15 = +15%)', suffix: '배', min: 0, max: 5, step: 0.05 },
        { key: 'deadline_hours', label: '마감 임박 기준', help: '마감까지 남은 시간이 이 이하면 임박', suffix: '시간 이하', min: 0, max: 72, int: true },
      ],
    },
    {
      title: '📋 지금 뜨거운 불판 (오늘의 픽클 아래 목록)',
      desc: '',
      fields: [
        { key: 'list_category_cap', label: '카테고리별 먼저 보여줄 수', help: '목록 앞부분에 카테고리마다 이 개수까지 먼저 올려 골고루 보이게 합니다. 그 뒤는 점수순', suffix: '개', min: 1, max: 20, int: true },
        { key: 'sponsor_slot_enabled', label: '스폰서 고정 자리 사용', help: '진행 중인 스폰서 불판 1개를 아래 순위에 고정 노출합니다 ("광고" 표시 유지)', type: 'bool' },
        { key: 'sponsor_slot_rank', label: '스폰서 고정 순위', help: '전체 순위 몇 번째에 넣을지 (오늘의 픽클 개수보다 뒤로 자동 보정)', suffix: '번째', min: 1, max: 50, int: true },
      ],
    },
  ];

  var SLOT_LABEL = {
    king_score: '오늘의 픽클 (점수)',
    king_new: '오늘의 픽클 (새 불판)',
    hot: '지금 뜨거운',
    sponsor: '스폰서 고정',
    unknown: '기타',
  };

  var FALLBACK_DEFAULTS = {
    recent_hours: 6, w_fresh: 1, w_vote_recent: 1, w_comment_recent: 3, w_total: 0.8,
    decay_hours: 24, gravity: 1.35, close_race_bonus: 0.3, close_race_min_votes: 10,
    deadline_bonus: 0.15, deadline_hours: 3, king_count: 3, new_slot_count: 1, new_slot_hours: 3,
    king_category_cap: 2, king_report_exclude: 2, report_penalty: 0.3, list_category_cap: 3,
    sponsor_slot_enabled: true, sponsor_slot_rank: 5,
  };

  var state = { defaults: null, current: null, built: false, statsDays: 7 };

  function sb() {
    if (typeof window.getPickleSupabaseClient === 'function') return window.getPickleSupabaseClient();
    if (window.supabaseClient) return window.supabaseClient;
    throw new Error('Supabase 클라이언트를 초기화할 수 없습니다.');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function root() {
    return document.getElementById('feedAdminRoot');
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setMsg(text, kind) {
    var el = $('feedAdminMsg');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = kind === 'error' ? 'var(--alert-red, #ff3333)' : kind === 'ok' ? 'var(--neon-green, #39ff14)' : 'var(--text-sub, #a1a1aa)';
  }

  function explainError(err) {
    var m = (err && err.message) || String(err || '');
    if (/forbidden/i.test(m)) return '권한이 없습니다. 관리자 계정으로 로그인했는지 확인해 주세요.';
    if (/does not exist|schema cache|Could not find the function/i.test(m)) {
      return '아직 DB에 노출 알고리즘이 설치되지 않았습니다. pickle_feed_ranking_136.sql 을 먼저 실행해 주세요.';
    }
    return m || '알 수 없는 오류';
  }

  function build() {
    var r = root();
    if (!r) return;

    var html = [];
    html.push(
      '<div class="setting-card" style="margin-bottom:20px;">' +
        '<div class="sc-title"><span>🔥 메인 노출 알고리즘</span>' +
        '<span id="feedAdminMsg" style="font-size:0.8rem;font-weight:700;"></span></div>' +
        '<p style="font-size:0.85rem;color:var(--text-sub);margin:0;line-height:1.6;">' +
        '유저 앱 메인의 <strong>오늘의 픽클</strong>과 <strong>지금 뜨거운 불판</strong> 순서를 정하는 숫자입니다. ' +
        '저장하면 <strong>바로 반영</strong>됩니다(배포 불필요). 처음에는 기본값 그대로 두고, 아래 "자리별 성과"의 클릭률을 며칠 본 뒤 조금씩 조정하세요. ' +
        '한 번에 한두 개만 바꾸면 효과를 알기 쉽습니다.</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<button type="button" class="btn-publish" id="feedBtnSave">💾 저장하기</button>' +
        '<button type="button" class="btn-publish" id="feedBtnReset" style="background:#27272a;color:#fff;border:1px solid #52525b;">↩️ 기본값으로 되돌리기</button>' +
        '</div></div>'
    );

    GROUPS.forEach(function (g) {
      html.push('<div class="setting-card" style="margin-bottom:20px;"><div class="sc-title"><span>' + esc(g.title) + '</span></div>');
      if (g.desc) html.push('<p style="font-size:0.8rem;color:var(--text-sub);margin:0;">' + esc(g.desc) + '</p>');
      html.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">');
      g.fields.forEach(function (f) {
        var ctl;
        if (f.type === 'bool') {
          ctl = '<label class="switch"><input type="checkbox" id="feed_' + f.key + '"><span class="slider"></span></label>';
        } else {
          ctl =
            '<div class="input-with-suffix" style="width:190px;"><input type="number" id="feed_' + f.key + '" ' +
            'min="' + f.min + '" max="' + f.max + '" step="' + (f.step || 1) + '">' +
            (f.suffix ? '<span>' + esc(f.suffix) + '</span>' : '') + '</div>';
        }
        html.push(
          '<div class="sc-item"><div class="sc-label"><strong>' + esc(f.label) + '</strong><span>' + esc(f.help) +
          '</span><span id="feedDef_' + f.key + '" style="color:#71717a;"></span></div>' + ctl + '</div>'
        );
      });
      html.push('</div></div>');
    });

    html.push(
      '<div class="setting-card" style="margin-bottom:20px;">' +
        '<div class="sc-title"><span>👀 지금 메인 순서 미리보기</span>' +
        '<button type="button" class="tool-btn" id="feedBtnPreview" style="border:1px solid #3f3f46;">새로고침</button></div>' +
        '<p style="font-size:0.8rem;color:var(--text-sub);margin:0;">⚠️ <strong>저장된 값</strong> 기준입니다. 숫자를 바꿨다면 저장 후 새로고침하세요. 진행 중인 불판만 나옵니다.</p>' +
        '<div id="feedPreviewBody" style="font-size:0.85rem;color:var(--text-sub);">불러오는 중…</div></div>'
    );

    html.push(
      '<div class="setting-card">' +
        '<div class="sc-title"><span>📊 자리별 성과 (노출 · 클릭 · 클릭률)</span>' +
        '<select class="sc-select" id="feedStatsDays"><option value="1">최근 1일</option><option value="7" selected>최근 7일</option><option value="30">최근 30일</option></select></div>' +
        '<p style="font-size:0.8rem;color:var(--text-sub);margin:0;">클릭률이 낮은 자리는 노출 기준이 안 맞는다는 신호입니다. 노출·클릭은 메인 화면에서 카드가 실제로 보이고 눌렸을 때 기록됩니다.</p>' +
        '<div id="feedStatsBody" style="font-size:0.85rem;color:var(--text-sub);">불러오는 중…</div></div>'
    );

    r.innerHTML = html.join('');
    $('feedBtnSave').addEventListener('click', save);
    $('feedBtnReset').addEventListener('click', resetToDefaults);
    $('feedBtnPreview').addEventListener('click', loadPreview);
    $('feedStatsDays').addEventListener('change', function () {
      state.statsDays = parseInt(this.value, 10) || 7;
      loadStats();
    });
    state.built = true;
  }

  function fieldDefs() {
    var out = [];
    GROUPS.forEach(function (g) {
      g.fields.forEach(function (f) { out.push(f); });
    });
    return out;
  }

  function fillForm(cfg) {
    fieldDefs().forEach(function (f) {
      var el = $('feed_' + f.key);
      if (!el) return;
      var v = cfg[f.key];
      if (f.type === 'bool') el.checked = v === true || v === 'true';
      else el.value = v == null ? '' : v;
    });
  }

  function showDefaultsHint() {
    var d = state.defaults || FALLBACK_DEFAULTS;
    fieldDefs().forEach(function (f) {
      var el = $('feedDef_' + f.key);
      if (!el) return;
      var dv = d[f.key];
      el.textContent = '기본값: ' + (f.type === 'bool' ? (dv ? '켬' : '끔') : dv + (f.suffix ? ' ' + f.suffix : ''));
    });
  }

  /** 입력값 검사 → { ok, patch, errors } */
  function readForm() {
    var patch = {};
    var errors = [];
    fieldDefs().forEach(function (f) {
      var el = $('feed_' + f.key);
      if (!el) return;
      if (f.type === 'bool') {
        patch[f.key] = !!el.checked;
        return;
      }
      var raw = String(el.value).trim();
      var n = Number(raw);
      if (raw === '' || !isFinite(n)) {
        errors.push(f.label + ': 숫자를 입력해 주세요.');
        return;
      }
      if (n < f.min || n > f.max) {
        errors.push(f.label + ': ' + f.min + ' ~ ' + f.max + ' 사이로 입력해 주세요.');
        return;
      }
      if (f.int && Math.floor(n) !== n) {
        errors.push(f.label + ': 정수로 입력해 주세요.');
        return;
      }
      patch[f.key] = n;
    });
    // 조합 검사
    if (patch.new_slot_count != null && patch.king_count != null && patch.new_slot_count > patch.king_count) {
      errors.push('새 불판 자리는 카드 개수보다 많을 수 없습니다.');
    }
    return { ok: errors.length === 0, patch: patch, errors: errors };
  }

  async function load() {
    if (!state.built) build();
    setMsg('불러오는 중…');
    try {
      var client = sb();
      var defRes = await client.rpc('pickle_feed_defaults');
      state.defaults = defRes && !defRes.error && defRes.data ? defRes.data : FALLBACK_DEFAULTS;
      var res = await client.rpc('pickle_feed_get_config');
      if (res.error) throw res.error;
      state.current = res.data || state.defaults;
      showDefaultsHint();
      fillForm(state.current);
      setMsg('');
    } catch (err) {
      setMsg(explainError(err), 'error');
      state.defaults = state.defaults || FALLBACK_DEFAULTS;
      showDefaultsHint();
      fillForm(state.defaults);
    }
    loadPreview();
    loadStats();
  }

  async function save() {
    var form = readForm();
    if (!form.ok) {
      setMsg(form.errors[0], 'error');
      alert('입력값을 확인해 주세요.\n\n- ' + form.errors.join('\n- '));
      return;
    }
    var btn = $('feedBtnSave');
    if (btn) btn.disabled = true;
    setMsg('저장 중…');
    try {
      var res = await sb().rpc('pickle_feed_set_config', { p_patch: form.patch });
      if (res.error) throw res.error;
      state.current = res.data || form.patch;
      fillForm(state.current);
      setMsg('저장되었습니다. 메인 화면에 바로 반영됩니다.', 'ok');
      loadPreview();
    } catch (err) {
      setMsg(explainError(err), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function resetToDefaults() {
    if (!window.confirm('모든 값을 기본값으로 되돌립니다.\n(저장 즉시 메인 화면에 반영됩니다) 계속할까요?')) return;
    var d = state.defaults || FALLBACK_DEFAULTS;
    fillForm(d);
    await save();
  }

  var SLOT_COLOR = { king_score: '#FF85A1', king_new: '#4ADE80', hot: '#a1a1aa', sponsor: '#FCD34D' };

  async function loadPreview() {
    var body = $('feedPreviewBody');
    if (!body) return;
    body.textContent = '불러오는 중…';
    try {
      var client = sb();
      var res = await client.rpc('pickle_feed_ranked', { p_limit: 15, p_offset: 0 });
      if (res.error) throw res.error;
      var rows = res.data || [];
      if (!rows.length) {
        body.textContent = '지금 진행 중인 불판이 없습니다.';
        return;
      }
      var ids = rows.map(function (r) { return r.post_id; });
      var pr = await client.from('posts').select('id, title, category').in('id', ids);
      var titles = {};
      ((pr && pr.data) || []).forEach(function (p) { titles[p.id] = p; });

      var h = ['<table style="width:100%;border-collapse:collapse;"><thead><tr style="text-align:left;color:#71717a;">' +
        '<th style="padding:6px 8px;width:50px;">순위</th><th style="padding:6px 8px;width:170px;">자리</th><th style="padding:6px 8px;">제목</th><th style="padding:6px 8px;width:70px;text-align:right;">점수</th></tr></thead><tbody>'];
      rows.forEach(function (r) {
        var t = titles[r.post_id] || {};
        h.push(
          '<tr style="border-top:1px solid #27272a;"><td style="padding:7px 8px;font-weight:800;color:#fff;">' + esc(r.rank_no) + '</td>' +
          '<td style="padding:7px 8px;color:' + (SLOT_COLOR[r.slot] || '#a1a1aa') + ';font-weight:700;">' + esc(SLOT_LABEL[r.slot] || r.slot) + '</td>' +
          '<td style="padding:7px 8px;color:#e4e4e7;">' + esc(t.title || '(제목 없음)') + '</td>' +
          '<td style="padding:7px 8px;text-align:right;">' + esc(Number(r.score).toFixed(1)) + '</td></tr>'
        );
      });
      h.push('</tbody></table>');
      body.innerHTML = h.join('');
    } catch (err) {
      body.textContent = explainError(err);
    }
  }

  async function loadStats() {
    var body = $('feedStatsBody');
    if (!body) return;
    body.textContent = '불러오는 중…';
    try {
      var res = await sb().rpc('pickle_feed_stats', { p_days: state.statsDays });
      if (res.error) throw res.error;
      var rows = res.data || [];
      if (!rows.length) {
        body.textContent = '아직 기록이 없습니다. 유저 앱 메인이 열리면 쌓이기 시작합니다.';
        return;
      }
      var h = ['<table style="width:100%;border-collapse:collapse;"><thead><tr style="text-align:left;color:#71717a;">' +
        '<th style="padding:6px 8px;">자리</th><th style="padding:6px 8px;text-align:right;">노출</th><th style="padding:6px 8px;text-align:right;">클릭</th><th style="padding:6px 8px;text-align:right;">클릭률</th></tr></thead><tbody>'];
      rows.forEach(function (r) {
        h.push(
          '<tr style="border-top:1px solid #27272a;"><td style="padding:7px 8px;color:' + (SLOT_COLOR[r.slot] || '#e4e4e7') + ';font-weight:700;">' + esc(SLOT_LABEL[r.slot] || r.slot) + '</td>' +
          '<td style="padding:7px 8px;text-align:right;">' + esc(Number(r.impressions).toLocaleString('ko-KR')) + '</td>' +
          '<td style="padding:7px 8px;text-align:right;">' + esc(Number(r.clicks).toLocaleString('ko-KR')) + '</td>' +
          '<td style="padding:7px 8px;text-align:right;font-weight:800;color:#fff;">' + esc(Number(r.ctr_pct).toFixed(2)) + '%</td></tr>'
        );
      });
      h.push('</tbody></table>');
      body.innerHTML = h.join('');
    } catch (err) {
      body.textContent = explainError(err);
    }
  }

  window.AdminSettingsFeed = {
    load: load,
    save: save,
    reset: resetToDefaults,
    readForm: readForm,
    _groups: GROUPS,
  };
})();
