/**
 * P!CKLE Admin — 스폰서 불판(캠페인) 관리
 * 내부 관리자(super/marketer 등): 전체 목록 + 등록/수정 + 리포트
 * 외부 스폰서(role='sponsor'): 매핑된 캠페인만 조회 + 리포트 (등록/수정 불가)
 */
(function () {
  'use strict';

  var sb = null;
  var isInternal = false;
  var currentEditingCampaignId = null;
  var currentEditingPostId = null;
  var currentViewerTags = []; // { id(옵션), email, label, _new }
  var tagSeq = 0;
  var listRows = [];
  var selectedAdvertiserId = null;
  var advSearchTimer = null;
  var advSearchResultsCache = [];
  var currentReportData = null;

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(iso) {
    if (!iso) return '-';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return (d.getFullYear() % 100) + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
  }

  function toLocalInput(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function fromLocalInput(v) {
    if (!v) return null;
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  async function init() {
    sb = (window.PickleAdminWorkspace && window.PickleAdminWorkspace.getClient) ? window.PickleAdminWorkspace.getClient() : null;
    if (!sb) {
      console.error('[AdminSponsor] PickleAdminWorkspace.getClient() 없음 — admin-auth.js 로드 확인 필요');
      return;
    }

    var roleInfo = await window.PickleAdminWorkspace.fetchMyRole(sb);
    var role = (roleInfo && roleInfo.role) || '';
    isInternal = role !== 'sponsor';

    $('btnOpenCreate').style.display = isInternal ? 'inline-flex' : 'none';
    $('sponsorNoticePanel').hidden = isInternal;
    $('kpiMappedWrap').style.display = isInternal ? '' : 'none';

    await loadList();
  }

  async function loadList() {
    var tbody = $('campaignTableBody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">불러오는 중...</td></tr>';

    var res = await sb.rpc('sponsor_campaign_list');
    if (res.error) {
      console.error('[AdminSponsor] sponsor_campaign_list 실패', res.error);
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">목록을 불러오지 못했습니다: ' + escapeHtml(res.error.message || '') + '</td></tr>';
      return;
    }

    listRows = res.data || [];
    renderKpis();
    renderTable();

    if (isInternal) {
      var mappedRes = await sb.from('sponsor_campaign_viewers').select('id', { count: 'exact', head: true });
      $('kpiMapped').textContent = mappedRes.count != null ? mappedRes.count + ' 개' : '-';
    }
  }

  function campaignStatus(row) {
    var now = new Date();
    var start = new Date(row.campaign_start_at);
    var end = new Date(row.campaign_end_at);
    if (row.visibility_status !== 'visible') return { label: '숨김/초안', cls: 'status-ended' };
    if (now < start) return { label: '예정', cls: 'status-scheduled' };
    if (now > end) return { label: '종료됨', cls: 'status-ended' };
    return { label: '진행 중', cls: 'status-active' };
  }

  function renderKpis() {
    $('kpiTotal').textContent = listRows.length + ' 건';
    var now = new Date();
    var active = listRows.filter(function (r) {
      return r.visibility_status === 'visible' && new Date(r.campaign_start_at) <= now && now <= new Date(r.campaign_end_at);
    }).length;
    $('kpiActive').textContent = active + ' 건';
  }

  function renderTable() {
    var tbody = $('campaignTableBody');
    if (!listRows.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">등록된 스폰서 캠페인이 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = listRows.map(function (r) {
      var status = campaignStatus(r);
      var couponPct = r.coupon_total > 0 ? Math.round((r.coupon_used / r.coupon_total) * 100) : 0;
      var lowStockWarning = (r.coupon_total > 0 && couponPct >= 90)
        ? ' <span class="status-badge status-ended" style="color:var(--neon-pink); border-color:rgba(255,0,127,0.4);">⚠️ 소진임박</span>'
        : '';
      var isEnded = new Date(r.campaign_end_at) <= new Date();
      var isHidden = r.visibility_status !== 'visible';
      var internalBtns = isInternal
        ? (
          '<button class="btn-action btn-edit" onclick="PickleSponsor.openForm(\'edit\',\'' + r.campaign_id + '\')">수정</button>' +
          '<button class="btn-action btn-edit" onclick="PickleSponsor.duplicateCampaign(\'' + r.campaign_id + '\')">복제</button>' +
          '<button class="btn-action btn-edit" onclick="PickleSponsor.togglePause(\'' + r.campaign_id + '\',' + (isHidden ? 'true' : 'false') + ')">' + (isHidden ? '게시 재개' : '일시중지') + '</button>' +
          (isEnded ? '' : '<button class="btn-action btn-edit" onclick="PickleSponsor.endCampaignNow(\'' + r.campaign_id + '\')">조기종료</button>')
        )
        : '';
      return (
        '<tr>' +
          '<td><span class="brand-name">🏷️ ' + escapeHtml(r.brand_name) + '</span><span class="post-title">' + escapeHtml(r.title || '(제목 없음)') + '</span></td>' +
          '<td>' + fmtDate(r.campaign_start_at) + ' ~ ' + fmtDate(r.campaign_end_at) + '</td>' +
          '<td>' + (r.vote_a || 0) + ' / ' + (r.vote_b || 0) + '</td>' +
          '<td>' + r.coupon_used + ' / ' + r.coupon_total + (r.coupon_total ? ' (' + couponPct + '%)' : '') + lowStockWarning + '</td>' +
          '<td><span class="status-badge ' + status.cls + '">' + status.label + '</span></td>' +
          '<td>' + internalBtns + '<button class="btn-action btn-report" onclick="PickleSponsor.openReportModal(\'' + r.campaign_id + '\')">📊 리포트</button></td>' +
        '</tr>'
      );
    }).join('');
  }

  // ───────────────────────── 뷰 전환 ─────────────────────────
  function switchView(name) {
    document.querySelectorAll('.view-page').forEach(function (v) { v.classList.remove('active'); });
    $(name + 'View').classList.add('active');
    $('pageTitle').textContent = name === 'form'
      ? (currentEditingCampaignId ? '✏️ 스폰서 불판 수정' : '💎 스폰서 불판 신규 등록')
      : '💼 스폰서 불판 관리';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    ['f_company', 'f_brand', 'f_manager_name', 'f_budget', 'f_manager_mobile', 'f_manager_phone',
     'f_manager_email', 'f_start', 'f_end', 'f_title', 'f_opt_a', 'f_opt_b', 'f_win_rate',
     'f_media_1', 'f_media_2', 'f_coupon_title', 'f_pin_bulk', 'f_banner_sub', 'f_banner_main',
     'f_banner_btn', 'f_banner_link', 'f_kakao_msg', 'f_kakao_title', 'f_kakao_btn'].forEach(function (id) {
      var el = $(id);
      if (el) el.value = '';
    });
    $('f_media_type').value = 'none';
    currentViewerTags = [];
    renderViewerTags();
    $('pinPoolStatus').textContent = '등록된 쿠폰 0개 / 지급됨 0개';
    clearAdvertiserSelection();
    $('f_adv_search').value = '';
    $('advSearchResults').style.display = 'none';
    $('saveAsAdvertiserRow').style.display = '';
    $('f_save_as_advertiser').checked = true;
    updateMockup();
  }

  // ───────────────────────── 광고주 검색/선택 ─────────────────────────
  function onAdvertiserSearchInput() {
    var q = $('f_adv_search').value.trim();
    clearAdvertiserSelection();

    if (advSearchTimer) clearTimeout(advSearchTimer);
    if (!q) {
      $('advSearchResults').style.display = 'none';
      return;
    }
    advSearchTimer = setTimeout(async function () {
      var res = await sb.rpc('sponsor_advertiser_search', { p_query: q });
      if (res.error) {
        console.warn('[AdminSponsor] 광고주 검색 실패', res.error);
        return;
      }
      advSearchResultsCache = res.data || [];
      renderAdvertiserResults(advSearchResultsCache);
    }, 300);
  }

  function renderAdvertiserResults(rows) {
    var box = $('advSearchResults');
    if (!rows.length) {
      box.innerHTML = '<div style="padding:12px; color:var(--text-sub); font-size:0.85rem;">일치하는 광고주가 없습니다. 직접 입력해 주세요.</div>';
      box.style.display = 'block';
      return;
    }
    box.innerHTML = rows.map(function (r, idx) {
      return (
        '<div onclick="PickleSponsor.selectAdvertiserResult(' + idx + ')" ' +
        'style="padding:10px 14px; cursor:pointer; border-bottom:1px solid #27272a;" ' +
        'onmouseover="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseout="this.style.background=\'transparent\'">' +
        '<div style="font-weight:800; color:#fff;">' + escapeHtml(r.company_name) +
        (r.brand_name ? ' <span style="color:var(--theme-gold); font-weight:700;">· ' + escapeHtml(r.brand_name) + '</span>' : '') + '</div>' +
        '<div style="font-size:0.78rem; color:var(--text-sub); margin-top:2px;">' + escapeHtml(r.manager_name || '-') + ' · ' + escapeHtml(r.manager_mobile || '-') + '</div>' +
        '</div>'
      );
    }).join('');
    box.style.display = 'block';
  }

  function selectAdvertiserResult(idx) {
    var r = advSearchResultsCache[idx];
    if (!r) return;

    selectedAdvertiserId = r.id;
    $('f_company').value = r.company_name || '';
    $('f_brand').value = r.brand_name || '';
    $('f_manager_name').value = r.manager_name || '';
    $('f_manager_mobile').value = r.manager_mobile || '';
    $('f_manager_phone').value = r.manager_phone || '';
    $('f_manager_email').value = r.manager_email || '';

    $('f_adv_search').value = r.company_name + (r.brand_name ? ' · ' + r.brand_name : '');
    $('advSearchResults').style.display = 'none';
    $('advSelectedHint').innerHTML = '✅ 기존 광고주 "' + escapeHtml(r.company_name) + '" 정보를 불러왔습니다. ' +
      '<a href="#" onclick="PickleSponsor.resetAdvertiserSearchBox(); return false;" style="color:var(--neon-blue);">다른 광고주 선택</a>';
    $('saveAsAdvertiserRow').style.display = 'none';
  }

  function clearAdvertiserSelection() {
    selectedAdvertiserId = null;
    $('advSelectedHint').innerHTML = '';
    $('saveAsAdvertiserRow').style.display = '';
  }

  function resetAdvertiserSearchBox() {
    clearAdvertiserSelection();
    $('f_adv_search').value = '';
    $('advSearchResults').style.display = 'none';
    $('f_adv_search').focus();
  }

  async function openForm(mode, campaignId) {
    if (!isInternal) return;

    if (mode === 'new') {
      currentEditingCampaignId = null;
      currentEditingPostId = null;
      resetForm();
      switchView('form');
      return;
    }

    // edit 모드 — 캠페인 + 게시물 + 쿠폰 현황 + 열람 권한 불러오기
    var res = await sb.from('sponsor_campaigns')
      .select('*, posts(id,title,option_a_name,option_b_name,media_type,media_url_1,media_url_2,reward_win_rate)')
      .eq('id', campaignId)
      .single();

    if (res.error || !res.data) {
      alert('캠페인 정보를 불러오지 못했습니다: ' + (res.error ? res.error.message : ''));
      return;
    }

    var c = res.data;
    var post = c.posts || {};
    currentEditingCampaignId = c.id;
    currentEditingPostId = post.id;

    $('f_adv_search').value = '';
    $('advSearchResults').style.display = 'none';
    if (c.advertiser_id) {
      selectedAdvertiserId = c.advertiser_id;
      $('advSelectedHint').innerHTML = '✅ 광고주 마스터 "' + escapeHtml(c.company_name || '') + '" 와 연결되어 있습니다. ' +
        '<a href="#" onclick="PickleSponsor.resetAdvertiserSearchBox(); return false;" style="color:var(--neon-blue);">다른 광고주로 변경</a>';
      $('saveAsAdvertiserRow').style.display = 'none';
    } else {
      clearAdvertiserSelection();
    }

    $('f_company').value = c.company_name || '';
    $('f_brand').value = c.brand_name || '';
    $('f_manager_name').value = c.manager_name || '';
    $('f_budget').value = c.budget_krw != null ? c.budget_krw : '';
    $('f_manager_mobile').value = c.manager_mobile || '';
    $('f_manager_phone').value = c.manager_phone || '';
    $('f_manager_email').value = c.manager_email || '';
    $('f_start').value = toLocalInput(c.campaign_start_at);
    $('f_end').value = toLocalInput(c.campaign_end_at);

    $('f_title').value = post.title || '';
    $('f_opt_a').value = post.option_a_name || '';
    $('f_opt_b').value = post.option_b_name || '';
    $('f_win_rate').value = post.reward_win_rate != null ? post.reward_win_rate : '';
    $('f_media_type').value = post.media_type || 'none';
    $('f_media_1').value = post.media_url_1 || '';
    $('f_media_2').value = post.media_url_2 || '';

    $('f_coupon_title').value = c.coupon_title || '';
    $('f_pin_bulk').value = '';
    $('f_banner_sub').value = c.banner_sub_title || '';
    $('f_banner_main').value = c.banner_main_title || '';
    $('f_banner_btn').value = c.banner_btn_text || '';
    $('f_banner_link').value = c.banner_link_url || '';
    $('f_kakao_msg').value = c.kakao_message || '';
    $('f_kakao_title').value = c.kakao_link_title || '';
    $('f_kakao_btn').value = c.kakao_btn_text || '';

    var poolTotalRes = await sb.from('sponsor_coupon_pool').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id);
    var poolUsedRes = await sb.from('sponsor_coupon_pool').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('is_assigned', true);
    $('pinPoolStatus').textContent = '등록된 쿠폰 ' + (poolTotalRes.count || 0) + '개 / 지급됨 ' + (poolUsedRes.count || 0) + '개';

    var viewersRes = await sb.from('sponsor_campaign_viewers').select('*').eq('campaign_id', c.id);
    currentViewerTags = (viewersRes.data || []).map(function (v) {
      return { id: v.id, email: v.viewer_email, label: v.viewer_label || '' };
    });
    renderViewerTags();

    updateMockup();
    switchView('form');
  }

  // 기존 캠페인 내용을 새 캠페인 폼에 복사 (날짜/쿠폰재고/열람권한은 제외 — 새로 지정 필요)
  async function duplicateCampaign(campaignId) {
    if (!isInternal) return;

    var res = await sb.from('sponsor_campaigns')
      .select('*, posts(id,title,option_a_name,option_b_name,media_type,media_url_1,media_url_2,reward_win_rate)')
      .eq('id', campaignId)
      .single();

    if (res.error || !res.data) {
      alert('캠페인 정보를 불러오지 못했습니다: ' + (res.error ? res.error.message : ''));
      return;
    }

    var c = res.data;
    var post = c.posts || {};

    currentEditingCampaignId = null;
    currentEditingPostId = null;
    resetForm();

    if (c.advertiser_id) {
      selectedAdvertiserId = c.advertiser_id;
      $('advSelectedHint').innerHTML = '✅ 광고주 마스터 "' + escapeHtml(c.company_name || '') + '" 정보를 복사했습니다. ' +
        '<a href="#" onclick="PickleSponsor.resetAdvertiserSearchBox(); return false;" style="color:var(--neon-blue);">다른 광고주로 변경</a>';
      $('saveAsAdvertiserRow').style.display = 'none';
    }

    $('f_company').value = c.company_name || '';
    $('f_brand').value = c.brand_name || '';
    $('f_manager_name').value = c.manager_name || '';
    $('f_budget').value = c.budget_krw != null ? c.budget_krw : '';
    $('f_manager_mobile').value = c.manager_mobile || '';
    $('f_manager_phone').value = c.manager_phone || '';
    $('f_manager_email').value = c.manager_email || '';
    // 캠페인 기간은 일부러 비워둠 — 새 기간을 직접 지정해야 함

    $('f_title').value = post.title ? post.title + ' (복제)' : '';
    $('f_opt_a').value = post.option_a_name || '';
    $('f_opt_b').value = post.option_b_name || '';
    $('f_win_rate').value = post.reward_win_rate != null ? post.reward_win_rate : '';
    $('f_media_type').value = post.media_type || 'none';
    $('f_media_1').value = post.media_url_1 || '';
    $('f_media_2').value = post.media_url_2 || '';

    $('f_coupon_title').value = c.coupon_title || '';
    // 쿠폰 PIN 재고·파트너 열람 권한은 복제하지 않음 — 새 캠페인에 맞게 새로 등록해야 함
    $('f_banner_sub').value = c.banner_sub_title || '';
    $('f_banner_main').value = c.banner_main_title || '';
    $('f_banner_btn').value = c.banner_btn_text || '';
    $('f_banner_link').value = c.banner_link_url || '';
    $('f_kakao_msg').value = c.kakao_message || '';
    $('f_kakao_title').value = c.kakao_link_title || '';
    $('f_kakao_btn').value = c.kakao_btn_text || '';

    updateMockup();
    switchView('form');
    alert('기존 캠페인 내용을 복사했습니다.\n캠페인 노출 기간을 새로 입력하고, 쿠폰 PIN과 파트너 열람 권한은 새로 등록해 주세요.');
  }

  // 게시 일시중지/재개 — posts.visibility_status 토글 (날짜·쿠폰 등은 그대로 유지)
  async function togglePause(campaignId, isCurrentlyHidden) {
    if (!isInternal) return;
    var row = listRows.filter(function (r) { return r.campaign_id === campaignId; })[0];
    if (!row) return;

    var nextStatus = isCurrentlyHidden ? 'visible' : 'hidden';
    var confirmMsg = isCurrentlyHidden
      ? '이 캠페인을 다시 게시하시겠습니까?'
      : '이 캠페인을 일시중지(숨김) 하시겠습니까? 언제든 다시 게시할 수 있습니다.';
    if (!confirm(confirmMsg)) return;

    var res = await sb.from('posts').update({ visibility_status: nextStatus }).eq('id', row.post_id);
    if (res.error) {
      alert('처리에 실패했습니다: ' + res.error.message);
      return;
    }
    await loadList();
  }

  // 조기 종료 — campaign_end_at 을 지금 시각으로 당겨서 즉시 '종료됨' 처리 (되돌릴 수 없음)
  async function endCampaignNow(campaignId) {
    if (!isInternal) return;
    if (!confirm('이 캠페인을 지금 바로 종료하시겠습니까? 종료 후에는 날짜를 되돌릴 수 없습니다 (수정 화면에서 기간은 다시 바꿀 수 있습니다).')) return;

    var res = await sb.from('sponsor_campaigns').update({ campaign_end_at: new Date().toISOString() }).eq('id', campaignId);
    if (res.error) {
      alert('처리에 실패했습니다: ' + res.error.message);
      return;
    }
    await loadList();
  }

  function updateMockup() {
    $('mockQ').textContent = $('f_title').value || '불판 질문을 입력하세요';
    $('mockA').textContent = $('f_opt_a').value || 'A픽 텍스트';
    $('mockB').textContent = $('f_opt_b').value || 'B픽 텍스트';
    $('mockSub').textContent = $('f_banner_sub').value || '서브 타이틀';
    $('mockMain').textContent = $('f_banner_main').value || '메인 타이틀';
  }

  // ───────────────────────── 파트너 열람 권한 태그 ─────────────────────────
  function renderViewerTags() {
    var container = $('viewerTagContainer');
    container.innerHTML = currentViewerTags.map(function (t, idx) {
      var label = t.label ? escapeHtml(t.label) + ' · ' : '';
      var provisionBtn = t.id
        ? ' <span class="tag-close" onclick="PickleSponsor.provisionViewerAccount(' + idx + ')" title="로그인 계정 발급" style="background:rgba(57,255,20,0.15); color:var(--neon-green);">🔑</span>'
        : '';
      return (
        '<div class="partner-tag">' + label + escapeHtml(t.email) + provisionBtn +
        ' <span class="tag-close" onclick="PickleSponsor.removeViewerTag(' + idx + ')">✕</span></div>'
      );
    }).join('');
  }

  // 매핑된 이메일로 실제 로그인 가능한 'sponsor' 계정 발급 (super 역할만 가능 — admin-auth.js 정책)
  async function provisionViewerAccount(idx) {
    var tag = currentViewerTags[idx];
    if (!tag || !tag.id) return;

    if (!window.PickleAdminWorkspace || !window.PickleAdminWorkspace.provisionStaffAccount) {
      alert('계정 발급 모듈을 불러오지 못했습니다.');
      return;
    }

    var displayName = prompt('담당자 이름을 입력해 주세요 (예: 김픽클 대리)', tag.label || '');
    if (displayName === null) return;
    displayName = displayName.trim();
    if (!displayName) { alert('담당자 이름은 필수입니다.'); return; }

    var password = prompt('초기 비밀번호를 입력해 주세요 (8자 이상). 발급 후 담당자에게 직접 전달해 주세요.', '');
    if (password === null) return;
    if (!password || password.length < 8) { alert('비밀번호는 8자 이상이어야 합니다.'); return; }

    var department = $('f_brand').value.trim() || $('f_company').value.trim() || '스폰서';

    var result = await window.PickleAdminWorkspace.provisionStaffAccount({
      email: tag.email,
      password: password,
      display_name: displayName,
      department: department,
      role: 'sponsor',
      status: 'active',
      mode: 'create',
    });

    if (!result.ok) {
      alert('계정 발급 실패: ' + (result.message || result.reason || 'unknown') +
        (result.reason === 'forbidden' ? '\n\n(계정 발급은 최고관리자만 할 수 있습니다)' : ''));
      return;
    }

    var msg = '"' + tag.email + '" 계정이 발급되었습니다.';
    if (result.via === 'rpc_only' && result.warning) {
      msg += '\n\n⚠️ ' + result.warning;
    } else {
      msg += '\n\n✅ 로그인 가능한 계정이 생성되었습니다. 초기 비밀번호를 담당자에게 전달해 주세요.\nadmin_login.html 에서 로그인하면 스폰서 전용 화면(이 캠페인 포함)으로 자동 이동합니다.';
    }
    alert(msg);
  }

  function addViewerTag() {
    var emailEl = $('viewerEmailInput');
    var labelEl = $('viewerLabelInput');
    var email = (emailEl.value || '').trim().toLowerCase();
    var label = (labelEl.value || '').trim();
    if (!email || email.indexOf('@') === -1) {
      alert('유효한 이메일을 입력해 주세요.');
      return;
    }
    if (currentViewerTags.some(function (t) { return t.email === email; })) {
      alert('이미 추가된 이메일입니다.');
      return;
    }
    currentViewerTags.push({ email: email, label: label, _new: true });
    emailEl.value = '';
    labelEl.value = '';
    renderViewerTags();
  }

  async function removeViewerTag(idx) {
    var tag = currentViewerTags[idx];
    if (!tag) return;
    if (tag.id) {
      // 이미 저장된 매핑 — 바로 삭제
      var delRes = await sb.from('sponsor_campaign_viewers').delete().eq('id', tag.id);
      if (delRes.error) {
        alert('삭제 실패: ' + delRes.error.message);
        return;
      }
    }
    currentViewerTags.splice(idx, 1);
    renderViewerTags();
  }

  // ───────────────────────── 미디어 이미지 업로드 (sponsor_media 버킷) ─────────────────────────
  var SPONSOR_MEDIA_BUCKET = 'sponsor_media';

  function sanitizeImageExt(filename) {
    var m = String(filename || '').match(/\.([a-zA-Z0-9]+)$/);
    var ext = (m && m[1] ? m[1] : 'jpg').toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'gif'].indexOf(ext) !== -1 ? ext : 'jpg';
  }

  function validateSponsorImageFile(file) {
    if (!file) throw new Error('이미지 파일이 없습니다.');
    var allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (file.type && allowed.indexOf(file.type) === -1) {
      throw new Error('JPG, PNG, WEBP, GIF 이미지만 업로드할 수 있습니다.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('이미지는 10MB 이하만 업로드할 수 있습니다.');
    }
  }

  async function uploadMediaFile(slot, inputEl) {
    var file = inputEl.files && inputEl.files[0];
    var statusEl = $('f_media_' + slot + '_upload_status');
    if (!file) return;

    try {
      validateSponsorImageFile(file);
      if (statusEl) statusEl.textContent = '업로드 중...';

      var ext = sanitizeImageExt(file.name);
      var path = 'campaign/' + Date.now() + '_' + Math.random().toString(36).slice(2, 10) + '.' + ext;

      var uploadRes = await sb.storage.from(SPONSOR_MEDIA_BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'image/jpeg',
      });
      if (uploadRes.error) {
        if (/bucket/i.test(uploadRes.error.message || '')) {
          throw new Error('sponsor_media 버킷이 없습니다. Supabase에서 PUBLIC 버킷 생성 후 안내된 SQL을 실행해 주세요.');
        }
        throw uploadRes.error;
      }

      var urlRes = sb.storage.from(SPONSOR_MEDIA_BUCKET).getPublicUrl(path);
      $('f_media_' + slot).value = urlRes.data.publicUrl;
      if (statusEl) statusEl.textContent = '✅ 업로드 완료';
      updateMockup();
    } catch (err) {
      console.error('[AdminSponsor] 이미지 업로드 실패', err);
      if (statusEl) statusEl.textContent = '';
      alert('이미지 업로드에 실패했습니다: ' + (err && err.message ? err.message : String(err)));
    } finally {
      inputEl.value = '';
    }
  }

  // ───────────────────────── 저장 ─────────────────────────
  function parsePinBulk(text) {
    var seen = {};
    return String(text || '')
      .split(/\r?\n/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) {
        if (!s || seen[s]) return false;
        seen[s] = true;
        return true;
      });
  }

  async function submitForm() {
    var company = $('f_company').value.trim();
    var brand = $('f_brand').value.trim();
    var managerName = $('f_manager_name').value.trim();
    var managerMobile = $('f_manager_mobile').value.trim();
    var managerEmail = $('f_manager_email').value.trim();
    var startRaw = $('f_start').value;
    var endRaw = $('f_end').value;
    var startIso = fromLocalInput(startRaw);
    var endIso = fromLocalInput(endRaw);
    var title = $('f_title').value.trim();
    var optA = $('f_opt_a').value.trim();
    var optB = $('f_opt_b').value.trim();
    var winRateRaw = $('f_win_rate').value;

    // 필수 항목을 하나씩 짚어서 안내 — "날짜가 비어있음"과 "존재하지 않는 날짜(예: 11/31)를 입력해 브라우저가
    // 값을 비워버린 경우"를 구분해줘야, 화면엔 입력된 것처럼 보이는데 왜 저장이 안 되는지 헷갈리지 않는다.
    var missing = [];
    if (!company) missing.push('기업명');
    if (!brand) missing.push('브랜드명');
    if (!managerName) missing.push('담당자명');
    if (!managerMobile) missing.push('담당자 휴대폰');
    if (!managerEmail) missing.push('담당자 이메일');
    if (!title) missing.push('불판 메인 질문');
    if (!optA) missing.push('A픽 텍스트');
    if (!optB) missing.push('B픽 텍스트');
    if (winRateRaw === '') missing.push('당첨 확률');

    if (!startIso) {
      alert(startRaw
        ? '캠페인 시작일시가 올바르지 않습니다. 실제로 존재하는 날짜인지 다시 확인해 주세요. (예: 11월은 30일까지만 있습니다)'
        : '캠페인 시작일시를 입력해 주세요.');
      return;
    }
    if (!endIso) {
      alert(endRaw
        ? '캠페인 종료일시가 올바르지 않습니다. 실제로 존재하는 날짜인지 다시 확인해 주세요. (예: 11월은 30일까지만 있습니다)'
        : '캠페인 종료일시를 입력해 주세요.');
      return;
    }
    if (missing.length) {
      alert('다음 필수 항목(*)을 입력해 주세요:\n- ' + missing.join('\n- '));
      return;
    }
    var winRate = Number(winRateRaw);
    if (isNaN(winRate) || winRate < 0 || winRate > 100) {
      alert('당첨 확률은 0~100 사이 숫자로 입력해 주세요.');
      return;
    }
    if (new Date(endIso) <= new Date(startIso)) {
      alert('종료일은 시작일보다 뒤여야 합니다.');
      return;
    }

    var budgetRaw = $('f_budget').value.replace(/[^\d]/g, '');
    var budget = budgetRaw ? Number(budgetRaw) : null;

    var mediaType = $('f_media_type').value;
    var mediaUrl1 = $('f_media_1').value.trim() || null;
    var mediaUrl2 = $('f_media_2').value.trim() || null;

    var btn = $('formSubmitBtn');
    btn.disabled = true;
    btn.textContent = '저장 중...';

    try {
      var postPayload = {
        title: title,
        option_a_name: optA,
        option_b_name: optB,
        category: 'brand',
        is_sponsor: true,
        reward_win_rate: winRate,
        media_type: mediaType,
        media_url_1: mediaUrl1,
        media_url_2: mediaUrl2,
        visibility_status: 'visible',
      };

      var campaignPayload = {
        advertiser_id: selectedAdvertiserId || null,
        company_name: company,
        brand_name: brand,
        manager_name: managerName,
        manager_mobile: managerMobile,
        manager_phone: $('f_manager_phone').value.trim() || null,
        manager_email: managerEmail,
        budget_krw: budget,
        campaign_start_at: startIso,
        campaign_end_at: endIso,
        coupon_title: $('f_coupon_title').value.trim() || null,
        banner_sub_title: $('f_banner_sub').value.trim() || null,
        banner_main_title: $('f_banner_main').value.trim() || null,
        banner_btn_text: $('f_banner_btn').value.trim() || null,
        banner_link_url: $('f_banner_link').value.trim() || null,
        kakao_message: $('f_kakao_msg').value.trim() || null,
        kakao_link_title: $('f_kakao_title').value.trim() || null,
        kakao_btn_text: $('f_kakao_btn').value.trim() || null,
      };

      var campaignId = currentEditingCampaignId;
      var postId = currentEditingPostId;

      if (!campaignId) {
        var userRes = await sb.auth.getUser();
        var user = userRes.data && userRes.data.user;
        if (!user) throw new Error('로그인 세션을 확인할 수 없습니다.');

        postPayload.author_id = user.id;
        var postIns = await sb.from('posts').insert([postPayload]).select('id').single();
        if (postIns.error) throw postIns.error;
        postId = postIns.data.id;

        campaignPayload.post_id = postId;
        campaignPayload.created_by = user.email || null;
        var campIns = await sb.from('sponsor_campaigns').insert([campaignPayload]).select('id').single();
        if (campIns.error) throw campIns.error;
        campaignId = campIns.data.id;
      } else {
        var postUpd = await sb.from('posts').update(postPayload).eq('id', postId);
        if (postUpd.error) throw postUpd.error;
        var campUpd = await sb.from('sponsor_campaigns').update(campaignPayload).eq('id', campaignId);
        if (campUpd.error) throw campUpd.error;
      }

      // 기존 광고주를 선택하지 않았고 "마스터에도 저장" 체크박스가 켜져 있으면 신규 광고주로 등록
      // (실패해도 캠페인 저장 자체는 이미 끝난 뒤이므로 경고만 남기고 넘어감)
      if (!selectedAdvertiserId && $('f_save_as_advertiser') && $('f_save_as_advertiser').checked) {
        try {
          var advIns = await sb.rpc('sponsor_advertiser_quick_create', {
            p_company_name: company,
            p_brand_name: brand || null,
            p_manager_name: managerName || null,
            p_manager_mobile: managerMobile || null,
            p_manager_phone: $('f_manager_phone').value.trim() || null,
            p_manager_email: managerEmail || null,
          });
          if (!advIns.error && advIns.data) {
            selectedAdvertiserId = advIns.data;
            await sb.from('sponsor_campaigns').update({ advertiser_id: selectedAdvertiserId }).eq('id', campaignId);
          } else if (advIns.error) {
            console.warn('[AdminSponsor] 광고주 마스터 자동 등록 실패(캠페인 저장은 정상 완료됨)', advIns.error);
          }
        } catch (advErr) {
          console.warn('[AdminSponsor] 광고주 마스터 자동 등록 중 오류(캠페인 저장은 정상 완료됨)', advErr);
        }
      }

      // 신규 입력된 쿠폰 PIN 추가 (신규/수정 공통 — 기존 재고에 "추가"만 됨)
      var pins = parsePinBulk($('f_pin_bulk').value);
      if (pins.length) {
        var rows = pins.map(function (pin) { return { campaign_id: campaignId, pin_code: pin }; });
        for (var i = 0; i < rows.length; i += 500) {
          var chunk = rows.slice(i, i + 500);
          var pinIns = await sb.from('sponsor_coupon_pool').insert(chunk);
          if (pinIns.error) {
            console.warn('[AdminSponsor] 쿠폰 PIN 일부 실패(중복 PIN 등)', pinIns.error);
          }
        }
      }

      // 신규 추가된 열람 권한 태그 반영
      var newTags = currentViewerTags.filter(function (t) { return t._new; });
      if (newTags.length) {
        var tagRows = newTags.map(function (t) {
          return { campaign_id: campaignId, viewer_email: t.email, viewer_label: t.label || null };
        });
        var tagIns = await sb.from('sponsor_campaign_viewers').insert(tagRows);
        if (tagIns.error) {
          console.warn('[AdminSponsor] 파트너 매핑 일부 실패', tagIns.error);
        }
      }

      alert(currentEditingCampaignId || campaignId ? '저장되었습니다.' : '스폰서 캠페인이 등록되었습니다.');
      currentEditingCampaignId = null;
      currentEditingPostId = null;
      switchView('list');
      await loadList();
    } catch (err) {
      console.error('[AdminSponsor] 저장 실패', err);
      alert('저장 중 오류가 발생했습니다: ' + (err && err.message ? err.message : String(err)));
    } finally {
      btn.disabled = false;
      btn.textContent = '저장';
    }
  }

  // ───────────────────────── 리포트 모달 ─────────────────────────
  function genderBarRows(obj) {
    var entries = Object.keys(obj || {}).map(function (k) { return [k, obj[k]]; });
    var total = entries.reduce(function (s, e) { return s + e[1]; }, 0) || 1;
    return entries.map(function (e) {
      var pct = Math.round((e[1] / total) * 100);
      return (
        '<div class="bar-row"><div class="bar-label">' + escapeHtml(e[0]) + '</div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%; background:var(--neon-pink);">' + e[1] + ' (' + pct + '%)</div></div></div>'
      );
    }).join('') || '<div class="hint">데이터 없음</div>';
  }

  async function openReportModal(campaignId) {
    $('reportModal').style.display = 'flex';
    $('rptBody').innerHTML = '<div style="color:var(--text-sub);">불러오는 중...</div>';

    var res = await sb.rpc('sponsor_campaign_report', { p_campaign_id: campaignId });
    if (res.error || !res.data || res.data.ok !== true) {
      $('rptBody').innerHTML = '<div style="color:var(--neon-pink);">리포트를 불러오지 못했습니다: ' +
        escapeHtml((res.error && res.error.message) || (res.data && res.data.reason) || '') + '</div>';
      return;
    }

    var d = res.data;
    currentReportData = d;
    $('rptTitle').textContent = '📊 ' + (d.post.title || '캠페인') + ' 성과 리포트';
    $('rptSub').textContent = d.campaign.brand_name + ' (' + d.campaign.company_name + ') · ' +
      fmtDate(d.campaign.campaign_start_at) + ' ~ ' + fmtDate(d.campaign.campaign_end_at);

    var voteTotal = d.votes.total || 0;
    var pctA = voteTotal ? Math.round((d.votes.a / voteTotal) * 100) : 0;
    var pctB = voteTotal ? 100 - pctA : 0;

    var dailyRows = (d.daily_votes || []).map(function (row) {
      return '<tr><td>' + row.date + '</td><td>' + row.votes + '</td></tr>';
    }).join('');

    $('rptBody').innerHTML =
      '<div class="report-kpi-grid">' +
        '<div class="rkpi-card"><div class="rkpi-title">👆 총 투표수</div><div class="rkpi-val">' + voteTotal.toLocaleString() + '</div></div>' +
        '<div class="rkpi-card"><div class="rkpi-title">A/B 비율</div><div class="rkpi-val" style="font-size:1.1rem;">' + pctA + '% / ' + pctB + '%</div></div>' +
        '<div class="rkpi-card"><div class="rkpi-title">🎟️ 쿠폰 소진</div><div class="rkpi-val" style="color:var(--neon-pink);">' + d.coupon_pool.used + ' / ' + d.coupon_pool.total + '</div></div>' +
        '<div class="rkpi-card"><div class="rkpi-title">📢 배너 클릭</div><div class="rkpi-val" style="color:var(--neon-blue);">' + (d.campaign.banner_click_count || 0).toLocaleString() + '</div></div>' +
        '<div class="rkpi-card"><div class="rkpi-title">💬 카톡 공유</div><div class="rkpi-val" style="color:var(--theme-gold);">' + (d.campaign.kakao_share_count || 0).toLocaleString() + '</div></div>' +
      '</div>' +
      '<div class="report-section"><h4>🗳️ ' + escapeHtml(d.post.option_a_name) + ' vs ' + escapeHtml(d.post.option_b_name) + '</h4>' +
        '<div class="bar-row"><div class="bar-label" style="color:var(--neon-blue);">A</div><div class="bar-track"><div class="bar-fill" style="width:' + pctA + '%; background:var(--neon-blue);">' + d.votes.a + '</div></div></div>' +
        '<div class="bar-row"><div class="bar-label" style="color:var(--neon-pink);">B</div><div class="bar-track"><div class="bar-fill" style="width:' + pctB + '%; background:var(--neon-pink);">' + d.votes.b + '</div></div></div>' +
      '</div>' +
      '<div class="report-section"><h4>👥 투표자 성별 분포</h4>' + genderBarRows(d.demographics.gender) + '</div>' +
      '<div class="report-section"><h4>👥 투표자 연령대 분포</h4>' + genderBarRows(d.demographics.age_group) + '</div>' +
      '<div class="report-section"><h4>📈 일자별 투표 추이</h4>' +
        '<table class="daily-table"><thead><tr><th>일자</th><th>투표수</th></tr></thead><tbody>' + (dailyRows || '<tr><td colspan="2">데이터 없음</td></tr>') + '</tbody></table>' +
        '<div class="note-line">※ 노출수(임프레션)·CPC는 별도 광고 서버가 없어 자동 집계되지 않습니다. 실제 투표/쿠폰/클릭 데이터만 표시됩니다.</div>' +
      '</div>';
  }

  function closeReportModal() {
    $('reportModal').style.display = 'none';
    currentReportData = null;
  }

  function downloadReportCsv() {
    var d = currentReportData;
    if (!d) { alert('리포트를 먼저 불러와 주세요.'); return; }

    var lines = [];
    lines.push(['캠페인', (d.campaign.brand_name || '') + ' (' + (d.campaign.company_name || '') + ')']);
    lines.push(['불판 제목', d.post.title || '']);
    lines.push(['기간', fmtDate(d.campaign.campaign_start_at) + ' ~ ' + fmtDate(d.campaign.campaign_end_at)]);
    lines.push(['총 투표수', d.votes.total || 0]);
    lines.push([(d.post.option_a_name || 'A') + ' 투표수', d.votes.a || 0]);
    lines.push([(d.post.option_b_name || 'B') + ' 투표수', d.votes.b || 0]);
    lines.push(['쿠폰 소진', (d.coupon_pool.used || 0) + ' / ' + (d.coupon_pool.total || 0)]);
    lines.push(['배너 클릭수', d.campaign.banner_click_count || 0]);
    lines.push(['카톡 공유수', d.campaign.kakao_share_count || 0]);
    lines.push([]);
    lines.push(['성별 분포']);
    Object.keys(d.demographics.gender || {}).forEach(function (k) {
      lines.push([k, d.demographics.gender[k]]);
    });
    lines.push([]);
    lines.push(['연령대 분포']);
    Object.keys(d.demographics.age_group || {}).forEach(function (k) {
      lines.push([k, d.demographics.age_group[k]]);
    });
    lines.push([]);
    lines.push(['일자', '투표수']);
    (d.daily_votes || []).forEach(function (row) {
      lines.push([row.date, row.votes]);
    });

    var csv = lines.map(function (row) {
      return row.map(function (cell) {
        var s = String(cell == null ? '' : cell);
        if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
      }).join(',');
    }).join('\r\n');

    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (d.campaign.brand_name || 'campaign').replace(/[\\/:*?"<>|]/g, '_') + '_report_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.addEventListener('DOMContentLoaded', function () {
    init().catch(function (err) { console.error('[AdminSponsor] init 실패', err); });
  });

  window.PickleSponsor = {
    switchView: switchView,
    openForm: openForm,
    submitForm: submitForm,
    addViewerTag: addViewerTag,
    removeViewerTag: removeViewerTag,
    provisionViewerAccount: provisionViewerAccount,
    uploadMediaFile: uploadMediaFile,
    duplicateCampaign: duplicateCampaign,
    togglePause: togglePause,
    endCampaignNow: endCampaignNow,
    updateMockup: updateMockup,
    openReportModal: openReportModal,
    closeReportModal: closeReportModal,
    downloadReportCsv: downloadReportCsv,
    onAdvertiserSearchInput: onAdvertiserSearchInput,
    selectAdvertiserResult: selectAdvertiserResult,
    resetAdvertiserSearchBox: resetAdvertiserSearchBox,
  };
})();
