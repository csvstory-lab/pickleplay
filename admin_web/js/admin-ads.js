/**
 * P!CKLE Admin — 광고주 마스터 + 광고(스폰) 정산 관리
 * 접근 권한: super, account (admin-auth.js MENU_ACCESS['ads'] 로 페이지 레벨에서 이미 차단됨)
 */
(function () {
  'use strict';

  var sb = null;
  var advertiserRows = [];
  var settlementRows = [];

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
    await Promise.all([loadAdvertisers(), loadSettlements()]);
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
      return (
        '<tr>' +
        '<td><span class="brand-name">' + escapeHtml(r.company_name) + '</span>' +
        (r.brand_name ? '<span class="sub-line">' + escapeHtml(r.brand_name) + '</span>' : '') + '</td>' +
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
    } else {
      $('advModalTitle').textContent = '신규 광고주 등록';
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
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">표시할 정산 내역이 없습니다.</td></tr>';
      updateSettlementTotals([]);
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      var st = statusLabel(r.status);
      return (
        '<tr>' +
        '<td><span class="brand-name">' + escapeHtml(r.brand_name || r.company_name || '-') + '</span>' +
        '<span class="sub-line">' + escapeHtml(r.campaign_title || '-') + '</span></td>' +
        '<td>' + fmtDate(r.campaign_start_at) + ' ~ ' + fmtDate(r.campaign_end_at) + '</td>' +
        '<td>' + fmtKrw(r.budget_krw) + '</td>' +
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
    $('setTotalCount').textContent = rows.length;
    $('setTotalAmount').textContent = fmtKrw(totalAmount);
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

    var res = await sb.rpc('sponsor_settlement_update', {
      p_campaign_id: campaignId,
      p_status: status,
      p_paid_amount_krw: paidAmount,
      p_paid_at: paidAt,
      p_memo: memo,
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
    filterSettlements: filterSettlements,
    resetSettlementFilter: resetSettlementFilter,
    openSettlementForm: openSettlementForm,
    closeSettlementForm: closeSettlementForm,
    submitSettlementForm: submitSettlementForm,
  };
})();
