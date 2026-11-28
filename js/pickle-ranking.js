/**
 * P!CKLE — ranking.html 랭킹 DB 연동
 * @build 20261128_ranking154
 * 일간/주간/월간/연간 모두 서버 함수로 "그 기간 안의 활동"만 합산해 실시간 계산
 *   - pickle_ranking_hot_grills(period, category, limit)  : 핫 불판 (카테고리 필터 + 가속도 가산점)
 *   - pickle_ranking_top_picklers(period, limit)          : 최고의 픽클러
 * (154 SQL 적용 전에는 예전 방식 hot_grill_ranking · top_pickler_ranking · ranking_period_results 로 자동 대체)
 */
(function () {
  'use strict';

  var LIMIT = 10;
  var EMPTY_MSG = '아직 랭킹 데이터가 없습니다.';
  var grillRows = [];
  var picklerRows = [];
  var postMetaMap = new Map();
  var userAvatarMap = new Map();
  var currentPeriod = 'daily';
  var currentCategory = 'all';
  var PERIOD_NOTE = {
    daily: '최근 24시간 동안의 활동 기준',
    weekly: '최근 7일 동안의 활동 기준',
    monthly: '최근 30일 동안의 활동 기준',
    yearly: '최근 1년 동안의 활동 기준',
  };

  var ICON = {
    fire: '<i class="ph-fill ph-fire score-icon" aria-hidden="true"></i>',
    star: '<i class="ph-fill ph-star score-icon" aria-hidden="true"></i>',
    user: '<i class="ph-fill ph-user" aria-hidden="true"></i>',
    flame: '<i class="ph-fill ph-flame" aria-hidden="true" style="font-size:1.35rem;color:var(--point-pink);"></i>',
  };

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getClient() {
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.getClient) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
  }

  function formatScore(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) n = 0;
    return Math.round(n).toLocaleString('ko-KR');
  }

  /** 핫 불판 점수 표시: 0점(활동 없음)은 NEW, 10점 미만은 소수 한 자리, 그 이상은 정수 */
  function formatGrillScore(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 'NEW';
    if (n < 10) return (Math.round(n * 10) / 10).toLocaleString('ko-KR', { minimumFractionDigits: 1 });
    return formatScore(n);
  }

  function scoreWithIcon(value, iconHtml) {
    return iconHtml + ' ' + formatScore(value);
  }

  function fallbackAvatarIcon(kind) {
    if (kind === 'fire') return ICON.flame;
    return ICON.user;
  }

  function normalizePicklerRow(row) {
    if (!row || !row.user_id) return null;
    var meta = userAvatarMap.get(String(row.user_id)) || {};
    var scoreRaw = row.star_score_total;
    if (scoreRaw == null && row.star_score != null) scoreRaw = row.star_score;
    var scoreNum = Number(scoreRaw);
    if (!Number.isFinite(scoreNum) || scoreNum < 0) scoreNum = 0;

    return {
      user_id: row.user_id,
      nickname:
        String(row.nickname || meta.nickname || '이름없음').trim() || '이름없음',
      star_score_total: scoreNum,
      follower_count: Number(row.follower_count) || 0,
      points: row.points,
    };
  }

  function postTitle(row, meta) {
    if (row && row.title && String(row.title).trim()) {
      return String(row.title).trim();
    }
    if (meta && meta.title && String(meta.title).trim()) {
      return String(meta.title).trim();
    }
    var a = meta && meta.option_a_name ? String(meta.option_a_name).trim() : '';
    var b = meta && meta.option_b_name ? String(meta.option_b_name).trim() : '';
    if (a || b) return (a || '?') + ' VS ' + (b || '?');
    return '제목 없음';
  }

  function postStatusLabel(meta) {
    if (!meta || !meta.expires_at) return '진행 중';
    var exp = new Date(meta.expires_at);
    if (Number.isNaN(exp.getTime())) return '진행 중';
    return exp.getTime() <= Date.now() ? '마감 완료' : '진행 중';
  }

  function authorLabel(meta) {
    var name =
      (meta && meta.author_nickname && String(meta.author_nickname).trim()) ||
      '이름없음';
    return '작성자: ' + name;
  }

  function buildLevelBadgeHtml(starScore) {
    var score = Number(starScore);
    if (!Number.isFinite(score) || score < 0) score = 0;
    if (window.PickleProfile && window.PickleProfile.buildLevelBadgeFromPoints) {
      return window.PickleProfile.buildLevelBadgeFromPoints(score);
    }
    if (window.PickleProfile && window.PickleProfile.getUserLevelFromPoints) {
      var lv = window.PickleProfile.getUserLevelFromPoints(score);
      return (
        '<span style="font-size:0.7rem; background:#444; padding:2px 6px; border-radius:8px; margin-left:5px;">Lv.' +
        Math.floor(lv) +
        '</span>'
      );
    }
    return '';
  }

  function renderMediaInner(meta, fallbackEmoji) {
    if (meta && meta.thumbnail_url) {
      return (
        '<img src="' +
        escapeHtml(meta.thumbnail_url) +
        '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" loading="lazy" decoding="async">'
      );
    }
    if (meta && meta.author_avatar_html) {
      var av = String(meta.author_avatar_html).trim();
      if (av.indexOf('<') !== -1) return av;
      return escapeHtml(av);
    }
    return fallbackAvatarIcon(fallbackEmoji === 'fire' ? 'fire' : 'user');
  }

  function renderUserAvatarInner(userId, nickname, fallbackEmoji) {
    var meta = userAvatarMap.get(String(userId)) || {};
    if (meta.avatar_url) {
      return (
        '<img src="' +
        escapeHtml(String(meta.avatar_url).trim()) +
        '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" loading="lazy" decoding="async">'
      );
    }
    if (meta.avatar_html) {
      var html = String(meta.avatar_html).trim();
      if (html.indexOf('<') !== -1) return html;
      return escapeHtml(html);
    }
    var nick = String(nickname || '').trim();
    if (nick) return escapeHtml(nick.charAt(0));
    return fallbackAvatarIcon(fallbackEmoji === 'fire' ? 'fire' : 'user');
  }

  function openUserProfile(userId, nickname, avatarHtml) {
    if (!userId) return;
    if (typeof window.openUserProfileModal === 'function') {
      window.openUserProfileModal(userId, {
        nickname: nickname,
        avatarHtml: avatarHtml,
      });
      return;
    }
    if (window.PickleFollows && typeof window.PickleFollows.openUserProfileModal === 'function') {
      window.PickleFollows.openUserProfileModal(userId, {
        nickname: nickname,
        avatarHtml: avatarHtml,
      });
    }
  }

  function goDetail(postId) {
    if (!postId) return;
    window.location.href = 'detail.html?id=' + encodeURIComponent(String(postId));
  }

  function bindRankingGuideModal() {
    var overlay = document.getElementById('rankingGuideOverlay');
    var openBtn = document.getElementById('rankingGuideBtn');
    if (!overlay || !openBtn || overlay.dataset.guideBound === '1') return;
    overlay.dataset.guideBound = '1';

    var closeBtn = overlay.querySelector('.ranking-guide-close');
    var dim = overlay.querySelector('.ranking-guide-dim');
    var sheet = overlay.querySelector('.ranking-guide-sheet');
    var closeTimer = null;

    function openGuide() {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      overlay.classList.add('is-visible');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('ranking-guide-open');
      requestAnimationFrame(function () {
        overlay.classList.add('is-open');
      });
    }

    function closeGuide() {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('ranking-guide-open');
      closeTimer = setTimeout(function () {
        overlay.classList.remove('is-visible');
        closeTimer = null;
      }, 320);
    }

    openBtn.addEventListener('click', function (e) {
      e.preventDefault();
      openGuide();
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        closeGuide();
      });
    }

    if (dim) {
      dim.addEventListener('click', function () {
        closeGuide();
      });
    }

    if (sheet) {
      sheet.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
        closeGuide();
      }
    });
  }

  async function fetchPostMetaMap(postIds) {
    postMetaMap = new Map();
    if (!postIds.length) return postMetaMap;

    var sb = getClient();
    var fieldSets = [
      'id, title, option_a_name, option_b_name, author_nickname, expires_at, thumbnail_url, author_avatar_html, is_sponsor',
      'id, title, option_a_name, option_b_name, author_nickname, expires_at, thumbnail_url, author_avatar_html',
      'id, title, option_a_name, option_b_name, author_nickname, expires_at, thumbnail_url, is_sponsor',
      'id, title, option_a_name, option_b_name, author_nickname, expires_at, thumbnail_url',
      'id, option_a_name, option_b_name, author_nickname, expires_at',
    ];

    for (var i = 0; i < fieldSets.length; i += 1) {
      var result = await sb.from('posts').select(fieldSets[i]).in('id', postIds);
      if (result.error) continue;
      (result.data || []).forEach(function (row) {
        if (row && row.id) postMetaMap.set(String(row.id), row);
      });
      if (postMetaMap.size) break;
    }

    return postMetaMap;
  }

  async function fetchUserAvatarMap(userIds) {
    userAvatarMap = new Map();
    if (!userIds.length) return userAvatarMap;

    var sb = getClient();
    var fieldSets = [
      'id, nickname, avatar_html, avatar_url',
      'id, nickname, avatar_html',
      'id, nickname',
    ];

    for (var i = 0; i < fieldSets.length; i += 1) {
      var result = await sb.from('user_public_profiles').select(fieldSets[i]).in('id', userIds);
      if (result.error) continue;
      (result.data || []).forEach(function (row) {
        if (row && row.id) userAvatarMap.set(String(row.id), row);
      });
      if (userAvatarMap.size) break;
    }

    return userAvatarMap;
  }

  /** 예전 방식(154 SQL 적용 전 대체용): 누적 점수 VIEW */
  async function fetchGrillRankingLegacy() {
    var sb = getClient();
    var query = sb
      .from('hot_grill_ranking')
      .select('*')
      .order('hot_grill_score', { ascending: false })
      .limit(LIMIT);
    if (currentCategory !== 'all') query = query.eq('category', currentCategory);
    var result = await query;

    if (result.error) throw result.error;

    var rows = result.data || [];
    var postIds = rows.map(function (r) {
      return r.post_id;
    });
    await fetchPostMetaMap(postIds);
    return rows;
  }

  async function fetchPicklerRankingLegacy() {
    var sb = getClient();
    var result = await sb
      .from('top_pickler_ranking')
      .select('*')
      .order('star_score_total', { ascending: false })
      .limit(LIMIT);

    if (result.error) throw result.error;

    var rows = result.data || [];
    var userIds = rows.map(function (r) {
      return r.user_id;
    });
    await fetchUserAvatarMap(userIds);
    return rows;
  }

  function isMissingRpc(error) {
    if (!error) return false;
    var code = String(error.code || '');
    var msg = String(error.message || '').toLowerCase();
    return (
      code === 'PGRST202' ||
      code === '42883' ||
      msg.indexOf('could not find the function') !== -1 ||
      msg.indexOf('does not exist') !== -1
    );
  }

  async function fetchGrillRanking() {
    var sb = getClient();
    var res = await sb.rpc('pickle_ranking_hot_grills', {
      p_period: currentPeriod,
      p_category: currentCategory === 'all' ? null : currentCategory,
      p_limit: LIMIT,
    });
    if (res.error) {
      if (isMissingRpc(res.error)) {
        return currentPeriod === 'daily'
          ? fetchGrillRankingLegacy()
          : fetchPeriodGrillRanking(currentPeriod);
      }
      throw res.error;
    }
    var rows = (res.data || []).map(function (r) {
      return {
        post_id: r.post_id,
        title: r.title,
        category: r.category,
        hot_grill_score: r.score,
        velocity_mult: r.velocity_mult,
      };
    });
    await fetchPostMetaMap(
      rows.map(function (r) {
        return r.post_id;
      })
    );
    return rows;
  }

  async function fetchPicklerRanking() {
    var sb = getClient();
    var res = await sb.rpc('pickle_ranking_top_picklers', {
      p_period: currentPeriod,
      p_limit: LIMIT,
    });
    if (res.error) {
      if (isMissingRpc(res.error)) {
        return currentPeriod === 'daily'
          ? fetchPicklerRankingLegacy()
          : fetchPeriodPicklerRanking(currentPeriod);
      }
      throw res.error;
    }
    var rows = (res.data || []).map(function (r) {
      return {
        user_id: r.user_id,
        nickname: r.nickname,
        star_score_total: r.score,
        follower_count: r.follower_total,
      };
    });
    await fetchUserAvatarMap(
      rows.map(function (r) {
        return r.user_id;
      })
    );
    return rows;
  }

  function periodTypeFromLabel(label) {
    var t = String(label || '').trim();
    if (t === '주간') return 'weekly';
    if (t === '월간') return 'monthly';
    if (t === '연간') return 'yearly';
    return 'daily';
  }

  async function fetchFollowerCountMap(userIds) {
    var map = new Map();
    if (!userIds.length) return map;

    var sb = getClient();
    var result = await sb
      .from('top_pickler_ranking')
      .select('user_id, follower_count')
      .in('user_id', userIds);

    if (!result.error) {
      (result.data || []).forEach(function (row) {
        if (row && row.user_id) {
          map.set(String(row.user_id), Number(row.follower_count) || 0);
        }
      });
    }

    return map;
  }

  // 주간/월간/연간 탭: ranking_period_results 스냅샷 테이블에서 가장 최근 집계분을 조회
  async function fetchPeriodGrillRanking(periodType) {
    var sb = getClient();
    var latestRes = await sb
      .from('ranking_period_results')
      .select('period_start')
      .eq('period_type', periodType)
      .eq('category', 'grill')
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRes.error || !latestRes.data) return [];

    var rowsRes = await sb
      .from('ranking_period_results')
      .select('rank, target_id, score_value')
      .eq('period_type', periodType)
      .eq('category', 'grill')
      .eq('period_start', latestRes.data.period_start)
      .order('rank', { ascending: true })
      .limit(LIMIT);

    if (rowsRes.error) throw rowsRes.error;

    var rows = (rowsRes.data || []).map(function (r) {
      return { post_id: r.target_id, hot_grill_score: r.score_value };
    });

    var postIds = rows.map(function (r) {
      return r.post_id;
    });
    await fetchPostMetaMap(postIds);
    return rows;
  }

  async function fetchPeriodPicklerRanking(periodType) {
    var sb = getClient();
    var latestRes = await sb
      .from('ranking_period_results')
      .select('period_start')
      .eq('period_type', periodType)
      .eq('category', 'pickler')
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRes.error || !latestRes.data) return [];

    var rowsRes = await sb
      .from('ranking_period_results')
      .select('rank, target_id, score_value')
      .eq('period_type', periodType)
      .eq('category', 'pickler')
      .eq('period_start', latestRes.data.period_start)
      .order('rank', { ascending: true })
      .limit(LIMIT);

    if (rowsRes.error) throw rowsRes.error;

    var rawRows = rowsRes.data || [];
    var userIds = rawRows.map(function (r) {
      return r.target_id;
    });
    await fetchUserAvatarMap(userIds);
    var followerMap = await fetchFollowerCountMap(userIds);

    return rawRows.map(function (r) {
      var meta = userAvatarMap.get(String(r.target_id)) || {};
      return {
        user_id: r.target_id,
        nickname: meta.nickname,
        star_score_total: r.score_value,
        follower_count: followerMap.get(String(r.target_id)) || 0,
      };
    });
  }

  function setListMessage(listEl, message) {
    if (!listEl) return;
    listEl.innerHTML =
      '<div style="text-align:center;padding:40px 20px;color:#a1a1aa;font-weight:700;font-size:0.95rem;">' +
      escapeHtml(message) +
      '</div>';
  }

  function setListLoading(listEl) {
    if (!listEl) return;
    listEl.innerHTML =
      '<div style="text-align:center;padding:40px 20px;color:#a1a1aa;font-weight:700;font-size:0.95rem;">불러오는 중…</div>';
  }

  /** 스폰서(광고) 불판 표시 — js/pickle-sponsor-badge.js 공통 모듈, 미로드 시에도 최소 표시 유지 */
  function sponsorAdBadgeHtml(meta) {
    if (!meta || meta.is_sponsor !== true) return '';
    if (window.PickleSponsor && window.PickleSponsor.badgeHtml) {
      return window.PickleSponsor.badgeHtml(meta) + ' ';
    }
    return (
      '<span role="note" aria-label="광고(스폰서) 게시물" style="display:inline-block;margin-right:4px;' +
      'padding:1px 5px;border-radius:4px;font-size:0.6rem;font-weight:600;color:#a1a1aa;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);">' +
      '광고</span> '
    );
  }

  function bindPodiumGrill(slotEl, row, rank) {
    if (!slotEl) return;
    if (!row) {
      slotEl.style.display = 'none';
      slotEl.onclick = null;
      return;
    }

    slotEl.style.display = '';
    var meta = postMetaMap.get(String(row.post_id)) || {};
    var title = postTitle(row, meta);

    var avatarEl = slotEl.querySelector('.podium-avatar');
    var nameEl = slotEl.querySelector('.podium-name');
    var scoreEl = slotEl.querySelector('.podium-score');
    var rankEl = slotEl.querySelector('.podium-rank');

    if (avatarEl) {
      avatarEl.style.borderRadius = '10px';
      avatarEl.innerHTML = renderMediaInner(meta, 'fire');
    }
    if (nameEl) {
      nameEl.textContent = title;
      var podiumAd = sponsorAdBadgeHtml(meta);
      if (podiumAd) nameEl.insertAdjacentHTML('afterbegin', podiumAd);
    }
    if (scoreEl) scoreEl.innerHTML = ICON.fire + ' ' + formatGrillScore(row.hot_grill_score);
    if (rankEl) rankEl.textContent = String(rank);

    slotEl.onclick = function () {
      goDetail(row.post_id);
    };
  }

  function buildGrillListItemHtml(row, rank) {
    var meta = postMetaMap.get(String(row.post_id)) || {};
    var title = postTitle(row, meta);
    var status = postStatusLabel(meta);
    var statusStyle =
      status === '마감 완료' ? ' style="color:var(--neon-sub);"' : '';
    var score = formatGrillScore(row.hot_grill_score);
    var picInner = renderMediaInner(meta, 'fire');

    return (
      '<div class="rank-item grill" data-post-id="' +
      escapeHtml(row.post_id) +
      '">' +
      '<div class="rank-num">' +
      rank +
      '</div>' +
      '<div class="rank-pic">' +
      picInner +
      '</div>' +
      '<div class="rank-info">' +
      '<div class="rank-title">' +
      sponsorAdBadgeHtml(meta) +
      escapeHtml(title) +
      '</div>' +
      '<div class="rank-sub"><span>' +
      escapeHtml(authorLabel(meta)) +
      '</span> <span>|</span> <span' +
      statusStyle +
      '>' +
      escapeHtml(status) +
      '</span></div>' +
      '</div>' +
      '<div class="rank-score">' +
      escapeHtml(score) +
      ' ' +
      ICON.fire +
      '</div>' +
      '</div>'
    );
  }

  function bindPodiumPickler(slotEl, row, rank) {
    if (!slotEl) return;
    var data = normalizePicklerRow(row);
    if (!data) {
      slotEl.style.display = 'none';
      slotEl.removeAttribute('data-user-id');
      slotEl.onclick = null;
      return;
    }

    slotEl.style.display = '';
    slotEl.setAttribute('data-user-id', String(data.user_id));
    slotEl.style.cursor = 'pointer';

    var avatarEl = slotEl.querySelector('.podium-avatar');
    var nameEl = slotEl.querySelector('.podium-name');
    var scoreEl = slotEl.querySelector('.podium-score');
    var rankEl = slotEl.querySelector('.podium-rank');
    var avatarInner = renderUserAvatarInner(data.user_id, data.nickname, 'user');

    if (avatarEl) {
      avatarEl.style.borderRadius = '';
      avatarEl.innerHTML = avatarInner;
    }
    if (nameEl) nameEl.textContent = data.nickname;
    if (scoreEl) {
      scoreEl.innerHTML = scoreWithIcon(data.star_score_total, ICON.star);
    }
    if (rankEl) rankEl.textContent = String(rank);

    slotEl.onclick = function (e) {
      e.preventDefault();
      openUserProfile(data.user_id, data.nickname, avatarInner);
    };
  }

  function buildPicklerListItemHtml(row, rank) {
    var data = normalizePicklerRow(row);
    if (!data) return '';
    var score = formatScore(data.star_score_total);
    var followers = data.follower_count;
    var picInner = renderUserAvatarInner(data.user_id, data.nickname, 'user');
    var levelBadge = buildLevelBadgeHtml(data.star_score_total);

    return (
      '<div class="rank-item pickler" data-user-id="' +
      escapeHtml(data.user_id) +
      '" data-nickname="' +
      escapeHtml(data.nickname) +
      '">' +
      '<div class="rank-num">' +
      rank +
      '</div>' +
      '<div class="rank-pic">' +
      picInner +
      '</div>' +
      '<div class="rank-info">' +
      '<div class="rank-title">' +
      escapeHtml(data.nickname) +
      ' ' +
      levelBadge +
      '</div>' +
      '<div class="rank-sub"><span>나의 픽: ' +
      escapeHtml(followers.toLocaleString('ko-KR')) +
      '명</span></div>' +
      '</div>' +
      '<div class="rank-score">' +
      escapeHtml(score) +
      ' ' +
      ICON.star +
      '</div>' +
      '</div>'
    );
  }

  function bindPicklerListClicks(listEl) {
    if (!listEl) return;
    listEl.querySelectorAll('.rank-item.pickler[data-user-id]').forEach(function (item) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', function () {
        var uid = item.getAttribute('data-user-id');
        var nickname = item.getAttribute('data-nickname') || '';
        var picEl = item.querySelector('.rank-pic');
        var avatarHtml = picEl ? picEl.innerHTML : '';
        openUserProfile(uid, nickname, avatarHtml);
      });
    });
  }

  function bindGrillListClicks(listEl) {
    if (!listEl) return;
    listEl.querySelectorAll('.rank-item.grill[data-post-id]').forEach(function (item) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', function () {
        goDetail(item.getAttribute('data-post-id'));
      });
    });
  }

  function renderGrillArea() {
    var area = document.getElementById('grillRankingArea');
    if (!area) return;

    var podium = area.querySelector('.podium-container');
    var list = area.querySelector('.ranking-list');
    var slot1 = area.querySelector('.podium-1');
    var slot2 = area.querySelector('.podium-2');
    var slot3 = area.querySelector('.podium-3');

    if (!grillRows.length) {
      if (podium) podium.style.display = 'none';
      setListMessage(
        list,
        currentCategory === 'all'
          ? EMPTY_MSG
          : '이 카테고리에는 아직 랭킹 데이터가 없습니다.'
      );
      return;
    }

    if (podium) podium.style.display = '';

    bindPodiumGrill(slot2, grillRows[1], 2);
    bindPodiumGrill(slot1, grillRows[0], 1);
    bindPodiumGrill(slot3, grillRows[2], 3);

    var listRows = grillRows.slice(3);
    if (!listRows.length) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = listRows
      .map(function (row, idx) {
        return buildGrillListItemHtml(row, idx + 4);
      })
      .join('');
    bindGrillListClicks(list);
  }

  function renderPicklerArea() {
    var area = document.getElementById('picklerRankingArea');
    if (!area) return;

    var podium = area.querySelector('.podium-container');
    var list = area.querySelector('.ranking-list');
    var slot1 = area.querySelector('.podium-1');
    var slot2 = area.querySelector('.podium-2');
    var slot3 = area.querySelector('.podium-3');

    if (!picklerRows.length) {
      if (podium) podium.style.display = 'none';
      setListMessage(list, EMPTY_MSG);
      return;
    }

    if (podium) podium.style.display = '';

    bindPodiumPickler(slot2, picklerRows[1], 2);
    bindPodiumPickler(slot1, picklerRows[0], 1);
    bindPodiumPickler(slot3, picklerRows[2], 3);

    var listRows = picklerRows.slice(3);
    if (!listRows.length) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = listRows
      .map(function (row, idx) {
        return buildPicklerListItemHtml(row, idx + 4);
      })
      .join('');
    bindPicklerListClicks(list);
  }

  function setPodiumLoading(area, iconHtml) {
    if (!area) return;
    area.querySelectorAll('.podium-item').forEach(function (slot) {
      var nameEl = slot.querySelector('.podium-name');
      var scoreEl = slot.querySelector('.podium-score');
      if (nameEl) nameEl.textContent = '…';
      if (scoreEl) scoreEl.innerHTML = iconHtml + ' …';
    });
  }

  function setLoadingState() {
    var grillArea = document.getElementById('grillRankingArea');
    var picklerArea = document.getElementById('picklerRankingArea');

    if (grillArea) {
      var grillPodium = grillArea.querySelector('.podium-container');
      var grillList = grillArea.querySelector('.ranking-list');
      if (grillPodium) grillPodium.style.display = 'none';
      setPodiumLoading(grillArea, ICON.fire);
      setListLoading(grillList);
    }

    if (picklerArea) {
      var picklerPodium = picklerArea.querySelector('.podium-container');
      var picklerList = picklerArea.querySelector('.ranking-list');
      if (picklerPodium) picklerPodium.style.display = 'none';
      setPodiumLoading(picklerArea, ICON.star);
      setListLoading(picklerList);
    }
  }

  function showLoadError(message) {
    ['grillRankingArea', 'picklerRankingArea'].forEach(function (id) {
      var area = document.getElementById(id);
      if (!area) return;
      var podium = area.querySelector('.podium-container');
      var list = area.querySelector('.ranking-list');
      if (podium) podium.style.display = 'none';
      setListMessage(list, message || '랭킹을 불러오지 못했습니다.');
    });
  }

  /* ── 카테고리 칩 (핫 불판 랭킹을 카테고리별로 거름) ── */
  function renderCategoryChips() {
    var nav = document.getElementById('categoryNav');
    var api = window.PickleCategories;
    if (!nav || !api || !api.renderCategoryNavBar) return;
    api.renderCategoryNavBar(nav, {
      page: 'ranking',
      useButtons: true,
      activeCategory: currentCategory,
    });
    // pickle-categories.js 가 칩 클릭을 "카테고리 페이지 이동"으로 덮어쓰지 못하게 표시
    nav.querySelectorAll('.category-nav-tab[data-category]').forEach(function (btn) {
      btn.dataset.catNavBound = '1';
    });
    if (api.scrollCategoryNavIntoView) api.scrollCategoryNavIntoView(document);
  }

  function categoryLabel(slug) {
    var api = window.PickleCategories;
    if (slug === 'all') return '';
    return (api && api.labelFromSlug && api.labelFromSlug(slug)) || '';
  }

  function updatePeriodNote() {
    var wrap = document.getElementById('subTabs');
    if (!wrap) return;
    var note = document.getElementById('rankingPeriodNote');
    if (!note) {
      note = document.createElement('p');
      note.id = 'rankingPeriodNote';
      note.className = 'ranking-period-note';
      wrap.insertAdjacentElement('afterend', note);
    }
    var text = PERIOD_NOTE[currentPeriod] || PERIOD_NOTE.daily;
    var onGrill = !document.getElementById('tabGrill') ||
      document.getElementById('tabGrill').classList.contains('active');
    var label = categoryLabel(currentCategory);
    if (onGrill && label) text += ' · ' + label;
    note.textContent = text;
  }

  function setCategoryNavDisabled(disabled) {
    var nav = document.getElementById('categoryNav');
    if (nav) nav.classList.toggle('is-disabled', !!disabled);
  }

  function bindCategoryChipClicks() {
    var nav = document.getElementById('categoryNav');
    if (!nav || nav.dataset.rankingBound === '1') return;
    nav.dataset.rankingBound = '1';
    nav.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.category-nav-tab[data-category]') : null;
      if (!btn || btn.tagName === 'A') return;
      var api = window.PickleCategories;
      var raw = btn.getAttribute('data-category') || 'all';
      if (api && api.isHallDbSlug && api.isHallDbSlug(raw)) return;
      var slug = api && api.normalizeSlug ? api.normalizeSlug(raw) : raw;
      if (slug === currentCategory) return;
      currentCategory = slug;
      loadAll();
    });
  }

  async function loadAll() {
    setLoadingState();

    try {
      if (window.PickleCategories && window.PickleCategories.load) {
        await window.PickleCategories.load();
      }

      renderCategoryChips();
      updatePeriodNote();

      var results = await Promise.all([fetchGrillRanking(), fetchPicklerRanking()]);
      grillRows = results[0];
      picklerRows = results[1];

      renderGrillArea();
      renderPicklerArea();
    } catch (err) {
      console.error('[P!CKLE Ranking]', err);
      showLoadError(
        '랭킹을 불러오지 못했습니다. (' + (err.message || String(err)) + ')'
      );
    }
  }

  function hookMainTabRender() {
    var orig = window.switchMainTab;
    if (typeof orig !== 'function') return;

    window.switchMainTab = function (tabName) {
      orig(tabName);
      setCategoryNavDisabled(tabName === 'pickler');
      updatePeriodNote();
      if (tabName === 'pickler') {
        renderPicklerArea();
      } else if (tabName === 'grill') {
        renderGrillArea();
      }
    };
  }

  function hookSubTabFade() {
    var orig = window.switchSubTab;
    if (typeof orig !== 'function') return;

    window.switchSubTab = function (element) {
      orig(element);
      var nextPeriod = periodTypeFromLabel(element && element.textContent);
      if (nextPeriod === currentPeriod) {
        renderGrillArea();
        renderPicklerArea();
        return;
      }
      currentPeriod = nextPeriod;
      loadAll();
    };
  }

  function init() {
    bindRankingGuideModal();
    bindCategoryChipClicks();
    hookMainTabRender();
    hookSubTabFade();
    loadAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PickleRanking = {
    reload: loadAll,
  };
})();

