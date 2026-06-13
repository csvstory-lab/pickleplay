/**
 * P!CKLE — ranking.html 랭킹 DB 연동
 * @build 20260608_ranking4
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
  var myUserId = null;
  var myFollowingSet = new Set();

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
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    if (Number.isInteger(n)) return n.toLocaleString('ko-KR');
    return n.toFixed(1);
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

  function ensurePickBtnStyles() {
    if (document.getElementById('pickle-ranking-pick-btn-style')) return;
    var style = document.createElement('style');
    style.id = 'pickle-ranking-pick-btn-style';
    style.textContent =
      '#picklerRankingArea .rank-item { flex-wrap: nowrap; }' +
      '#picklerRankingArea .rank-pick-btn {' +
      'flex-shrink: 0; margin-left: 4px; padding: 6px 10px; border-radius: 16px;' +
      'font-size: 0.72rem; font-weight: 800; cursor: pointer; transition: 0.2s;' +
      'font-family: inherit; white-space: nowrap; border: 1px solid var(--neon-blue);' +
      'background: transparent; color: var(--neon-blue);' +
      '}' +
      '#picklerRankingArea .rank-pick-btn.follow:active:not(:disabled) { transform: scale(0.94); }' +
      '#picklerRankingArea .rank-pick-btn.following,' +
      '#picklerRankingArea .rank-pick-btn.active {' +
      'background: var(--neon-blue); color: #000; border-color: var(--neon-blue);' +
      '}' +
      '#picklerRankingArea .rank-pick-btn:disabled { opacity: 0.5; cursor: not-allowed; }' +
      '#picklerRankingArea .podium-pick-wrap {' +
      'position: relative; z-index: 12; margin-top: 4px; margin-bottom: 2px;' +
      'display: flex; justify-content: center; width: 100%;' +
      '}' +
      '#picklerRankingArea .podium-pick-btn {' +
      'margin-left: 0; padding: 4px 8px; font-size: 0.62rem; line-height: 1.2;' +
      '}' +
      '#picklerRankingArea .podium-1 .podium-pick-btn {' +
      'padding: 5px 10px; font-size: 0.68rem;' +
      '}' +
      '#picklerRankingArea .podium-item { cursor: default; }';
    document.head.appendChild(style);
  }

  async function getCurrentUserId() {
    if (myUserId) return myUserId;
    var sb = getClient();
    try {
      var result = await sb.auth.getUser();
      if (result.error || !result.data.user) return null;
      myUserId = result.data.user.id;
      return myUserId;
    } catch (e) {
      return null;
    }
  }

  async function refreshMyFollowingSet() {
    myFollowingSet = new Set();
    var userId = await getCurrentUserId();
    if (!userId) return myFollowingSet;

    var sb = getClient();
    var result = await sb
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId);

    if (!result.error) {
      (result.data || []).forEach(function (row) {
        if (row && row.following_id) {
          myFollowingSet.add(String(row.following_id));
        }
      });
    }
    return myFollowingSet;
  }

  function isFollowingUser(targetUserId) {
    return myFollowingSet.has(String(targetUserId));
  }

  function shouldShowPickButton(targetUserId) {
    if (!targetUserId) return false;
    if (myUserId && String(targetUserId) === String(myUserId)) return false;
    return true;
  }

  function updatePickBtnState(btn, isFollowingUser) {
    if (!btn) return;
    if (isFollowingUser) {
      btn.classList.add('following', 'active');
      btn.classList.remove('follow');
      btn.textContent = '픽 취소';
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.classList.remove('following', 'active');
      btn.classList.add('follow');
      btn.textContent = '+ 나의 픽';
      btn.setAttribute('aria-pressed', 'false');
    }
  }

  function syncAllPickBtnStates(targetUserId, isFollowingUser) {
    var area = document.getElementById('picklerRankingArea');
    if (!area || !targetUserId) return;
    var id = String(targetUserId);
    area.querySelectorAll('.rank-pick-btn[data-user-id]').forEach(function (btn) {
      if (btn.getAttribute('data-user-id') === id) {
        updatePickBtnState(btn, isFollowingUser);
      }
    });
  }

  function buildPickBtnHtml(targetUserId, variant) {
    if (!shouldShowPickButton(targetUserId)) return '';
    var following = isFollowingUser(targetUserId);
    var isPodium = variant === 'podium';
    var classes =
      'rank-pick-btn btn-mypick ' +
      (isPodium ? 'podium-pick-btn ' : '') +
      (following ? 'following active' : 'follow');
    var label = following ? '픽 취소' : '+ 나의 픽';
    return (
      '<button type="button" class="' +
      classes +
      '" data-user-id="' +
      escapeHtml(targetUserId) +
      '" aria-pressed="' +
      (following ? 'true' : 'false') +
      '">' +
      label +
      '</button>'
    );
  }

  async function handlePickBtnClick(btn) {
    var targetUserId = btn.getAttribute('data-user-id');
    if (!targetUserId || btn.disabled) return;

    btn.disabled = true;

    try {
      var userId = await getCurrentUserId();
      if (!userId) {
        alert('로그인이 필요합니다.');
        return;
      }
      if (String(targetUserId) === String(userId)) return;

      var sb = getClient();
      var alreadyFollowing = isFollowingUser(targetUserId);

      if (alreadyFollowing) {
        var del = await sb
          .from('user_follows')
          .delete()
          .eq('follower_id', userId)
          .eq('following_id', targetUserId);
        if (del.error) throw del.error;
        myFollowingSet.delete(String(targetUserId));
        syncAllPickBtnStates(targetUserId, false);
      } else {
        var ins = await sb.from('user_follows').insert({
          follower_id: userId,
          following_id: targetUserId,
        });
        if (ins.error) throw ins.error;
        myFollowingSet.add(String(targetUserId));
        syncAllPickBtnStates(targetUserId, true);
      }
    } catch (err) {
      console.error('[P!CKLE Ranking] follow toggle failed', err);
      alert(err.message || '픽 처리에 실패했습니다.');
    } finally {
      btn.disabled = false;
    }
  }

  function bindPicklerFollowDelegation() {
    var area = document.getElementById('picklerRankingArea');
    if (!area || area.dataset.pickBound === '1') return;
    area.dataset.pickBound = '1';

    area.addEventListener('click', function (e) {
      var btn = e.target.closest('.rank-pick-btn');
      if (!btn || !area.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      handlePickBtnClick(btn);
    });
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
    var status = postStatusLabel(meta);
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
    if (!row) {
      slotEl.style.display = 'none';
      slotEl.removeAttribute('data-user-id');
      var emptyWrap = slotEl.querySelector('.podium-pick-wrap');
      if (emptyWrap) emptyWrap.innerHTML = '';
      return;
    }

    slotEl.style.display = '';
    slotEl.setAttribute('data-user-id', String(row.user_id));
    var nickname = String(row.nickname || '이름없음').trim() || '이름없음';
    var score = formatScore(row.star_score_total);

    var avatarEl = slotEl.querySelector('.podium-avatar');
    var nameEl = slotEl.querySelector('.podium-name');
    var scoreEl = slotEl.querySelector('.podium-score');
    var pickWrap = slotEl.querySelector('.podium-pick-wrap');
    var rankEl = slotEl.querySelector('.podium-rank');

    if (avatarEl) {
      avatarEl.style.borderRadius = '';
      avatarEl.innerHTML = renderUserAvatarInner(row.user_id, nickname, '😎');
    }
    if (nameEl) nameEl.textContent = nickname;
    if (scoreEl) scoreEl.textContent = '⭐ ' + score;
    if (rankEl) rankEl.textContent = String(rank);

    if (!pickWrap) {
      pickWrap = document.createElement('div');
      pickWrap.className = 'podium-pick-wrap';
      if (rankEl) {
        slotEl.insertBefore(pickWrap, rankEl);
      } else {
        slotEl.appendChild(pickWrap);
      }
    }
    pickWrap.innerHTML = buildPickBtnHtml(row.user_id, 'podium');
  }

  function buildPicklerListItemHtml(row, rank) {
    var nickname = String(row.nickname || '이름없음').trim() || '이름없음';
    var score = formatScore(row.star_score_total);
    var followers = Number(row.follower_count) || 0;
    var picInner = renderUserAvatarInner(row.user_id, nickname, '😎');
    var levelBadge = buildLevelBadgeHtml(row.points);

    return (
      '<div class="rank-item" data-user-id="' +
      escapeHtml(row.user_id) +
      '">' +
      '<div class="rank-num">' +
      rank +
      '</div>' +
      '<div class="rank-pic">' +
      picInner +
      '</div>' +
      '<div class="rank-info">' +
      '<div class="rank-title">' +
      escapeHtml(nickname) +
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
      buildPickBtnHtml(row.user_id) +
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

  function setLoadingState() {
    ['grillRankingArea', 'picklerRankingArea'].forEach(function (id) {
      var area = document.getElementById(id);
      if (!area) return;
      var podium = area.querySelector('.podium-container');
      var list = area.querySelector('.ranking-list');
      if (podium) podium.style.display = 'none';
      setListLoading(list);
    });
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

      myUserId = null;
      await refreshMyFollowingSet();

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
    ensurePickBtnStyles();
    bindPicklerFollowDelegation();
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
