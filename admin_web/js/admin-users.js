/**
 * P!CKLE Admin — 회원 관리 (Supabase users + 취향/마케팅 필터)
 */
(function () {
  'use strict';

  var usersCache = [];
  var filteredUsers = [];
  var currentPage = 1;

  var GENDER_LABELS = { male: '남성', female: '여성' };
  var AGE_LABELS = {
    '10s': '10대',
    '20s': '20대',
    '30s': '30대',
    '40s': '40대',
    '50plus': '50대+',
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getSupabaseClient() {
    var cfg = window.PICKLE_SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey) {
      throw new Error('Supabase 접속 정보가 없습니다. js/supabase-config.js 를 확인해 주세요.');
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase JS 라이브러리가 로드되지 않았습니다.');
    }
    return window.supabase.createClient(cfg.url.trim(), cfg.anonKey.trim());
  }

  function formatGender(value) {
    if (!value) return '—';
    return GENDER_LABELS[value] || value;
  }

  function formatAgeGroup(value) {
    if (!value) return '—';
    return AGE_LABELS[value] || value;
  }

  function formatRegion(value) {
    var v = value ? String(value).trim() : '';
    return v || '—';
  }

  function formatUserEmail(user) {
    if (!user) return '이메일 미등록';
    var email = user.email ? String(user.email).trim() : '';
    return email || '이메일 미등록';
  }

  function formatModalUidLine(user) {
    var rawId = String(user && user.id ? user.id : '').replace(/-/g, '');
    var shortId = rawId ? rawId.slice(0, 6) : '—';
    var email = formatUserEmail(user);
    if (!email || email === '이메일 미등록') {
      return 'UID: ' + shortId;
    }
    return 'UID: ' + shortId + ' | ' + email;
  }

  function getWeekStartMonday() {
    var now = new Date();
    var day = now.getDay();
    var diff = day === 0 ? 6 : day - 1;
    var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  function countNewUsersThisWeek() {
    var weekStart = getWeekStartMonday().getTime();
    return usersCache.filter(function (user) {
      if (!user.created_at) return false;
      return new Date(user.created_at).getTime() >= weekStart;
    }).length;
  }

  function resolveSignupPlatform(user) {
    var p = String((user && user.signup_platform) || '')
      .toLowerCase()
      .trim();
    if (['kakao', 'naver', 'google', 'apple', 'email', 'guest'].indexOf(p) >= 0) {
      return p;
    }
    if (user && user.email) {
      var email = String(user.email).toLowerCase();
      if (email.indexOf('kakao') !== -1) return 'kakao';
      if (email.indexOf('naver') !== -1) return 'naver';
      if (email.indexOf('gmail') !== -1 || email.indexOf('googlemail') !== -1) return 'google';
    }
    if (p === 'unknown' || !p) return 'email';
    return p;
  }

  function platformInfo(userOrPlatform) {
    var platform =
      typeof userOrPlatform === 'string'
        ? userOrPlatform
        : resolveSignupPlatform(userOrPlatform);
    var p = String(platform || '').toLowerCase();
    var map = {
      kakao: { emoji: '🟡', label: '카카오', cls: 'bg-kakao' },
      naver: { emoji: '🟢', label: '네이버', cls: 'bg-naver' },
      google: { emoji: '🔴', label: 'Google', cls: 'bg-google' },
      apple: { emoji: '🍎', label: 'Apple', cls: 'bg-email' },
      email: { emoji: '✉️', label: '이메일', cls: 'bg-email' },
      guest: { emoji: '👤', label: '게스트', cls: 'bg-email' },
    };
    return map[p] || map.email;
  }

  function platformBadgeClass(userOrPlatform) {
    return platformInfo(userOrPlatform).cls;
  }

  function platformLabel(userOrPlatform) {
    var info = platformInfo(userOrPlatform);
    return info.emoji + ' ' + info.label;
  }

  function platformLabelPlain(userOrPlatform) {
    return platformInfo(userOrPlatform).label;
  }

  function isMarketingAgreed(user) {
    if (user.marketing_agreed === true) return true;
    if (user.marketing_consent === true) return true;
    return false;
  }

  function penaltyTier(user) {
    var pts = Number(user.penalty_points) || 0;
    if (user.account_status === 'suspended' || pts >= 100) {
      return { cls: 'pt-red', icon: '🟥', label: pts + ' 점', status: 'banned' };
    }
    if (pts >= 70) {
      return { cls: 'pt-yellow', icon: '🟨', label: pts + ' 점', status: 'warning' };
    }
    return { cls: 'pt-clean', icon: '', label: pts + ' 점', status: 'active' };
  }

  function statusBadge(user) {
    var tier = penaltyTier(user);
    if (tier.status === 'banned') {
      return '<span class="status-badge status-banned">영구 차단</span>';
    }
    if (tier.status === 'warning') {
      return '<span class="status-badge status-warning">경고</span>';
    }
    if (user.account_status === 'suspended') {
      return '<span class="status-badge status-banned">정지</span>';
    }
    return '<span class="status-badge status-active">활동중</span>';
  }

  function marketingBadge(user) {
    return isMarketingAgreed(user)
      ? '<span class="mkt-agree">Y</span>'
      : '<span class="mkt-deny">N</span>';
  }

  function genderCell(user) {
    var g = user.gender;
    if (!g) return '<span class="text-muted-cell">—</span>';
    var cls = g === 'female' ? 'text-female' : 'text-male';
    return '<span class="' + cls + '">' + escapeHtml(formatGender(g)) + '</span>';
  }

  function getFilterState() {
    return {
      q: ($('filterSearch') && $('filterSearch').value.trim().toLowerCase()) || '',
      platform: ($('filterPlatform') && $('filterPlatform').value) || 'all',
      gender: ($('filterGender') && $('filterGender').value) || 'all',
      ageGroup: ($('filterAgeGroup') && $('filterAgeGroup').value) || 'all',
      region: ($('filterRegion') && $('filterRegion').value) || 'all',
      marketing: ($('filterMarketing') && $('filterMarketing').value) || 'all',
      status: ($('filterStatus') && $('filterStatus').value) || 'all',
      sort: ($('filterSort') && $('filterSort').value) || 'newest',
      marketingOnly: !!($('filterMarketingOnly') && $('filterMarketingOnly').classList.contains('is-active')),
    };
  }

  function applyFilters() {
    var f = getFilterState();

    filteredUsers = usersCache.filter(function (user) {
      if (f.q) {
        var nick = String(user.nickname || '').toLowerCase();
        var uid = String(user.id || '').toLowerCase();
        var email = String(user.email || '').toLowerCase();
        if (nick.indexOf(f.q) === -1 && uid.indexOf(f.q) === -1 && email.indexOf(f.q) === -1) {
          return false;
        }
      }

      if (f.platform !== 'all' && resolveSignupPlatform(user) !== f.platform) {
        return false;
      }

      if (f.gender === 'male' && user.gender !== 'male') return false;
      if (f.gender === 'female' && user.gender !== 'female') return false;

      if (f.ageGroup !== 'all') {
        if (f.ageGroup === '40plus') {
          if (user.age_group !== '40s' && user.age_group !== '50plus') return false;
        } else if (user.age_group !== f.ageGroup) {
          return false;
        }
      }

      if (f.region !== 'all') {
        if (formatRegion(user.region) !== f.region) return false;
      }

      if (f.marketing === 'y' && !isMarketingAgreed(user)) return false;
      if (f.marketing === 'n' && isMarketingAgreed(user)) return false;

      if (f.marketingOnly && !isMarketingAgreed(user)) return false;

      var tier = penaltyTier(user);
      if (f.status === 'active' && tier.status !== 'active') return false;
      if (f.status === 'warning' && tier.status !== 'warning') return false;
      if (f.status === 'banned' && tier.status !== 'banned') return false;

      return true;
    });

    filteredUsers.sort(function (a, b) {
      if (f.sort === 'points') {
        return (Number(b.points) || 0) - (Number(a.points) || 0);
      }
      if (f.sort === 'penalty') {
        return (Number(b.penalty_points) || 0) - (Number(a.penalty_points) || 0);
      }
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    currentPage = 1;
    syncMarketingChipState();
    renderTable();
    updateKpi();
    updateCountLabel();
    renderPagination();
  }

  function getPageSize() {
    var el = $('listPageSize');
    return el ? parseInt(el.value, 10) || 50 : 50;
  }

  function getPageUsers() {
    var size = getPageSize();
    var start = (currentPage - 1) * size;
    return filteredUsers.slice(start, start + size);
  }

  function renderTable() {
    var tbody = $('usersTableBody');
    if (!tbody) return;

    var rows = getPageUsers();
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="10" style="text-align:center;padding:40px;color:#71717a;font-weight:700;">조건에 맞는 회원이 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(function (user) {
        var tier = penaltyTier(user);
        var shortId = String(user.id || '').slice(0, 8);
        var avatar = user.avatar_html ? String(user.avatar_html).trim().slice(0, 2) : '👤';
        var isBanned = tier.status === 'banned';

        var actions =
          '<div class="action-btns">' +
          '<button type="button" class="btn-sm btn-detail" data-user-id="' +
          escapeHtml(user.id) +
          '" onclick="PickleAdminUsers.openUserModal(\'' +
          escapeHtml(user.id) +
          '\')">상세</button>';

        if (isBanned) {
          actions += '<span class="text-banned">조치불가 (차단됨)</span>';
        } else {
          actions +=
            '<button type="button" class="btn-sm btn-penalty" onclick="alert(\'벌점 부과 기능 준비 중입니다.\')">🔨 벌점</button>' +
            '<button type="button" class="btn-sm btn-ban" onclick="banUser(\'' +
            escapeHtml(user.nickname || '') +
            '\')">영구 차단</button>';
        }
        actions += '</div>';

        return (
          '<tr>' +
          '<td><div class="user-profile-cell">' +
          '<div class="avatar">' +
          escapeHtml(avatar) +
          '</div>' +
          '<div class="user-info">' +
          '<span class="user-nickname">' +
          escapeHtml(user.nickname || '픽클러') +
          '</span>' +
          '<div style="font-size: 0.8rem; color: var(--text-sub); margin-top: 2px;">' +
          escapeHtml(formatUserEmail(user)) +
          '</div>' +
          '<span class="user-uid">UID: ' +
          escapeHtml(shortId) +
          '…</span>' +
          '</div></div></td>' +
          '<td><span class="small-badge ' +
          platformBadgeClass(user) +
          '">' +
          escapeHtml(platformLabel(user)) +
          '</span></td>' +
          '<td>' +
          genderCell(user) +
          '</td>' +
          '<td><span class="text-age">' +
          escapeHtml(formatAgeGroup(user.age_group)) +
          '</span></td>' +
          '<td><span class="region-badge">' +
          escapeHtml(formatRegion(user.region)) +
          '</span></td>' +
          '<td style="text-align:center;">' +
          marketingBadge(user) +
          '</td>' +
          '<td style="color:var(--theme-gold);font-weight:700;">' +
          Number(user.points || 0).toLocaleString() +
          ' P</td>' +
          '<td style="text-align:center;"><span class="' +
          tier.cls +
          '">' +
          (tier.icon ? '<span class="card-icon">' + tier.icon + '</span> ' : '') +
          tier.label +
          '</span></td>' +
          '<td style="text-align:center;">' +
          statusBadge(user) +
          '</td>' +
          '<td style="text-align:right;">' +
          actions +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function updateKpi() {
    var totalEl = $('kpiTotalUsers');
    var newWeekEl = $('kpiNewUsersWeek');
    var mktEl = $('kpiMarketingUsers');
    var warnEl = $('kpiWarningUsers');
    var banEl = $('kpiBannedUsers');

    if (totalEl) totalEl.textContent = usersCache.length.toLocaleString();
    if (newWeekEl) newWeekEl.textContent = countNewUsersThisWeek().toLocaleString();
    if (mktEl) {
      var mktCount = usersCache.filter(isMarketingAgreed).length;
      mktEl.textContent = mktCount.toLocaleString();
    }
    if (warnEl) {
      var warnCount = usersCache.filter(function (u) {
        return penaltyTier(u).status === 'warning';
      }).length;
      warnEl.textContent = warnCount.toLocaleString();
    }
    if (banEl) {
      var banCount = usersCache.filter(function (u) {
        return penaltyTier(u).status === 'banned';
      }).length;
      banEl.textContent = banCount.toLocaleString();
    }
  }

  function updateCountLabel() {
    var el = $('usersCountLabel');
    if (el) el.textContent = filteredUsers.length.toLocaleString();
  }

  function renderPagination() {
    var wrap = $('usersPagination');
    if (!wrap) return;

    var size = getPageSize();
    var totalPages = Math.max(1, Math.ceil(filteredUsers.length / size));
    if (currentPage > totalPages) currentPage = totalPages;

    var html = '';
    html +=
      '<button type="button" class="page-btn" data-page="prev"' +
      (currentPage <= 1 ? ' disabled style="opacity:0.4;cursor:not-allowed;"' : '') +
      '>←</button>';

    var maxButtons = 5;
    var start = Math.max(1, currentPage - 2);
    var end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);

    for (var p = start; p <= end; p++) {
      html +=
        '<button type="button" class="page-btn' +
        (p === currentPage ? ' active' : '') +
        '" data-page="' +
        p +
        '">' +
        p +
        '</button>';
    }

    html +=
      '<button type="button" class="page-btn" data-page="next"' +
      (currentPage >= totalPages ? ' disabled style="opacity:0.4;cursor:not-allowed;"' : '') +
      '>→</button>';

    wrap.innerHTML = html;

    wrap.querySelectorAll('.page-btn[data-page]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        var target = btn.getAttribute('data-page');
        if (target === 'prev' && currentPage > 1) currentPage -= 1;
        else if (target === 'next' && currentPage < totalPages) currentPage += 1;
        else if (target !== 'prev' && target !== 'next') currentPage = parseInt(target, 10) || 1;
        renderTable();
        renderPagination();
      });
    });
  }

  function openUserModal(userId) {
    var user = usersCache.find(function (u) {
      return u.id === userId;
    });
    if (!user) return;

    var modal = $('userModal');
    if (!modal) return;

    var tier = penaltyTier(user);
    var avatar = user.avatar_html ? String(user.avatar_html).trim().slice(0, 2) : '👤';

    $('modalAvatar').textContent = avatar;
    $('modalName').textContent = user.nickname || '픽클러';
    $('modalUid').textContent = formatModalUidLine(user);
    var genderEl = $('modalGender');
    genderEl.textContent = formatGender(user.gender);
    genderEl.className =
      'meta-val' +
      (user.gender === 'female' ? ' text-female' : user.gender === 'male' ? ' text-male' : '');
    $('modalAge').textContent = formatAgeGroup(user.age_group);
    $('modalRegion').textContent = formatRegion(user.region);
    $('modalMarketing').textContent = isMarketingAgreed(user) ? '동의 (Y)' : '거부 (N)';
    $('modalJoined').textContent = user.created_at
      ? new Date(user.created_at).toLocaleDateString('ko-KR')
      : '—';
    $('modalPlatform').textContent = platformLabel(user);
    $('modalStatus').textContent =
      tier.status === 'banned'
        ? '🟥 영구 차단 (' + tier.label + ')'
        : tier.status === 'warning'
          ? '🟨 옐로카드 (' + tier.label + ')'
          : '✅ 활동중 (' + tier.label + ')';
    $('modalPoints').textContent = Number(user.points || 0).toLocaleString() + ' P';

    modal.style.display = 'flex';
  }

  function closeUserModal() {
    var modal = $('userModal');
    if (modal) modal.style.display = 'none';
  }

  async function fetchUsersFromSupabase() {
    var sb = getSupabaseClient();

    var rpcResult = await sb.rpc('admin_list_users');
    if (!rpcResult.error && Array.isArray(rpcResult.data)) {
      return { data: rpcResult.data, error: null };
    }
    if (rpcResult.error) {
      console.warn('[Admin Users] admin_list_users RPC unavailable, falling back to users table', rpcResult.error);
    }

    var selectWithEmail =
      'id, nickname, email, signup_platform, points, penalty_points, account_status, gender, age_group, region, marketing_agreed, marketing_consent, is_info_collected, avatar_html, created_at';
    var selectBase =
      'id, nickname, signup_platform, points, penalty_points, account_status, gender, age_group, region, marketing_agreed, marketing_consent, is_info_collected, avatar_html, created_at';

    var result = await sb.from('users').select(selectWithEmail).order('created_at', { ascending: false });
    if (result.error && /email/i.test(result.error.message || '')) {
      result = await sb.from('users').select(selectBase).order('created_at', { ascending: false });
    }
    return result;
  }

  async function loadUsers() {
    var tbody = $('usersTableBody');
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="10" style="text-align:center;padding:40px;color:#71717a;">회원 목록 불러오는 중…</td></tr>';
    }

    try {
      var result = await fetchUsersFromSupabase();

      if (result.error) throw result.error;
      usersCache = result.data || [];
      applyFilters();
    } catch (err) {
      console.error('[Admin Users]', err);
      if (tbody) {
        tbody.innerHTML =
          '<tr><td colspan="10" style="text-align:center;padding:40px;color:#ff3333;font-weight:700;">회원 목록을 불러오지 못했습니다.<br>' +
          escapeHtml(err.message || String(err)) +
          '</td></tr>';
      }
    }
  }

  function syncMarketingChipState() {
    var mktOnlyBtn = $('filterMarketingOnly');
    var marketingSelect = $('filterMarketing');
    if (!mktOnlyBtn || !marketingSelect) return;
    if (marketingSelect.value === 'y' && getFilterState().marketingOnly) {
      mktOnlyBtn.classList.add('is-active');
    } else if (marketingSelect.value !== 'y') {
      mktOnlyBtn.classList.remove('is-active');
    }
  }

  function bindFilters() {
    var searchBtn = $('btnSearchUsers');
    if (searchBtn) searchBtn.addEventListener('click', applyFilters);

    ['filterSearch', 'filterPlatform', 'filterGender', 'filterAgeGroup', 'filterRegion', 'filterMarketing', 'filterStatus', 'filterSort', 'listPageSize'].forEach(
      function (id) {
        var el = $(id);
        if (!el) return;
        el.addEventListener('change', applyFilters);
        if (el.tagName === 'INPUT') {
          el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') applyFilters();
          });
        }
      }
    );

    var mktOnlyBtn = $('filterMarketingOnly');
    if (mktOnlyBtn) {
      mktOnlyBtn.addEventListener('click', function () {
        var marketingSelect = $('filterMarketing');
        var isActive = mktOnlyBtn.classList.contains('is-active');

        if (isActive) {
          mktOnlyBtn.classList.remove('is-active');
          if (marketingSelect) marketingSelect.value = 'all';
        } else {
          mktOnlyBtn.classList.add('is-active');
          if (marketingSelect) marketingSelect.value = 'y';
        }
        applyFilters();
      });
    }

    var ageQuick = $('filterAgeQuick');
    if (ageQuick) {
      ageQuick.addEventListener('change', function () {
        var ageSelect = $('filterAgeGroup');
        if (ageSelect) ageSelect.value = ageQuick.value;
        applyFilters();
      });
    }
  }

  function bootstrap() {
    bindFilters();
    loadUsers();
  }

  window.PickleAdminUsers = {
    loadUsers: loadUsers,
    applyFilters: applyFilters,
    openUserModal: openUserModal,
    closeUserModal: closeUserModal,
  };

  window.openUserModal = openUserModal;
  window.closeUserModal = closeUserModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
