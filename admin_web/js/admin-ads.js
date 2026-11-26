/**
 * P!CKLE Admin — 광고주 마스터 + 광고(스폰) 정산 관리
 * 접근 권한: super, account (admin-auth.js MENU_ACCESS['ads'] 로 페이지 레벨에서 이미 차단됨)
 */
(function () {
  'use strict';

  var sb = null;
  var advertiserRows = [];
  var settlementRows = [];
  var agencyRows = [];
  var currentAgencyViewerTags = []; // { id(옵션), email, label, _new }

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

  function fmtKrw(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return '₩ ' + Math.round(v).toLocaleString('ko-KR');
  }

  function parseKrw(v) {
    var n = Number(String(v || '').replace(/[^0-9.-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  function statusLabel(status) {
    switch (status) {
      case 'paid': return { label: '입금완료', cls: 'status-paid' };
      case 'partial': return { label: '부분입금', cls: 'status-partial' };
      case 'cancelled': return { label: '취소', cls: 'status-cancelled' };
      default: return { label: '미입금', cls: 'status-unpaid' };
    }
  }

  async function init() {
    sb = (window.PickleAdminWorkspace && window.PickleAdminWorkspace.getClient) ? window.PickleAdminWorkspace.getClient() : null;
    if (!sb) {
      console.error('[AdminAds] PickleAdminWorkspace.getClient() 없음 — admin-auth.js 로드 확인 필요');
      return;
    }
    // 대행사 "소속 광고주 수" 집계가 advertiserRows 에 의존하므로 순서대로 로드
    await loadAdvertisers();
    await loadAgencies();
    await loadSettlements();

    if (window.location.hash === '#agencies') {
      var el = $('agencies');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ========================= 1) 광고주 마스터 =========================

  async function loadAdvertisers() {
    var tbody = $('advertiserTableBody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">불러오는 중...</td></tr>';

    var res = await sb.from('sponsor_advertisers').select('*').order('company_name', { ascending: true });
    if (res.error) {
      console.error('[AdminAds] 광고주 목록 로드 실패', res.error);
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">불러오기 실패 (권한이 없거나 오류 발생)</td></tr>';
      return;
    }
    advertiserRows = res.data || [];
    renderAdvertiserTable(advertiserRows);
  }

  function renderAdvertiserTable(rows) {
    var tbody = $('advertiserTableBody');
    if (!rows.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">등록된 광고주가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      var contact = [r.manager_mobile, r.manager_phone].filter(Boolean).join(' / ') || '-';
      var agency = agencyRows.filter(function (a) { return a.id === r.agency_id; })[0];
      var agencyLine = agency ? '<span class="sub-line">🏬 ' + escapeHtml(agency.name) + '</span>' : '';
      return (
        '<tr>' +
        '<td><span class="brand-name">' + escapeHtml(r.company_name) + '</span>' +
        (r.brand_name ? '<span class="sub-line">' + escapeHtml(r.brand_name) + '</span>' : '') + agencyLine + '</td>' +
        '<td>' + escapeHtml(r.manager_name || '-') + '</td>' +
        '<td>' + escapeHtml(contact) + '</td>' +
        '<td>' + fmtDate(r.created_at) + '</td>' +
        '<td>' +
        '<button class="btn-action btn-edit" onclick="PickleAds.openAdvertiserForm(\'edit\',\'' + r.id + '\')">수정</button>' +
        '<button class="btn-action btn-del" onclick="PickleAds.deleteAdvertiser(\'' + r.id + '\')">삭제</button>' +
        '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function filterAdvertisers() {
    var q = ($('advSearchInput').value || '').trim().toLowerCase();
    if (!q) { renderAdvertiserTable(advertiserRows); return; }
    var filtered = advertiserRows.filter(function (r) {
      return (r.company_name || '').toLowerCase().indexOf(q) !== -1 ||
        (r.brand_name || '').toLowerCase().indexOf(q) !== -1;
    });
    renderAdvertiserTable(filtered);
  }

  function openAdvertiserForm(mode, id) {
    $('adv_id').value = '';
    ['adv_company', 'adv_brand', 'adv_manager_name', 'adv_biz_reg', 'adv_mobile', 'adv_phone', 'adv_email', 'adv_bank_holder', 'adv_bank_name', 'adv_bank_account', 'adv_memo'].forEach(function (id2) {
      $(id2).value = '';
    });

    if (mode === 'edit' && id) {
      var row = advertiserRows.filter(function (r) { return r.id === id; })[0];
      if (!row) { alert('광고주 정보를 찾을 수 없습니다.'); return; }
      $('advModalTitle').textContent = '광고주 정보 수정';
      $('adv_id').value = row.id;
      $('adv_company').value = row.company_name || '';
      $('adv_brand').value = row.brand_name || '';
      $('adv_manager_name').value = row.manager_name || '';
      $('adv_biz_reg').value = row.biz_reg_no || '';
      $('adv_mobile').value = row.manager_mobile || '';
      $('adv_phone').value = row.manager_phone || '';
      $('adv_email').value = row.manager_email || '';
      $('adv_bank_holder').value = row.bank_account_holder || '';
      $('adv_bank_name').value = row.bank_name || '';
      $('adv_bank_account').value = row.bank_account_no || '';
      $('adv_memo').value = row.memo || '';
      $('adv_agency_id').value = row.agency_id || '';
    } else {
      $('advModalTitle').textContent = '신규 광고주 등록';
      $('adv_agency_id').value = '';
    }
    $('advModal').style.display = 'flex';
  }

  function closeAdvertiserForm() {
    $('advModal').style.display = 'none';
  }

  async function submitAdvertiserForm() {
    var company = $('adv_company').value.trim();
    if (!company) { alert('기업명은 필수입니다.'); return; }

    var payload = {
      company_name: company,
      brand_name: $('adv_brand').value.trim() || null,
      agency_id: $('adv_agency_id').value || null,
      manager_name: $('adv_manager_name').value.trim() || null,
      biz_reg_no: $('adv_biz_reg').value.trim() || null,
      manager_mobile: $('adv_mobile').value.trim() || null,
      manager_phone: $('adv_phone').value.trim() || null,
      manager_email: $('adv_email').value.trim() || null,
      bank_account_holder: $('adv_bank_holder').value.trim() || null,
      bank_name: $('adv_bank_name').value.trim() || null,
      bank_account_no: $('adv_bank_account').value.trim() || null,
      memo: $('adv_memo').value.trim() || null,
    };

    var id = $('adv_id').value;
    var res;
    if (id) {
      res = await sb.from('sponsor_advertisers').update(payload).eq('id', id);
    } else {
      res = await sb.from('sponsor_advertisers').insert(payload);
    }

    if (res.error) {
      console.error('[AdminAds] 광고주 저장 실패', res.error);
      alert('저장에 실패했습니다: ' + res.error.message);
      return;
    }

    closeAdvertiserForm();
    await loadAdvertisers();
    renderAgencyTable(agencyRows); // 소속 광고주 수 갱신
  }

  async function deleteAdvertiser(id) {
    if (!confirm('이 광고주를 삭제하시겠습니까? (이미 생성된 캠페인의 광고주 연결은 해제되며, 캠페인 자체는 삭제되지 않습니다)')) return;
    var res = await sb.from('sponsor_advertisers').delete().eq('id', id);
    if (res.error) {
      alert('삭제에 실패했습니다: ' + res.error.message);
      return;
    }
    await loadAdvertisers();
  }

  // ========================= 1-1) 대행사(파트너) 마스터 =========================

  async function loadAgencies() {
    var tbody = $('agencyTableBody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">불러오는 중...</td></tr>';

    var res = await sb.from('sponsor_agencies').select('*').order('name', { ascending: true });
    if (res.error) {
      console.error('[AdminAds] 대행사 목록 로드 실패', res.error);
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">불러오기 실패 (권한이 없거나 오류 발생)</td></tr>';
      return;
    }
    agencyRows = res.data || [];
    renderAgencyTable(agencyRows);
    populateAgencySelect();
  }

  function populateAgencySelect() {
    var sel = $('adv_agency_id');
    var current = sel.value;
    sel.innerHTML = '<option value="">없음 (직접 계약)</option>' +
      agencyRows.map(function (a) {
        return '<option value="' + a.id + '">' + escapeHtml(a.name) + '</option>';
      }).join('');
    sel.value = current;
  }

  function renderAgencyTable(rows) {
    var tbody = $('agencyTableBody');
    if (!rows.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">등록된 대행사가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      var contact = [r.manager_mobile, r.manager_phone].filter(Boolean).join(' / ') || '-';
      var advCount = advertiserRows.filter(function (a) { return a.agency_id === r.id; }).length;
      return (
        '<tr>' +
        '<td><span class="brand-name">🏬 ' + escapeHtml(r.name) + '</span></td>' +
        '<td>' + escapeHtml(r.manager_name || '-') + '</td>' +
        '<td>' + escapeHtml(contact) + '</td>' +
        '<td>' + Number(r.commission_rate_pct || 0) + '%</td>' +
        '<td>' + advCount + '개</td>' +
        '<td>' +
        '<button class="btn-action btn-edit" onclick="PickleAds.openAgencyForm(\'edit\',\'' + r.id + '\')">수정</button>' +
        '<button class="btn-action btn-del" onclick="PickleAds.deleteAgency(\'' + r.id + '\')">삭제</button>' +
        '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function filterAgencies() {
    var q = ($('agSearchInput').value || '').trim().toLowerCase();
    if (!q) { renderAgencyTable(agencyRows); return; }
    var filtered = agencyRows.filter(function (r) {
      return (r.name || '').toLowerCase().indexOf(q) !== -1;
    });
    renderAgencyTable(filtered);
  }

  function renderAgencyViewerTags() {
    var container = $('agViewerTagContainer');
    container.innerHTML = currentAgencyViewerTags.map(function (t, idx) {
      var label = t.label ? escapeHtml(t.label) + ' · ' : '';
      var provisionBtn = t.id
        ? ' <span class="tag-close" onclick="PickleAds.provisionAgencyViewerAccount(' + idx + ')" title="로그인 계정 발급" style="background:rgba(57,255,20,0.15); color:var(--neon-green);">🔑</span>'
        : '';
      return (
        '<div class="partner-tag">' + label + escapeHtml(t.email) + provisionBtn +
        ' <span class="tag-close" onclick="PickleAds.removeAgencyViewerTag(' + idx + ')">✕</span></div>'
      );
    }).join('');
  }

  function addAgencyViewerTag() {
    var emailEl = $('agViewerEmailInput');
    var labelEl = $('agViewerLabelInput');
    var email = (emailEl.value || '').trim().toLowerCase();
    var label = (labelEl.value || '').trim();
    if (!email || email.indexOf('@') === -1) {
      alert('유효한 이메일을 입력해 주세요.');
      return;
    }
    if (currentAgencyViewerTags.some(function (t) { return t.email === email; })) {
      alert('이미 추가된 이메일입니다.');
      return;
    }
    currentAgencyViewerTags.push({ email: email, label: label, _new: true });
    emailEl.value = '';
    labelEl.value = '';
    renderAgencyViewerTags();
  }

  async function removeAgencyViewerTag(idx) {
    var tag = currentAgencyViewerTags[idx];
    if (!tag) return;
    if (tag.id) {
      var delRes = await sb.from('sponsor_agency_viewers').delete().eq('id', tag.id);
      if (delRes.error) {
        alert('삭제 실패: ' + delRes.error.message);
        return;
      }
    }
    currentAgencyViewerTags.splice(idx, 1);
    renderAgencyViewerTags();
  }

  async function provisionAgencyViewerAccount(idx) {
    var tag = currentAgencyViewerTags[idx];
    if (!tag || !tag.id) return;

    if (!window.PickleAdminWorkspace || !window.PickleAdminWorkspace.provisionStaffAccount) {
      alert('계정 발급 모듈을 불러오지 못했습니다.');
      return;
    }

    var displayName = prompt('담당자 이름을 입력해 주세요', tag.label || '');
    if (displayName === null) return;
    displayName = displayName.trim();
    if (!displayName) { alert('담당자 이름은 필수입니다.'); return; }

    var password = prompt('초기 비밀번호를 입력해 주세요 (8자 이상). 발급 후 담당자에게 직접 전달해 주세요.', '');
    if (password === null) return;
    if (!password || password.length < 8) { alert('비밀번호는 8자 이상이어야 합니다.'); return; }

    var department = $('ag_name').value.trim() || '대행사';

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
      msg += '\n\n✅ 로그인 가능한 계정이 생성되었습니다. 이 대행사 소속 광고주의 모든 캠페인을 조회할 수 있습니다.';
    }
    alert(msg);
  }

  function openAgencyForm(mode, id) {
    $('ag_id').value = '';
    ['ag_name', 'ag_manager_name', 'ag_commission_rate', 'ag_mobile', 'ag_phone', 'ag_email', 'ag_memo'].forEach(function (id2) {
      $(id2).value = '';
    });
    currentAgencyViewerTags = [];

    if (mode === 'edit' && id) {
      var row = agencyRows.filter(function (r) { return r.id === id; })[0];
      if (!row) { alert('대행사 정보를 찾을 수 없습니다.'); return; }
      $('agModalTitle').textContent = '대행사 정보 수정';
      $('ag_id').value = row.id;
      $('ag_name').value = row.name || '';
      $('ag_manager_name').value = row.manager_name || '';
      $('ag_commission_rate').value = row.commission_rate_pct != null ? row.commission_rate_pct : '';
      $('ag_mobile').value = row.manager_mobile || '';
      $('ag_phone').value = row.manager_phone || '';
      $('ag_email').value = row.manager_email || '';
      $('ag_memo').value = row.memo || '';

      $('agViewerSection').style.display = '';
      $('agViewerHintNew').style.display = 'none';
      loadAgencyViewerTags(row.id);
    } else {
      $('agModalTitle').textContent = '신규 대행사 등록';
      $('agViewerSection').style.display = 'none';
      $('agViewerHintNew').style.display = '';
      renderAgencyViewerTags();
    }
    $('agModal').style.display = 'flex';
  }

  async function loadAgencyViewerTags(agencyId) {
    var res = await sb.from('sponsor_agency_viewers').select('*').eq('agency_id', agencyId);
    currentAgencyViewerTags = (res.data || []).map(function (v) {
      return { id: v.id, email: v.viewer_email, label: v.viewer_label || '' };
    });
    renderAgencyViewerTags();
  }

  function closeAgencyForm() {
    $('agModal').style.display = 'none';
  }

  async function submitAgencyForm() {
    var name = $('ag_name').value.trim();
    if (!name) { alert('대행사명은 필수입니다.'); return; }

    var rateRaw = $('ag_commission_rate').value.trim();
    var rate = rateRaw ? Number(rateRaw) : 0;
    if (isNaN(rate) || rate < 0 || rate > 100) {
      alert('기본 수수료율은 0~100 사이 숫자로 입력해 주세요.');
      return;
    }

    var payload = {
      name: name,
      manager_name: $('ag_manager_name').value.trim() || null,
      commission_rate_pct: rate,
      manager_mobile: $('ag_mobile').value.trim() || null,
      manager_phone: $('ag_phone').value.trim() || null,
      manager_email: $('ag_email').value.trim() || null,
      memo: $('ag_memo').value.trim() || null,
    };

    var id = $('ag_id').value;
    var res;
    if (id) {
      res = await sb.from('sponsor_agencies').update(payload).eq('id', id);
    } else {
      res = await sb.from('sponsor_agencies').insert(payload).select('id').single();
    }

    if (res.error) {
      console.error('[AdminAds] 대행사 저장 실패', res.error);
      alert('저장에 실패했습니다: ' + res.error.message);
      return;
    }

    var agencyId = id || (res.data && res.data.id);

    var newTags = currentAgencyViewerTags.filter(function (t) { return t._new; });
    if (agencyId && newTags.length) {
      var tagRows = newTags.map(function (t) {
        return { agency_id: agencyId, viewer_email: t.email, viewer_label: t.label || null };
      });
      var tagIns = await sb.from('sponsor_agency_viewers').insert(tagRows);
      if (tagIns.error) {
        console.warn('[AdminAds] 대행사 열람 계정 매핑 일부 실패', tagIns.error);
      }
    }

    closeAgencyForm();
    await loadAgencies();
  }

  async function deleteAgency(id) {
    if (!confirm('이 대행사를 삭제하시겠습니까? (소속 광고주의 대행사 연결은 해제되며, 광고주 자체는 삭제되지 않습니다)')) return;
    var res = await sb.from('sponsor_agencies').delete().eq('id', id);
    if (res.error) {
      alert('삭제에 실패했습니다: ' + res.error.message);
      return;
    }
    await loadAgencies();
  }

  // ========================= 2) 정산 내역 =========================

  async function loadSettlements() {
    var tbody = $('settlementTableBody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">불러오는 중...</td></tr>';

    var res = await sb.rpc('sponsor_settlement_list');
    if (res.error) {
      console.error('[AdminAds] 정산 목록 로드 실패', res.error);
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">불러오기 실패 (권한이 없거나 오류 발생)</td></tr>';
      return;
    }
    settlementRows = res.data || [];
    renderSettlementTable(settlementRows);
  }

  function renderSettlementTable(rows) {
    var tbody = $('settlementTableBody');
    if (!rows.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">표시할 정산 내역이 없습니다.</td></tr>';
      updateSettlementTotals([]);
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      var st = statusLabel(r.status);
      var agencyCell = r.agency_name
        ? '🏬 ' + escapeHtml(r.agency_name) + ' · ' + Number(r.commission_rate_pct || 0) + '%' +
          '<span class="sub-line">수수료 ' + fmtKrw(r.commission_amount_krw) + '</span>'
        : '<span class="sub-line">직접 계약</span>';
      return (
        '<tr>' +
        '<td><span class="brand-name">' + escapeHtml(r.brand_name || r.company_name || '-') + '</span>' +
        '<span class="sub-line">' + escapeHtml(r.campaign_title || '-') + '</span></td>' +
        '<td>' + fmtDate(r.campaign_start_at) + ' ~ ' + fmtDate(r.campaign_end_at) + '</td>' +
        '<td>' + fmtKrw(r.budget_krw) + '</td>' +
        '<td>' + agencyCell + '</td>' +
        '<td><span class="status-badge ' + st.cls + '">' + st.label + '</span></td>' +
        '<td>' + fmtDate(r.paid_at) + '</td>' +
        '<td><button class="btn-action btn-settle" onclick="PickleAds.openSettlementForm(\'' + r.campaign_id + '\')">상태 변경</button></td>' +
        '</tr>'
      );
    }).join('');
    updateSettlementTotals(rows);
  }

  function updateSettlementTotals(rows) {
    var totalAmount = rows.reduce(function (sum, r) { return sum + parseKrw(r.budget_krw); }, 0);
    var paidAmount = rows.reduce(function (sum, r) { return sum + parseKrw(r.paid_amount_krw); }, 0);
    var commissionAmount = rows.reduce(function (sum, r) { return sum + parseKrw(r.commission_amount_krw); }, 0);
    $('setTotalCount').textContent = rows.length;
    $('setTotalAmount').textContent = fmtKrw(totalAmount);
    $('setCommissionAmount').textContent = Math.round(commissionAmount).toLocaleString('ko-KR');
    $('setPaidAmount').textContent = Math.round(paidAmount).toLocaleString('ko-KR');
  }

  function filterSettlements() {
    var q = ($('setSearchInput').value || '').trim().toLowerCase();
    var month = $('setMonthInput').value; // "YYYY-MM"
    var status = $('setStatusInput').value;

    var filtered = settlementRows.filter(function (r) {
      if (q) {
        var hay = ((r.company_name || '') + ' ' + (r.brand_name || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (month) {
        var d = new Date(r.campaign_start_at);
        var rowMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (rowMonth !== month) return false;
      }
      if (status && r.status !== status) return false;
      return true;
    });

    renderSettlementTable(filtered);
  }

  function resetSettlementFilter() {
    $('setSearchInput').value = '';
    $('setMonthInput').value = '';
    $('setStatusInput').value = '';
    renderSettlementTable(settlementRows);
  }

  function openSettlementForm(campaignId) {
    var row = settlementRows.filter(function (r) { return r.campaign_id === campaignId; })[0];
    if (!row) { alert('정산 정보를 찾을 수 없습니다.'); return; }

    $('set_campaign_id').value = campaignId;
    $('setModalCampaignInfo').textContent =
      (row.brand_name || row.company_name || '-') + ' · ' + (row.campaign_title || '-') + ' · 캠페인 금액 ' + fmtKrw(row.budget_krw);
    $('set_status').value = row.status || 'unpaid';
    $('set_paid_amount').value = row.paid_amount_krw ? String(Math.round(row.paid_amount_krw)) : '';
    $('set_paid_at').value = row.paid_at ? row.paid_at.slice(0, 10) : '';
    $('set_memo').value = row.memo || '';
    $('set_commission_rate').value = row.commission_rate_pct != null ? row.commission_rate_pct : '';
    $('set_commission_hint').textContent = row.agency_name
      ? '🏬 ' + row.agency_name + ' · 수수료 ' + fmtKrw(row.commission_amount_krw) + ' / 순정산액(광고주 몫) ' + fmtKrw(row.net_amount_krw)
      : '';

    $('setModal').style.display = 'flex';
  }

  function closeSettlementForm() {
    $('setModal').style.display = 'none';
  }

  async function submitSettlementForm() {
    var campaignId = $('set_campaign_id').value;
    var status = $('set_status').value;
    var paidAmount = $('set_paid_amount').value ? parseKrw($('set_paid_amount').value) : null;
    var paidAtRaw = $('set_paid_at').value;
    var paidAt = paidAtRaw ? new Date(paidAtRaw + 'T00:00:00').toISOString() : null;
    var memo = $('set_memo').value.trim() || null;
    var commissionRaw = $('set_commission_rate').value.trim();
    var commissionRate = commissionRaw === '' ? null : Number(commissionRaw);
    if (commissionRate != null && (isNaN(commissionRate) || commissionRate < 0 || commissionRate > 100)) {
      alert('수수료율은 0~100 사이 숫자로 입력해 주세요.');
      return;
    }

    var res = await sb.rpc('sponsor_settlement_update', {
      p_campaign_id: campaignId,
      p_status: status,
      p_paid_amount_krw: paidAmount,
      p_paid_at: paidAt,
      p_memo: memo,
      p_commission_rate_pct: commissionRate,
    });

    if (res.error || (res.data && res.data.ok === false)) {
      var msg = res.error ? res.error.message : (res.data && res.data.error);
      alert('정산 상태 변경에 실패했습니다: ' + msg);
      return;
    }

    closeSettlementForm();
    await loadSettlements();
  }

  document.addEventListener('DOMContentLoaded', function () {
    init().catch(function (err) { console.error('[AdminAds] 초기화 실패', err); });
  });

  window.PickleAds = {
    filterAdvertisers: filterAdvertisers,
    openAdvertiserForm: openAdvertiserForm,
    closeAdvertiserForm: closeAdvertiserForm,
    submitAdvertiserForm: submitAdvertiserForm,
    deleteAdvertiser: deleteAdvertiser,
    filterAgencies: filterAgencies,
    openAgencyForm: openAgencyForm,
    closeAgencyForm: closeAgencyForm,
    submitAgencyForm: submitAgencyForm,
    deleteAgency: deleteAgency,
    addAgencyViewerTag: addAgencyViewerTag,
    removeAgencyViewerTag: removeAgencyViewerTag,
    provisionAgencyViewerAccount: provisionAgencyViewerAccount,
    filterSettlements: filterSettlements,
    resetSettlementFilter: resetSettlementFilter,
    openSettlementForm: openSettlementForm,
    closeSettlementForm: closeSettlementForm,
    submitSettlementForm: submitSettlementForm,
  };
})();
