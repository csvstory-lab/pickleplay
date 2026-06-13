/**
 * P!CKLE — ranking.html 랭킹 DB 연동
 * @build 20260608_ranking8
 * hot_grill_ranking · top_pickler_ranking VIEW → 기존 DOM 바인딩
 */
(function () {
  'use strict';

  var LIMIT = 10;
  var EMPTY_MSG = '아직 랭킹 데이터가 없습니다.';
  var grillRows = [];
  var picklerRows = [];
  var postMetaMap = new Map();
  var userAvatarMap = new Map();

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
    if (!Number.isFinite(n)) n = 0;
    if (n <= 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    if (Number.isInteger(n)) return n.toLocaleString('ko-KR');
    return n.toFixed(1);
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

  function buildLevelBadgeHtml(points) {
    var lv = 1;
    if (window.PickleProfile && window.PickleProfile.getUserLevelFromPoints) {
      lv = window.PickleProfile.getUserLevelFromPoints(points);
    }
    return (
      '<span style="font-size:0.7rem; background:#444; padding:2px 6px; border-radius:8px; margin-left:5px;">Lv.' +
      Math.floor(lv) +
      '</span>'
    );
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
    return escapeHtml(fallbackEmoji || '🥒');
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
    return escapeHtml(nick.charAt(0) || fallbackEmoji || '픽');
  }

  function goDetail(postId) {
    if (!postId) return;
    window.location.href = 'detail.html?id=' + encodeURIComponent(String(postId));
  }

  async function fetchPostMetaMap(postIds) {
    postMetaMap = new Map();
    if (!postIds.length) return postMetaMap;

    var sb = getClient();
    var fieldSets = [
      'id, title, option_a_name, option_b_name, author_nickname, expires_at, thumbnail_url, author_avatar_html',
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
      var result = await sb.from('users').select(fieldSets[i]).in('id', userIds);
      if (result.error) continue;
      (result.data || []).forEach(function (row) {
        if (row && row.id) userAvatarMap.set(String(row.id), row);
      });
      if (userAvatarMap.size) break;
    }

    return userAvatarMap;
  }

  async function fetchGrillRanking() {
    var sb = getClient();
    var result = await sb
      .from('hot_grill_ranking')
      .select('*')
      .order('hot_grill_score', { ascending: false })
      .limit(LIMIT);

    if (result.error) throw result.error;

    var rows = result.data || [];
    var postIds = rows.map(function (r) {
      return r.post_id;
    });
    await fetchPostMetaMap(postIds);
    return rows;
  }

  async function fetchPicklerRanking() {
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
    var score = formatScore(row.hot_grill_score);

    var avatarEl = slotEl.querySelector('.podium-avatar');
    var nameEl = slotEl.querySelector('.podium-name');
    var scoreEl = slotEl.querySelector('.podium-score');
    var rankEl = slotEl.querySelector('.podium-rank');

    if (avatarEl) {
      avatarEl.style.borderRadius = '10px';
      avatarEl.innerHTML = renderMediaInner(meta, '🔥');
    }
    if (nameEl) nameEl.textContent = title;
    if (scoreEl) scoreEl.textContent = '🔥 ' + score;
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
    var score = formatScore(row.hot_grill_score);
    var picInner = renderMediaInner(meta, '🔥');

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
      ' <span style="font-size:0.8rem;">🔥</span></div>' +
      '</div>'
    );
  }

  function bindPodiumPickler(slotEl, row, rank) {
    if (!slotEl) return;
    var data = normalizePicklerRow(row);
    if (!data) {
      slotEl.style.display = 'none';
      slotEl.removeAttribute('data-user-id');
      return;
    }

    slotEl.style.display = '';
    slotEl.setAttribute('data-user-id', String(data.user_id));
    slotEl.onclick = null;

    var avatarEl = slotEl.querySelector('.podium-avatar');
    var nameEl = slotEl.querySelector('.podium-name');
    var scoreEl = slotEl.querySelector('.podium-score');
    var rankEl = slotEl.querySelector('.podium-rank');

    if (avatarEl) {
      avatarEl.style.borderRadius = '';
      avatarEl.innerHTML = renderUserAvatarInner(
        data.user_id,
        data.nickname,
        '😎'
      );
    }
    if (nameEl) nameEl.textContent = data.nickname;
    if (scoreEl) {
      scoreEl.textContent = '⭐ ' + formatScore(data.star_score_total);
    }
    if (rankEl) rankEl.textContent = String(rank);
  }

  function buildPicklerListItemHtml(row, rank) {
    var data = normalizePicklerRow(row);
    if (!data) return '';
    var score = formatScore(data.star_score_total);
    var followers = data.follower_count;
    var picInner = renderUserAvatarInner(data.user_id, data.nickname, '😎');
    var levelBadge = buildLevelBadgeHtml(data.points);

    return (
      '<div class="rank-item" data-user-id="' +
      escapeHtml(data.user_id) +
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
      ' <span style="font-size:0.8rem;">⭐</span></div>' +
      '</div>'
    );
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
      setListMessage(list, EMPTY_MSG);
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
  }

  function setPodiumLoading(area, scoreIcon) {
    if (!area) return;
    area.querySelectorAll('.podium-item').forEach(function (slot) {
      var nameEl = slot.querySelector('.podium-name');
      var scoreEl = slot.querySelector('.podium-score');
      if (nameEl) nameEl.textContent = '…';
      if (scoreEl) scoreEl.textContent = scoreIcon + ' …';
    });
  }

  function setLoadingState() {
    var grillArea = document.getElementById('grillRankingArea');
    var picklerArea = document.getElementById('picklerRankingArea');

    if (grillArea) {
      var grillPodium = grillArea.querySelector('.podium-container');
      var grillList = grillArea.querySelector('.ranking-list');
      if (grillPodium) grillPodium.style.display = 'none';
      setPodiumLoading(grillArea, '🔥');
      setListLoading(grillList);
    }

    if (picklerArea) {
      var picklerPodium = picklerArea.querySelector('.podium-container');
      var picklerList = picklerArea.querySelector('.ranking-list');
      if (picklerPodium) picklerPodium.style.display = 'none';
      setPodiumLoading(picklerArea, '⭐');
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

  async function loadAll() {
    setLoadingState();

    try {
      if (window.PickleCategories && window.PickleCategories.load) {
        await window.PickleCategories.load();
      }

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
      renderGrillArea();
      renderPicklerArea();
    };
  }

  function init() {
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
