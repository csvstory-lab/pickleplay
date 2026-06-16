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
  /** 더미 UI 미리보기 (기본 ON). 실데이터 사용 시 URL에 ?modalDummy=0 */
  var MODAL_DUMMY_PREVIEW = !/(?:^|[?&])modalDummy=0(?:&|$)/.test(
    typeof window !== 'undefined' && window.location ? window.location.search : ''
  );

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

  function truncateText(value, maxLen) {
    var text = value != null ? String(value) : '';
    if (!text) return '—';
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '…';
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

  function amountClass(amount) {
    var amt = Number(amount) || 0;
    if (amt > 0) return 'positive';
    if (amt < 0) return 'negative';
    return 'neutral';
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

  var MODAL_DUMMY_BY_TAB = {
    posts: [
      { id: 'dummy-post-1', title: '오늘 날씨에 옷 뭐입을까', created_at: '2026-06-14T18:33:00' },
      { id: 'dummy-post-2', title: '점심 메뉴 추천 받습니다', created_at: '2026-06-13T12:10:00' },
      { id: 'dummy-post-3', title: '주말 국내 여행 vs 해외 여행', created_at: '2026-06-12T09:45:00' },
      { id: 'dummy-post-4', title: '재택근무 vs 출근', created_at: '2026-06-11T20:02:00' },
      { id: 'dummy-post-5', title: '아이폰 vs 갤럭시', created_at: '2026-06-10T16:28:00' },
      { id: 'dummy-post-6', title: '커피 브랜드 고르기', created_at: '2026-06-09T11:05:00' },
      { id: 'dummy-post-7', title: '운동 루틴 공유', created_at: '2026-06-08T07:40:00' },
      { id: 'dummy-post-8', title: 'Netflix vs Watcha', created_at: '2026-06-07T22:15:00' },
      { id: 'dummy-post-9', title: '반려동물 키울까 말까', created_at: '2026-06-06T14:50:00' },
      { id: 'dummy-post-10', title: '이직 타이밍 상담', created_at: '2026-06-05T19:33:00' },
      { id: 'dummy-post-11', title: 'MBTI 믿을 만한가', created_at: '2026-06-04T10:20:00' },
      { id: 'dummy-post-12', title: '새벽형 vs 올빼미형', created_at: '2026-06-03T08:00:00' },
    ],
    votes: [
      {
        category_name: '음식',
        post_title: '평생 라면 한종류만 먹어야 한다면',
        vote_result: 'A: 신라면',
        created_at: '2026-06-14T15:20:00',
      },
      {
        category_name: '직장',
        post_title: '야근 식대 만원 vs 퇴근',
        vote_result: 'B: 퇴근',
        created_at: '2026-06-13T21:10:00',
      },
      {
        category_name: '연애',
        post_title: '첫 데이트 카페 vs 식당',
        vote_result: 'A: 카페',
        created_at: '2026-06-12T18:40:00',
      },
      {
        category_name: '음식',
        post_title: '피자 vs 치킨',
        vote_result: 'A: 피자',
        created_at: '2026-06-11T12:30:00',
      },
      {
        category_name: '취미',
        post_title: '게임 vs 독서',
        vote_result: 'B: 독서',
        created_at: '2026-06-10T23:05:00',
      },
      {
        category_name: '생활',
        post_title: '빨래 바로 vs 모아서',
        vote_result: 'A: 바로',
        created_at: '2026-06-09T16:18:00',
      },
      {
        category_name: '음식',
        post_title: '빙수 vs 아이스크림',
        vote_result: 'B: 아이스크림',
        created_at: '2026-06-08T14:22:00',
      },
      {
        category_name: '직장',
        post_title: '회의 줄이기',
        vote_result: 'A: 15분 제한',
        created_at: '2026-06-07T11:00:00',
      },
      {
        category_name: '여행',
        post_title: '계획형 vs 즉흥형',
        vote_result: 'B: 즉흥형',
        created_at: '2026-06-06T09:35:00',
      },
      {
        category_name: '음식',
        post_title: '매운 것 vs 순한 것',
        vote_result: 'A: 매운 것',
        created_at: '2026-06-05T19:50:00',
      },
      {
        category_name: '취미',
        post_title: '넷플릭스 vs 유튜브',
        vote_result: 'B: 유튜브',
        created_at: '2026-06-04T22:12:00',
      },
      {
        category_name: '생활',
        post_title: '아침형 vs 저녁형',
        vote_result: 'A: 아침형',
        created_at: '2026-06-03T07:55:00',
      },
    ],
    comments: [
      {
        category_name: '직장',
        post_title: '야근 식대 만원 vs...',
        content: '만원으로 요즘 먹을게 있나요?',
        post_id: 'dummy-post-c1',
        created_at: '2026-06-14T10:11:00',
      },
      {
        category_name: '음식',
        post_title: '평생 라면 한종류만...',
        content: '저는 진라면 순한맛 파입니다',
        post_id: 'dummy-post-c2',
        created_at: '2026-06-13T19:40:00',
      },
      {
        category_name: '연애',
        post_title: '연락 빈도',
        content: '하루에 한 번은 너무 많은 것 같아요',
        post_id: 'dummy-post-c3',
        created_at: '2026-06-12T13:25:00',
      },
      {
        category_name: '취미',
        post_title: '주말 뭐하세요',
        content: '집에서 쉬는 게 최고',
        post_id: 'dummy-post-c4',
        created_at: '2026-06-11T16:08:00',
      },
      {
        category_name: '직장',
        post_title: '재택 vs 출근',
        content: '협업 많으면 출근이 나은 듯',
        post_id: 'dummy-post-c5',
        created_at: '2026-06-10T11:44:00',
      },
      {
        category_name: '생활',
        post_title: '아침 루틴',
        content: '물 한 잔부터 시작합니다',
        post_id: 'dummy-post-c6',
        created_at: '2026-06-09T08:30:00',
      },
      {
        category_name: '음식',
        post_title: '치킨 브랜드',
        content: 'BBQ 마법사가 최고',
        post_id: 'dummy-post-c7',
        created_at: '2026-06-08T21:15:00',
      },
      {
        category_name: '여행',
        post_title: '국내 1박2일',
        content: '강릉 추천합니다',
        post_id: 'dummy-post-c8',
        created_at: '2026-06-07T15:02:00',
      },
      {
        category_name: '직장',
        post_title: '점심시간',
        content: '1시간은 꼭 필요해요',
        post_id: 'dummy-post-c9',
        created_at: '2026-06-06T12:33:00',
      },
      {
        category_name: '취미',
        post_title: '운동 종목',
        content: '헬스 vs 러닝 고민 중',
        post_id: 'dummy-post-c10',
        created_at: '2026-06-05T18:20:00',
      },
      {
        category_name: '생활',
        post_title: '정리정돈',
        content: '미니멀리즘 도전 중',
        post_id: 'dummy-post-c11',
        created_at: '2026-06-04T10:05:00',
      },
      {
        category_name: '음식',
        post_title: '배달 vs 직접',
        content: '요즘 배달비가 부담',
        post_id: 'dummy-post-c12',
        created_at: '2026-06-03T20:48:00',
      },
    ],
    points: [
      { amount: 50, reason: '투표 참여 보상', created_at: '2026-06-14T09:00:00' },
      { amount: -100, reason: '포인트 상품 교환', created_at: '2026-06-13T17:30:00' },
      { amount: 30, reason: '댓글 작성 보상', created_at: '2026-06-12T14:15:00' },
      { amount: 100, reason: '불판 생성 보상', created_at: '2026-06-11T11:00:00' },
      { amount: -50, reason: '관리자 차감', created_at: '2026-06-10T09:40:00' },
      { amount: 20, reason: '출석 체크', created_at: '2026-06-09T08:05:00' },
      { amount: 50, reason: '투표 참여 보상', created_at: '2026-06-08T19:22:00' },
      { amount: -30, reason: '이벤트 참여', created_at: '2026-06-07T16:10:00' },
      { amount: 10, reason: '프로필 완성', created_at: '2026-06-06T13:00:00' },
      { amount: 50, reason: '투표 참여 보상', created_at: '2026-06-05T21:45:00' },
      { amount: -200, reason: '포인트 상품 교환', created_at: '2026-06-04T12:20:00' },
      { amount: 30, reason: '댓글 작성 보상', created_at: '2026-06-03T10:33:00' },
    ],
    sanctions: [
      { penalty_points: 30, reason: '타인 비방 및 욕설', created_at: '2026-05-28T14:30:00' },
      { penalty_points: 10, reason: '스팸성 댓글 반복', created_at: '2026-05-20T11:15:00' },
      { penalty_points: 50, reason: '허위 신고 누적', created_at: '2026-05-12T09:00:00' },
      { penalty_points: 20, reason: '불쾌한 표현 사용', created_at: '2026-05-05T18:40:00' },
      { penalty_points: 30, reason: '타인 비방 및 욕설', created_at: '2026-04-28T14:30:00' },
      { penalty_points: 10, reason: '광고성 게시물', created_at: '2026-04-15T10:05:00' },
      { penalty_points: 50, reason: '커뮤니티 가이드 위반', created_at: '2026-04-01T16:22:00' },
      { penalty_points: 20, reason: '분란 조장', created_at: '2026-03-22T13:18:00' },
      { penalty_points: 30, reason: '욕설 및 비하', created_at: '2026-03-10T08:50:00' },
      { penalty_points: 10, reason: '도배 행위', created_at: '2026-02-28T20:11:00' },
      { penalty_points: 50, reason: '반복 신고 대상', created_at: '2026-02-14T15:33:00' },
      { penalty_points: 20, reason: '부적절한 닉네임', created_at: '2026-02-01T12:00:00' },
    ],
  };

  function getModalDummyPage(tab, page) {
    var all = MODAL_DUMMY_BY_TAB[tab] || [];
    var from = (page - 1) * MODAL_PAGE_SIZE;
    return {
      items: all.slice(from, from + MODAL_PAGE_SIZE),
      total: all.length,
    };
  }

  function applyModalDummyCounts() {
    modalTabTotals.posts = MODAL_DUMMY_BY_TAB.posts.length;
    modalTabTotals.votes = MODAL_DUMMY_BY_TAB.votes.length;
    modalTabTotals.comments = MODAL_DUMMY_BY_TAB.comments.length;
    modalTabTotals.points = MODAL_DUMMY_BY_TAB.points.length;
    modalTabTotals.sanctions = MODAL_DUMMY_BY_TAB.sanctions.length;
    modalTabTotals.points_balance = 1250;
    updateModalTabLabels();
  }

  function renderPostsList(rows) {
    if (!rows.length) return emptyStateHtml();
    return rows
      .map(function (row) {
        var href = postDetailHref(row.id || row.post_id);
        return (
          '<div class="list-item">' +
          '<span class="li-col li-col-grow">' +
          escapeHtml(row.title || '제목 없음') +
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

  function renderVotesList(rows) {
    if (!rows.length) return emptyStateHtml();
    return rows
      .map(function (row) {
        return (
          '<div class="list-item">' +
          '<span class="li-col li-col-cat">' +
          escapeHtml(row.category_name || '—') +
          '</span>' +
          '<span class="li-col li-col-title">' +
          escapeHtml(row.post_title || '불판') +
          '</span>' +
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
        return (
          '<div class="list-item">' +
          '<span class="li-col li-col-cat">' +
          escapeHtml(row.category_name || '—') +
          '</span>' +
          '<span class="li-col li-col-title">' +
          escapeHtml(truncateText(row.post_title || '불판', 18)) +
          '</span>' +
          '<span class="li-col li-col-grow">' +
          escapeHtml(truncateText(row.content, 28)) +
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
          '<span class="li-col li-amount ' +
          amountClass(row.amount) +
          '">' +
          escapeHtml(formatAmountLabel(row.amount)) +
          '</span>' +
          '<span class="li-col li-col-reason">' +
          escapeHtml(row.reason || '포인트 변동') +
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
        var pts = Number(row.penalty_points) || 0;
        return (
          '<div class="list-item">' +
          '<span class="li-col li-penalty">+' +
          escapeHtml(String(pts)) +
          '점</span>' +
          '<span class="li-col li-col-reason">' +
          escapeHtml(row.reason || '사유 미기록') +
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
    if (MODAL_DUMMY_PREVIEW) {
      applyModalDummyCounts();
      return;
    }

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
        .select('id, title, option_a_name, option_b_name, visibility_status, created_at', {
          count: 'exact',
        })
        .eq('author_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (postRes.error) throw postRes.error;
      var postItems = (postRes.data || []).map(function (row) {
        return {
          id: row.id,
          title:
            row.title ||
            String(row.option_a_name || '') + ' vs ' + String(row.option_b_name || ''),
          visibility_status: row.visibility_status,
          created_at: row.created_at,
        };
      });
      return { items: postItems, total: postRes.count || 0 };
    }

    if (tab === 'votes') {
      var voteRes = await sb
        .from('votes')
        .select('id, choice, post_id, created_at', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (voteRes.error) throw voteRes.error;
      return { items: voteRes.data || [], total: voteRes.count || 0 };
    }

    if (tab === 'comments') {
      var cRes = await sb
        .from('comments')
        .select('id, content, filtered_content, post_id, created_at', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (cRes.error) throw cRes.error;
      var cItems = (cRes.data || []).map(function (row) {
        return {
          id: row.id,
          content: row.filtered_content || row.content,
          post_id: row.post_id,
          post_title: row.post_id ? '불판 #' + String(row.post_id).slice(0, 8) : '불판',
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
      var result;
      if (MODAL_DUMMY_PREVIEW) {
        result = getModalDummyPage(modalActiveTab, modalCurrentPage);
      } else {
        result = await fetchModalTabPage(modalCurrentUserId, modalActiveTab, modalCurrentPage);
      }
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

  function bootstrap() {
    bindFilters();
    bindModalTabs();
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
