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
      var editBtn = isInternal
        ? '<button class="btn-action btn-edit" onclick="PickleSponsor.openForm(\'edit\',\'' + r.campaign_id + '\')">수정</button>'
        : '';
      return (
        '<tr>' +
          '<td><span class="brand-name">🏷️ ' + escapeHtml(r.brand_name) + '</span><span class="post-title">' + escapeHtml(r.title || '(제목 없음)') + '</span></td>' +
          '<td>' + fmtDate(r.campaign_start_at) + ' ~ ' + fmtDate(r.campaign_end_at) + '</td>' +
          '<td>' + (r.vote_a || 0) + ' / ' + (r.vote_b || 0) + '</td>' +
          '<td>' + r.coupon_used + ' / ' + r.coupon_total + (r.coupon_total ? ' (' + couponPct + '%)' : '') + '</td>' +
          '<td><span class="status-badge ' + status.cls + '">' + status.label + '</span></td>' +
          '<td>' + editBtn + '<button class="btn-action btn-report" onclick="PickleSponsor.openReportModal(\'' + r.campaign_id + '\')">📊 리포트</button></td>' +
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
      return (
        '<div class="partner-tag">' + label + escapeHtml(t.email) +
        ' <span class="tag-close" onclick="PickleSponsor.removeViewerTag(' + idx + ')">✕</span></div>'
      );
    }).join('');
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
    var startIso = fromLocalInput($('f_start').value);
    var endIso = fromLocalInput($('f_end').value);
    var title = $('f_title').value.trim();
    var optA = $('f_opt_a').value.trim();
    var optB = $('f_opt_b').value.trim();
    var winRateRaw = $('f_win_rate').value;

    if (!company || !brand || !managerName || !managerMobile || !managerEmail || !startIso || !endIso || !title || !optA || !optB || winRateRaw === '') {
      alert('필수 항목(*)을 모두 입력해 주세요.');
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
    updateMockup: updateMockup,
    openReportModal: openReportModal,
    closeReportModal: closeReportModal,
    onAdvertiserSearchInput: onAdvertiserSearchInput,
    selectAdvertiserResult: selectAdvertiserResult,
    resetAdvertiserSearchBox: resetAdvertiserSearchBox,
  };
})();
