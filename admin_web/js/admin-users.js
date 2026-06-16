/**
 * P!CKLE Admin — 회원 관리 (Supabase users + 취향/마케팅 필터)
 */
(function () {
  'use strict';

  var usersCache = [];
  var filteredUsers = [];
  var currentPage = 1;
  var modalCurrentUserId = null;
  var modalActiveTab = 'posts';
  var modalCurrentPage = 1;
  var modalTabTotals = {
    posts: 0,
    votes: 0,
    comments: 0,
    points: 0,
    sanctions: 0,
    points_balance: 0,
  };
  var MODAL_PAGE_SIZE = 10;
  /** slug → 한글명 (categories 테이블) */
  var categoryMap = {};
  var categoriesReady = false;

  var BADGE_COLOR_PALETTE = [
    { bg: 'rgba(0, 240, 255, 0.12)', border: 'rgba(0, 240, 255, 0.4)', color: '#7dd3fc' },
    { bg: 'rgba(255, 0, 127, 0.12)', border: 'rgba(255, 0, 127, 0.38)', color: '#f472b6' },
    { bg: 'rgba(57, 255, 20, 0.1)', border: 'rgba(57, 255, 20, 0.35)', color: '#86efac' },
    { bg: 'rgba(255, 204, 0, 0.12)', border: 'rgba(255, 204, 0, 0.42)', color: '#fde047' },
    { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.4)', color: '#c4b5fd' },
    { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.4)', color: '#93c5fd' },
  ];

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

  function normalizeSlug(value) {
    return String(value ?? '')
      .toLowerCase()
      .trim();
  }

  function resolveCategoryName(slugOrCategory) {
    var slug = normalizeSlug(slugOrCategory);
    if (!slug) return '—';
    return categoryMap[slug] || slug;
  }

  function resolveRowCategoryName(row) {
    if (!row) return '—';
    var slug = normalizeSlug(row.category_slug || row.category || '');
    if (!slug) return '—';
    return categoryMap[slug] || slug;
  }

  function hashSlug(slug) {
    var h = 0;
    for (var i = 0; i < slug.length; i++) {
      h = (h * 31 + slug.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  function getCategoryBadgeStyle(slug) {
    var key = normalizeSlug(slug);
    var c = key
      ? BADGE_COLOR_PALETTE[hashSlug(key) % BADGE_COLOR_PALETTE.length]
      : null;
    if (!c) {
      c = { bg: '#27272a', border: '#3f3f46', color: '#e4e4e7' };
    }
    return (
      'background-color:' +
      c.bg +
      ';border:1px solid ' +
      c.border +
      ';color:' +
      c.color +
      ';'
    );
  }

  /** row.category_slug / row.category → slug + categoryMap 한글명 */
  function resolveCategoryDisplay(row) {
    var slug = normalizeSlug(row && (row.category_slug || row.category));
    if (row) {
      row.category_slug = slug;
    }
    return {
      slug: slug,
      label: slug ? categoryMap[slug] || slug : '—',
    };
  }

  function categoryBadgeHtml(slug, label) {
    var display = label != null && label !== '' ? label : slug ? categoryMap[slug] || slug : '—';
    return (
      '<span class="cat-badge category-badge" style="' +
      getCategoryBadgeStyle(slug) +
      '">' +
      escapeHtml(display) +
      '</span>'
    );
  }

  function postInfoHtml(slug, label, title) {
    return (
      '<div class="post-info">' +
      categoryBadgeHtml(slug, label) +
      '<span class="post-title">' +
      escapeHtml(title || '—') +
      '</span>' +
      '</div>'
    );
  }

  async function loadCategories() {
    categoryMap = {};
    categoriesReady = false;
    try {
      var sb = getSupabaseClient();
      var res = await sb
        .from('categories')
        .select('slug, name')
        .order('sort_order', { ascending: true });
      if (res.error) {
        console.warn('[Admin Users] categories load error', res.error);
      } else {
        (res.data || []).forEach(function (row) {
          if (!row || !row.slug) return;
          var slug = normalizeSlug(row.slug);
          categoryMap[slug] = String(row.name || '').trim() || slug;
        });
      }
    } catch (err) {
      console.warn('[Admin Users] categories load failed', err);
    }
    categoriesReady = true;
  }

  async function ensureCategoriesReady() {
    if (categoriesReady) return;
    await loadCategories();
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
    var fullId = user && user.id ? String(user.id) : '—';
    var email = formatUserEmail(user);
    if (!email || email === '이메일 미등록') {
      return 'UID: ' + fullId;
    }
    return 'UID: ' + fullId + ' | ' + email;
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  function showUidCopyToast(anchorEl) {
    if (!anchorEl) return;
    var prev = anchorEl.querySelector('.uid-copy-toast');
    if (prev) prev.remove();
    var toast = document.createElement('span');
    toast.className = 'uid-copy-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = '복사되었습니다';
    anchorEl.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.remove();
    }, 1800);
  }

  function bindModalUidCopy(user) {
    var el = $('modalUid');
    if (!el) return;
    var uid = user && user.id ? String(user.id) : '';
    el.classList.toggle('is-copyable', !!uid);
    el.title = uid ? '클릭하여 UID 복사' : '';
    el.onclick = uid
      ? function () {
          copyTextToClipboard(uid)
            .then(function () {
              showUidCopyToast(el);
            })
            .catch(function () {
              alert('복사에 실패했습니다.');
            });
        }
      : null;
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

  function getUserAvatarUrl(user) {
    if (!user || !user.avatar_url) return '';
    return String(user.avatar_url).trim();
  }

  function getDefaultAvatarEmoji(user) {
    var html = user && user.avatar_html ? String(user.avatar_html).trim() : '';
    if (!html) return '👤';
    if (html.indexOf('<') === 0) {
      var text = html.replace(/<[^>]+>/g, '').trim();
      return text || '👤';
    }
    return html;
  }

  function buildListAvatarHtml(user) {
    var avatarUrl = getUserAvatarUrl(user);
    if (avatarUrl) {
      return (
        '<img src="' +
        escapeHtml(avatarUrl) +
        '" alt="" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">'
      );
    }
    return escapeHtml(getDefaultAvatarEmoji(user));
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
        var avatarHtml = buildListAvatarHtml(user);
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
          avatarHtml +
          '</div>' +
          '<div class="user-info">' +
          '<span class="user-nickname">' +
          escapeHtml(user.nickname || '픽클러') +
          '</span>' +
          '<div style="font-size: 0.8rem; color: var(--text-sub); margin-top: 2px;">' +
          escapeHtml(formatUserEmail(user)) +
          '</div>' +
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

  function formatDateTime(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function emptyStateHtml() {
    return (
      '<div class="empty-state" style="text-align: center; color: var(--text-sub); padding: 20px;">내역이 없습니다.</div>'
    );
  }

  function loadingHistoryHtml() {
    return (
      '<div class="empty-state" style="text-align: center; color: var(--text-sub); padding: 20px;">불러오는 중…</div>'
    );
  }

  function formatListDateTime(value) {
    if (!value) return '—';
    if (typeof value === 'string' && /^\d{4}\.\d{2}\.\d{2}/.test(value)) return value;
    return formatDateTime(value);
  }

  function liBtnHtml(label, href) {
    if (href) {
      return (
        '<a class="li-btn" href="' +
        escapeHtml(href) +
        '" target="_blank" rel="noopener">' +
        escapeHtml(label) +
        '</a>'
      );
    }
    return '<button type="button" class="li-btn">' + escapeHtml(label) + '</button>';
  }

  function formatAmountLabel(amount) {
    var amt = Number(amount) || 0;
    if (amt > 0) return '+' + amt.toLocaleString() + ' P';
    if (amt < 0) return amt.toLocaleString() + ' P';
    return '0 P';
  }

  function formatVoteResult(row) {
    if (row.vote_result) return String(row.vote_result);
    var choice = row.choice ? String(row.choice).toUpperCase() : '';
    if (row.choice_label) return choice + ': ' + row.choice_label;
    if (choice === 'A' && row.option_a_name) return 'A: ' + row.option_a_name;
    if (choice === 'B' && row.option_b_name) return 'B: ' + row.option_b_name;
    if (choice) return choice + ' 선택';
    return '—';
  }

  function postDetailHref(postId) {
    if (!postId) return '';
    return '../user_app/detail.html?id=' + encodeURIComponent(String(postId));
  }

  function formatSanctionReason(row) {
    if (row.reason_detail) return String(row.reason_detail);
    var base = row.reason ? String(row.reason) : '사유 미기록';
    if (row.kind === 'report' && row.status) {
      return base + ' (신고 · ' + row.status + ')';
    }
    if (row.context_label && row.context_content) {
      return base + ' (' + row.context_label + ': "' + row.context_content + '")';
    }
    if (row.source_type) {
      return base + ' (' + row.source_type + ')';
    }
    if (row.context_content) {
      return base + ' (' + row.context_content + ')';
    }
    return base;
  }

  function formatPointSource(row) {
    if (row.source_detail) return String(row.source_detail);
    if (row.reason_detail) return String(row.reason_detail);
    return row.reason ? String(row.reason) : '포인트 변동';
  }

  function penaltyPointsHtml(row) {
    var pts = Number(row.penalty_points) || 0;
    if (pts < 0) {
      return (
        '<span class="li-col li-penalty penalty-sub">' +
        escapeHtml(String(pts) + '점') +
        '</span>'
      );
    }
    return (
      '<span class="li-col li-penalty penalty-add">+' +
      escapeHtml(String(Math.abs(pts)) + '점') +
      '</span>'
    );
  }

  function pointAmountHtml(amount) {
    var amt = Number(amount) || 0;
    var cls = amt > 0 ? 'amount-gain' : amt < 0 ? 'amount-spend' : 'neutral';
    return (
      '<span class="li-col li-amount ' +
      cls +
      '">' +
      escapeHtml(formatAmountLabel(amt)) +
      '</span>'
    );
  }

  function renderPostsList(rows) {
    if (!rows.length) return emptyStateHtml();
    return rows
      .map(function (row) {
        var href = postDetailHref(row.id || row.post_id);
        var cat = resolveCategoryDisplay(row);
        return (
          '<div class="list-item list-item--activity list-item--posts">' +
          postInfoHtml(cat.slug, cat.label, row.title || '제목 없음') +
          '<span class="li-col li-col-date">' +
          escapeHtml(formatListDateTime(row.created_at)) +
          '</span>' +
          liBtnHtml('보기', href) +
          '</div>'
        );
      })
      .join('');
  }

  function renderVotesList(rows) {
    if (!rows.length) return emptyStateHtml();
    return rows
      .map(function (row) {
        var cat = resolveCategoryDisplay(row);
        return (
          '<div class="list-item list-item--activity list-item--votes">' +
          postInfoHtml(cat.slug, cat.label, row.post_title || '불판') +
          '<span class="li-col li-col-vote">' +
          escapeHtml(formatVoteResult(row)) +
          '</span>' +
          '<span class="li-col li-col-date">' +
          escapeHtml(formatListDateTime(row.created_at)) +
          '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  function renderCommentsList(rows) {
    if (!rows.length) return emptyStateHtml();
    return rows
      .map(function (row) {
        var href = postDetailHref(row.post_id);
        var cat = resolveCategoryDisplay(row);
        return (
          '<div class="list-item list-item--activity list-item--comments">' +
          postInfoHtml(cat.slug, cat.label, row.post_title || '불판') +
          '<span class="li-col li-col-grow comment-content">' +
          escapeHtml(row.content || '') +
          '</span>' +
          '<span class="li-col li-col-date">' +
          escapeHtml(formatListDateTime(row.created_at)) +
          '</span>' +
          liBtnHtml('보기', href) +
          '</div>'
        );
      })
      .join('');
  }

  function renderPointsList(rows) {
    if (!rows.length) return emptyStateHtml();
    return rows
      .map(function (row) {
        return (
          '<div class="list-item">' +
          pointAmountHtml(row.amount) +
          '<span class="li-col li-col-reason">' +
          escapeHtml(formatPointSource(row)) +
          '</span>' +
          '<span class="li-col li-col-date">' +
          escapeHtml(formatListDateTime(row.created_at)) +
          '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  function renderSanctionsList(rows) {
    if (!rows.length) return emptyStateHtml();
    return rows
      .map(function (row) {
        return (
          '<div class="list-item">' +
          penaltyPointsHtml(row) +
          '<span class="li-col li-col-reason">' +
          escapeHtml(formatSanctionReason(row)) +
          '</span>' +
          '<span class="li-col li-col-date">' +
          escapeHtml(formatListDateTime(row.created_at)) +
          '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  function renderModalTabContent(tab, rows) {
    if (tab === 'posts') return renderPostsList(rows);
    if (tab === 'votes') return renderVotesList(rows);
    if (tab === 'comments') return renderCommentsList(rows);
    if (tab === 'points') return renderPointsList(rows);
    if (tab === 'sanctions') return renderSanctionsList(rows);
    return emptyStateHtml();
  }

  function formatTabCountLabel(key, value) {
    var n = Number(value) || 0;
    if (key === 'points') {
      return '(' + n.toLocaleString() + ' P)';
    }
    return '(' + n.toLocaleString() + ')';
  }

  function updateModalTabLabels() {
    document.querySelectorAll('#modalTabs .m-tab-count').forEach(function (el) {
      var key = el.getAttribute('data-count-key');
      if (!key) return;
      if (key === 'points') {
        el.textContent = formatTabCountLabel('points', modalTabTotals.points_balance);
        return;
      }
      el.textContent = formatTabCountLabel(key, modalTabTotals[key]);
    });
  }

  async function countUserRows(sb, table, column, userId) {
    var result = await sb
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(column, userId);
    if (result.error) throw result.error;
    return result.count || 0;
  }

  async function loadModalTabCounts(userId, user) {
    var sb = getSupabaseClient();
    var rpc = await sb.rpc('admin_user_tab_counts', { p_user_id: userId });
    if (!rpc.error && rpc.data) {
      modalTabTotals.posts = Number(rpc.data.posts) || 0;
      modalTabTotals.votes = Number(rpc.data.votes) || 0;
      modalTabTotals.comments = Number(rpc.data.comments) || 0;
      modalTabTotals.points_balance = Number(rpc.data.points_balance) || 0;
      modalTabTotals.sanctions = Number(rpc.data.sanctions) || 0;
      modalTabTotals.points = Number(rpc.data.point_logs) || 0;
      updateModalTabLabels();
      return;
    }

    modalTabTotals.points_balance = Number(user && user.points != null ? user.points : 0) || 0;
    try {
      modalTabTotals.posts = await countUserRows(sb, 'posts', 'author_id', userId);
    } catch (e1) {
      modalTabTotals.posts = 0;
    }
    try {
      modalTabTotals.votes = await countUserRows(sb, 'votes', 'user_id', userId);
    } catch (e2) {
      modalTabTotals.votes = 0;
    }
    try {
      modalTabTotals.comments = await countUserRows(sb, 'comments', 'user_id', userId);
    } catch (e3) {
      modalTabTotals.comments = 0;
    }
    try {
      modalTabTotals.points = await countUserRows(sb, 'point_logs', 'user_id', userId);
    } catch (e4) {
      modalTabTotals.points = 0;
    }
    try {
      var pen = await countUserRows(sb, 'user_penalties', 'user_id', userId);
      var rep = await countUserRows(sb, 'reports', 'reported_user_id', userId);
      modalTabTotals.sanctions = pen + rep;
    } catch (e5) {
      modalTabTotals.sanctions = 0;
    }
    updateModalTabLabels();
  }

  async function fetchModalTabPageRange(sb, userId, tab, from, to) {
    if (tab === 'posts') {
      var postRes = await sb
        .from('posts')
        .select('id, title, category, option_a_name, option_b_name, visibility_status, created_at', {
          count: 'exact',
        })
        .eq('author_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (postRes.error) throw postRes.error;
      var postItems = (postRes.data || []).map(function (row) {
        var slug = normalizeSlug(row.category || '');
        return {
          id: row.id,
          title:
            row.title ||
            String(row.option_a_name || '') + ' vs ' + String(row.option_b_name || ''),
          category: slug,
          category_slug: slug,
          visibility_status: row.visibility_status,
          created_at: row.created_at,
        };
      });
      return { items: postItems, total: postRes.count || 0 };
    }

    if (tab === 'votes') {
      var voteRes = await sb
        .from('votes')
        .select(
          'id, choice, post_id, created_at, posts:post_id(category, title, option_a_name, option_b_name)',
          { count: 'exact' }
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (voteRes.error) throw voteRes.error;
      var voteItems = (voteRes.data || []).map(function (row) {
        var post = row.posts || {};
        var slug = normalizeSlug(post.category || '');
        return {
          id: row.id,
          choice: row.choice,
          post_id: row.post_id,
          category: slug,
          category_slug: slug,
          post_title:
            post.title ||
            String(post.option_a_name || '') + ' vs ' + String(post.option_b_name || '') ||
            (row.post_id ? '불판 #' + String(row.post_id).slice(0, 8) : '불판'),
          option_a_name: post.option_a_name,
          option_b_name: post.option_b_name,
          created_at: row.created_at,
        };
      });
      return { items: voteItems, total: voteRes.count || 0 };
    }

    if (tab === 'comments') {
      var cRes = await sb
        .from('comments')
        .select(
          'id, content, filtered_content, post_id, created_at, posts:post_id(category, title, option_a_name, option_b_name)',
          { count: 'exact' }
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (cRes.error) throw cRes.error;
      var cItems = (cRes.data || []).map(function (row) {
        var post = row.posts || {};
        var slug = normalizeSlug(post.category || '');
        return {
          id: row.id,
          content: row.filtered_content || row.content,
          post_id: row.post_id,
          category: slug,
          category_slug: slug,
          post_title:
            post.title ||
            String(post.option_a_name || '') + ' vs ' + String(post.option_b_name || '') ||
            (row.post_id ? '불판 #' + String(row.post_id).slice(0, 8) : '불판'),
          created_at: row.created_at,
        };
      });
      return { items: cItems, total: cRes.count || 0 };
    }

    if (tab === 'points') {
      var pRes = await sb
        .from('point_logs')
        .select('id, amount, reason, balance_after, created_at', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (pRes.error) throw pRes.error;
      return { items: pRes.data || [], total: pRes.count || 0 };
    }

    if (tab === 'sanctions') {
      var rpc = await sb.rpc('admin_user_modal_tab_page', {
        p_user_id: userId,
        p_tab: 'sanctions',
        p_offset: from,
        p_limit: to - from + 1,
      });
      if (!rpc.error && rpc.data) {
        return {
          items: rpc.data.items || [],
          total: Number(rpc.data.total) || 0,
        };
      }
      return { items: [], total: 0 };
    }

    return { items: [], total: 0 };
  }

  async function loadUserPosts(userId, page) {
    return fetchModalTabPage(userId, 'posts', page || 1);
  }

  async function loadUserVotes(userId, page) {
    return fetchModalTabPage(userId, 'votes', page || 1);
  }

  async function loadUserComments(userId, page) {
    return fetchModalTabPage(userId, 'comments', page || 1);
  }

  async function loadUserPoints(userId, page) {
    return fetchModalTabPage(userId, 'points', page || 1);
  }

  async function loadUserSanctions(userId, page) {
    return fetchModalTabPage(userId, 'sanctions', page || 1);
  }

  async function fetchModalTabPage(userId, tab, page) {
    var sb = getSupabaseClient();
    var from = (page - 1) * MODAL_PAGE_SIZE;
    var to = from + MODAL_PAGE_SIZE - 1;

    var rpc = await sb.rpc('admin_user_modal_tab_page', {
      p_user_id: userId,
      p_tab: tab,
      p_offset: from,
      p_limit: MODAL_PAGE_SIZE,
    });
    if (!rpc.error && rpc.data) {
      return {
        items: Array.isArray(rpc.data.items) ? rpc.data.items : [],
        total: Number(rpc.data.total) || 0,
      };
    }
    if (rpc.error) {
      console.warn('[Admin Users] admin_user_modal_tab_page fallback', rpc.error);
    }
    return fetchModalTabPageRange(sb, userId, tab, from, to);
  }

  function renderModalPagination(total, page, tab) {
    var wrap = $('modalPagination');
    if (!wrap) return;

    var totalPages = Math.max(1, Math.ceil(total / MODAL_PAGE_SIZE));
    if (page > totalPages) page = totalPages;
    modalCurrentPage = page;

    if (total <= 0) {
      wrap.innerHTML = '';
      return;
    }

    var html = '';
    html +=
      '<button type="button" class="page-btn page-nav-label" data-modal-page="prev"' +
      (page <= 1 ? ' disabled' : '') +
      '>&lt; 이전</button>';

    var maxButtons = 5;
    var start = Math.max(1, page - 2);
    var end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);

    for (var p = start; p <= end; p++) {
      html +=
        '<button type="button" class="page-btn' +
        (p === page ? ' active' : '') +
        '" data-modal-page="' +
        p +
        '">' +
        p +
        '</button>';
    }

    html +=
      '<button type="button" class="page-btn page-nav-label" data-modal-page="next"' +
      (page >= totalPages ? ' disabled' : '') +
      '>다음 &gt;</button>';

    wrap.innerHTML = html;

    wrap.querySelectorAll('[data-modal-page]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        var target = btn.getAttribute('data-modal-page');
        var totalPg = Math.max(1, Math.ceil(total / MODAL_PAGE_SIZE));
        var nextPage = modalCurrentPage;
        if (target === 'prev' && modalCurrentPage > 1) nextPage -= 1;
        else if (target === 'next' && modalCurrentPage < totalPg) nextPage += 1;
        else if (target !== 'prev' && target !== 'next') nextPage = parseInt(target, 10) || 1;
        if (nextPage === modalCurrentPage) return;
        loadModalTabPage(tab, nextPage);
      });
    });
  }

  async function loadModalTabPage(tab, page) {
    var listEl = $('modalHistoryList');
    if (!listEl || !modalCurrentUserId) return;

    modalActiveTab = tab || modalActiveTab;
    modalCurrentPage = page || 1;
    listEl.innerHTML = loadingHistoryHtml();
    $('modalPagination').innerHTML = '';

    try {
      var result = await fetchModalTabPage(modalCurrentUserId, modalActiveTab, modalCurrentPage);
      var items = result.items || [];
      var total = Number(result.total) || 0;

      if (modalActiveTab === 'posts') modalTabTotals.posts = total;
      else if (modalActiveTab === 'votes') modalTabTotals.votes = total;
      else if (modalActiveTab === 'comments') modalTabTotals.comments = total;
      else if (modalActiveTab === 'sanctions') modalTabTotals.sanctions = total;
      else if (modalActiveTab === 'points') modalTabTotals.points = total;
      updateModalTabLabels();

      listEl.innerHTML = renderModalTabContent(modalActiveTab, items);
      renderModalPagination(total, modalCurrentPage, modalActiveTab);
    } catch (err) {
      console.error('[Admin Users] modal tab page load failed', modalActiveTab, err);
      listEl.innerHTML = emptyStateHtml();
      $('modalPagination').innerHTML = '';
    }
  }

  function switchModalTab(tab) {
    modalActiveTab = tab || 'posts';
    modalCurrentPage = 1;
    document.querySelectorAll('#modalTabs .m-tab').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-tab') === modalActiveTab);
    });
    loadModalTabPage(modalActiveTab, 1);
  }

  function bindModalTabs() {
    var tabsWrap = $('modalTabs');
    if (!tabsWrap || tabsWrap.dataset.bound === '1') return;
    tabsWrap.dataset.bound = '1';

    tabsWrap.addEventListener('click', function (e) {
      var tabEl = e.target.closest('.m-tab[data-tab]');
      if (!tabEl) return;
      var tab = tabEl.getAttribute('data-tab');
      if (!tab || tab === modalActiveTab) return;
      switchModalTab(tab);
    });

    tabsWrap.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var tabEl = e.target.closest('.m-tab[data-tab]');
      if (!tabEl) return;
      e.preventDefault();
      switchModalTab(tabEl.getAttribute('data-tab'));
    });
  }

  async function openUserModal(userId) {
    await ensureCategoriesReady();

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
    bindModalUidCopy(user);
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

    modal.style.display = 'flex';
    modalCurrentUserId = user.id;
    modalActiveTab = 'posts';
    modalCurrentPage = 1;
    modalTabTotals = {
      posts: 0,
      votes: 0,
      comments: 0,
      points: 0,
      sanctions: 0,
      points_balance: Number(user.points || 0) || 0,
    };
    document.querySelectorAll('#modalTabs .m-tab-count').forEach(function (el) {
      el.textContent = '(…)';
    });
    document.querySelectorAll('#modalTabs .m-tab').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-tab') === 'posts');
    });
    $('modalHistoryList').innerHTML = loadingHistoryHtml();
    $('modalPagination').innerHTML = '';
    loadModalTabCounts(user.id, user);
    loadModalTabPage('posts', 1);
  }

  function closeUserModal() {
    var modal = $('userModal');
    if (modal) modal.style.display = 'none';
    modalCurrentUserId = null;
    modalCurrentPage = 1;
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
      'id, nickname, email, signup_platform, points, penalty_points, account_status, gender, age_group, region, marketing_agreed, marketing_consent, is_info_collected, avatar_html, avatar_url, created_at';
    var selectBase =
      'id, nickname, signup_platform, points, penalty_points, account_status, gender, age_group, region, marketing_agreed, marketing_consent, is_info_collected, avatar_html, avatar_url, created_at';

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

  async function bootstrap() {
    bindFilters();
    bindModalTabs();
    await loadCategories();
    loadUsers();
  }

  window.PickleAdminUsers = {
    loadUsers: loadUsers,
    applyFilters: applyFilters,
    openUserModal: openUserModal,
    closeUserModal: closeUserModal,
    loadCategories: loadCategories,
    loadUserPosts: loadUserPosts,
    loadUserVotes: loadUserVotes,
    loadUserComments: loadUserComments,
    loadUserPoints: loadUserPoints,
    loadUserSanctions: loadUserSanctions,
  };

  window.openUserModal = openUserModal;
  window.closeUserModal = closeUserModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
