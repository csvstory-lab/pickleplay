/**
 * P!CKLE — 맞픽(팔로우) user_follows 연동
 * @build 20260608_fandom3
 */
(function () {
  'use strict';

  var PICKLE_FOLLOWS_BUILD = '20260608_fandom3';
  var FANDOM_NICKNAME_FALLBACK = '이름없음';

  var myFollowingSet = new Set();
  var currentFandomSheetType = null;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getSupabaseClient() {
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.getClient) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    return null;
  }

  async function getCurrentUserId() {
    var sb = getSupabaseClient();
    if (!sb) return null;
    try {
      var result = await sb.auth.getUser();
      if (result.error || !result.data.user) return null;
      return result.data.user.id;
    } catch (e) {
      return null;
    }
  }

  async function countFollowers(userId) {
    var sb = getSupabaseClient();
    if (!sb || !userId) return 0;
    var result = await sb
      .from('user_follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('following_id', userId);
    if (result.error) throw result.error;
    return result.count || 0;
  }

  async function countFollowing(userId) {
    var sb = getSupabaseClient();
    if (!sb || !userId) return 0;
    var result = await sb
      .from('user_follows')
      .select('following_id', { count: 'exact', head: true })
      .eq('follower_id', userId);
    if (result.error) throw result.error;
    return result.count || 0;
  }

  function bumpFollowStats(deltaFollowers, deltaFollowing) {
    var followerEl = document.getElementById('statFollowerCount');
    var followingEl = document.getElementById('statFollowingCount');
    if (followerEl && deltaFollowers) {
      var nextF = Math.max(0, (parseInt(followerEl.textContent, 10) || 0) + deltaFollowers);
      followerEl.textContent = String(nextF);
    }
    if (followingEl && deltaFollowing) {
      var nextG = Math.max(0, (parseInt(followingEl.textContent, 10) || 0) + deltaFollowing);
      followingEl.textContent = String(nextG);
    }
  }

  async function refreshMyFollowingSet(userId) {
    myFollowingSet = new Set();
    if (!userId) return myFollowingSet;
    var sb = getSupabaseClient();
    if (!sb) return myFollowingSet;

    var result = await sb
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId);

    if (!result.error) {
      (result.data || []).forEach(function (row) {
        if (row && row.following_id) myFollowingSet.add(String(row.following_id));
      });
    }
    return myFollowingSet;
  }

  async function isFollowing(followerId, followingId) {
    if (!followerId || !followingId || followerId === followingId) return false;
    if (myFollowingSet.has(String(followingId))) return true;

    var sb = getSupabaseClient();
    if (!sb) return false;

    var result = await sb
      .from('user_follows')
      .select('follower_id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .maybeSingle();

    if (result.error) {
      console.warn('[P!CKLE Follows] isFollowing failed', result.error);
      return false;
    }
    return !!result.data;
  }

  function setFollowButtonState(btn, isFollowingUser, options) {
    if (!btn) return;
    var opts = options || {};
    var pickLabel = opts.pickLabel || '픽 하기';
    var unpickLabel = opts.unpickLabel || '픽 취소';

    if (btn.classList.contains('btn-mypick')) {
      pickLabel = opts.pickLabel || '+ 나의 픽';
      unpickLabel = opts.unpickLabel || '픽 취소';
    }

    if (isFollowingUser) {
      btn.classList.add('following', 'active');
      btn.classList.remove('follow', 'match-pick');
      btn.textContent = unpickLabel;
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.classList.remove('following', 'active');
      btn.classList.add('follow');
      btn.textContent = pickLabel;
      btn.setAttribute('aria-pressed', 'false');
    }
  }

  async function loadFollowStats(userId) {
    var followerEl = document.getElementById('statFollowerCount');
    var followingEl = document.getElementById('statFollowingCount');
    if (!userId) return { followers: 0, following: 0 };

    try {
      await refreshMyFollowingSet(userId);
      var counts = await Promise.all([
        countFollowers(userId),
        countFollowing(userId),
      ]);

      if (followerEl) followerEl.textContent = String(counts[0]);
      if (followingEl) followingEl.textContent = String(counts[1]);

      return { followers: counts[0], following: counts[1] };
    } catch (err) {
      console.warn('[P!CKLE Follows] loadFollowStats failed', err);
      if (followerEl) followerEl.textContent = '0';
      if (followingEl) followingEl.textContent = '0';
      return { followers: 0, following: 0 };
    }
  }

  var FANDOM_USER_FIELDS_FULL =
    'id, nickname, points, star_score, avatar_html, avatar_url';
  var FANDOM_USER_FIELDS_BASE = 'id, nickname, points';

  function unwrapEmbeddedProfile(value) {
    if (!value) return null;
    if (Array.isArray(value)) {
      return value.length ? unwrapEmbeddedProfile(value[0]) : null;
    }
    if (typeof value === 'object') return value;
    return null;
  }

  function getFandomProfileFromRow(row, listType) {
    if (!row) return null;

    var embedKey = listType === 'follower' ? 'follower' : 'following';
    var candidates = [
      row[embedKey],
      row.users,
      row.profile,
      row.user,
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      var profile = unwrapEmbeddedProfile(candidates[i]);
      if (profile && (profile.nickname || profile.id)) {
        return profile;
      }
    }

    return null;
  }

  function getFandomTargetUserId(row, listType) {
    if (!row) return null;
    var profile = getFandomProfileFromRow(row, listType);
    if (profile && profile.id) return profile.id;
    return listType === 'follower' ? row.follower_id : row.following_id;
  }

  async function fetchUsersFallbackMap(userIds) {
    var map = new Map();
    var uniqueIds = Array.from(
      new Set((userIds || []).filter(Boolean).map(String))
    );
    if (!uniqueIds.length) return map;

    var sb = getSupabaseClient();
    if (!sb) return map;

    var fieldSets = [
      FANDOM_USER_FIELDS_FULL,
      FANDOM_USER_FIELDS_BASE + ', star_score',
      FANDOM_USER_FIELDS_BASE,
    ];

    for (var i = 0; i < fieldSets.length; i += 1) {
      var result = await sb.from('users').select(fieldSets[i]).in('id', uniqueIds);
      if (result.error) continue;
      (result.data || []).forEach(function (row) {
        if (row && row.id) map.set(String(row.id), row);
      });
      if (map.size) break;
    }

    return map;
  }

  async function fetchFandomListRows(listType, userId) {
    var sb = getSupabaseClient();
    if (!sb || !userId) return { rows: [], error: null };

    var embedKey = listType === 'follower' ? 'follower' : 'following';
    var idCol = listType === 'follower' ? 'follower_id' : 'following_id';
    var filterCol = listType === 'follower' ? 'following_id' : 'follower_id';
    var fkHint = idCol;
    var fkName =
      listType === 'follower'
        ? 'user_follows_follower_id_fkey'
        : 'user_follows_following_id_fkey';

    function buildSelect(fields, hint) {
      return (
        idCol +
        ', created_at, ' +
        embedKey +
        ':users!' +
        hint +
        '(' +
        fields +
        ')'
      );
    }

    var selectVariants = [
      buildSelect(FANDOM_USER_FIELDS_FULL, fkHint),
      buildSelect(FANDOM_USER_FIELDS_FULL, fkName),
      buildSelect(FANDOM_USER_FIELDS_BASE + ', star_score', fkHint),
      buildSelect(FANDOM_USER_FIELDS_BASE, fkHint),
    ];

    var lastError = null;
    for (var i = 0; i < selectVariants.length; i += 1) {
      var result = await sb
        .from('user_follows')
        .select(selectVariants[i])
        .eq(filterCol, userId)
        .order('created_at', { ascending: false });

      if (!result.error) {
        return { rows: result.data || [], error: null };
      }
      lastError = result.error;
    }

    console.warn('[P!CKLE Follows] fandom list join failed', lastError);
    return { rows: [], error: lastError };
  }

  async function fetchAvatarHtmlMap(userIds) {
    var map = new Map();
    if (!userIds.length) return map;

    var sb = getSupabaseClient();
    if (!sb) return map;

    var postsRes = await sb
      .from('posts')
      .select('author_id, author_avatar_html, created_at')
      .in('author_id', userIds)
      .not('author_avatar_html', 'is', null)
      .order('created_at', { ascending: false });

    if (!postsRes.error && postsRes.data) {
      postsRes.data.forEach(function (row) {
        if (!row || !row.author_id) return;
        var key = String(row.author_id);
        if (map.has(key)) return;
        var html = row.author_avatar_html ? String(row.author_avatar_html).trim() : '';
        if (html) map.set(key, html);
      });
    }

    var commentsRes = await sb
      .from('comments')
      .select('user_id, author_avatar_html, created_at')
      .in('user_id', userIds)
      .not('author_avatar_html', 'is', null)
      .order('created_at', { ascending: false });

    if (!commentsRes.error && commentsRes.data) {
      commentsRes.data.forEach(function (row) {
        if (!row || !row.user_id) return;
        var key = String(row.user_id);
        if (map.has(key)) return;
        var html = row.author_avatar_html ? String(row.author_avatar_html).trim() : '';
        if (html) map.set(key, html);
      });
    }

    return map;
  }

  function resolveRankingPoints(userRow) {
    if (!userRow) return 0;
    if (userRow.star_score != null && userRow.star_score !== '') {
      return Number(userRow.star_score) || 0;
    }
    if (window.PickleProfile && window.PickleProfile.extractRankingPointsFromRow) {
      return window.PickleProfile.extractRankingPointsFromRow(userRow);
    }
    return Number(userRow.points) || 0;
  }

  function buildLevelBadge(userRow) {
    var pts = resolveRankingPoints(userRow);
    if (window.PickleProfile && window.PickleProfile.buildLevelBadgeFromPoints) {
      var html = window.PickleProfile.buildLevelBadgeFromPoints(pts);
      return html.replace('grade-badge', 'fandom-lvl');
    }
    var lv = 1;
    if (window.PickleProfile && window.PickleProfile.getUserLevelFromPoints) {
      lv = window.PickleProfile.getUserLevelFromPoints(pts);
    }
    return '<span class="fandom-lvl">Lv.' + Math.floor(lv) + '</span>';
  }

  function renderAvatarHtml(userRow, targetUserId, avatarMap) {
    if (userRow && userRow.avatar_url) {
      var url = String(userRow.avatar_url).trim();
      if (url) {
        return (
          '<img src="' +
          escapeHtml(url) +
          '" alt="" loading="lazy" decoding="async">'
        );
      }
    }

    var fromUser =
      userRow && userRow.avatar_html ? String(userRow.avatar_html).trim() : '';
    if (fromUser) {
      if (fromUser.indexOf('<') !== -1) {
        return fromUser;
      }
      return escapeHtml(fromUser);
    }

    var stored = avatarMap.get(String(targetUserId));
    if (stored) {
      if (stored.indexOf('<') !== -1) {
        return stored;
      }
      return escapeHtml(stored);
    }

    var nickname =
      userRow && userRow.nickname ? String(userRow.nickname).trim() : '';
    return escapeHtml(nickname.charAt(0) || '🥒');
  }

  function extractFandomNickname(item, listType, userRow) {
    var fromItem = item || {};
    var usersEmbed = unwrapEmbeddedProfile(fromItem.users || fromItem.user);
    if (usersEmbed && usersEmbed.nickname) {
      return String(usersEmbed.nickname).trim();
    }

    var embedKey = listType === 'follower' ? 'follower' : 'following';
    var embedProfile = unwrapEmbeddedProfile(fromItem[embedKey]);
    if (embedProfile && embedProfile.nickname) {
      return String(embedProfile.nickname).trim();
    }

    if (userRow && userRow.nickname) {
      return String(userRow.nickname).trim();
    }

    return '';
  }

  function resolveFandomNickname(item, listType, userRow) {
    var nickname = extractFandomNickname(item, listType, userRow);
    return nickname || FANDOM_NICKNAME_FALLBACK;
  }

  function renderFandomItem(item, userRow, targetUserId, listType, myId, avatarMap) {
    var nickname = resolveFandomNickname(item, listType, userRow);
    var isMine = myId && String(targetUserId) === String(myId);
    var iFollow = myFollowingSet.has(String(targetUserId));
    var avatarInner = renderAvatarHtml(userRow, targetUserId, avatarMap);
    var levelBadge = buildLevelBadge(userRow);

    var btnHtml = '';
    if (!isMine) {
      if (listType === 'following') {
        btnHtml =
          `<button type="button" class="btn-follow following" data-user-id="${escapeHtml(targetUserId)}" data-list-type="following" data-action="unfollow">픽 취소</button>`;
      } else if (listType === 'follower') {
        if (iFollow) {
          btnHtml =
            `<button type="button" class="btn-follow following" data-user-id="${escapeHtml(targetUserId)}" data-list-type="follower" data-action="unfollow">픽 취소</button>`;
        } else {
          btnHtml =
            `<button type="button" class="btn-follow match-pick follow" data-user-id="${escapeHtml(targetUserId)}" data-list-type="follower" data-action="match-pick">+맞픽</button>`;
        }
      }
    }

    return `
      <div class="fandom-item" data-user-id="${escapeHtml(targetUserId)}">
        <div class="fandom-profile">
          <div class="fandom-avatar">${avatarInner}</div>
          <div class="fandom-name-wrap">
            <div class="fandom-name">${escapeHtml(nickname)}</div>
            ${levelBadge}
          </div>
        </div>
        ${btnHtml}
      </div>`;
  }

  function showFandomEmpty(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="fandom-empty">아직 목록이 없습니다.</div>';
  }

  async function renderFandomList(type, userId) {
    var sb = getSupabaseClient();
    if (!sb || !userId) return '';

    var myId = await getCurrentUserId();
    await refreshMyFollowingSet(myId);

    var listResult = await fetchFandomListRows(type, userId);
    if (listResult.error) throw listResult.error;

    var rows = listResult.rows || [];
    console.log('[P!CKLE Follows] fandom raw rows (' + type + '):', rows);

    var userIds = rows
      .map(function (r) {
        return getFandomTargetUserId(r, type);
      })
      .filter(Boolean);

    var missingProfileIds = [];
    rows.forEach(function (r) {
      var targetId = getFandomTargetUserId(r, type);
      var profile = getFandomProfileFromRow(r, type);
      if (targetId && extractFandomNickname(r, type, profile) === '') {
        missingProfileIds.push(targetId);
      }
    });

    var fallbackMap = await fetchUsersFallbackMap(missingProfileIds);
    var avatarMap = await fetchAvatarHtmlMap(userIds);

    console.log('[P!CKLE Follows] build=' + PICKLE_FOLLOWS_BUILD + ' type=' + type);

    var rendered = rows.map(function (r) {
      var targetId = getFandomTargetUserId(r, type);
      var profile = getFandomProfileFromRow(r, type);
      if (extractFandomNickname(r, type, profile) === '' && targetId) {
        profile = fallbackMap.get(String(targetId)) || profile;
      }
      var nickname = resolveFandomNickname(r, type, profile);
      console.log('[P!CKLE Follows] render item:', {
        build: PICKLE_FOLLOWS_BUILD,
        type: type,
        targetId: targetId,
        nickname: nickname,
        item: r,
        profile: profile,
      });
      return renderFandomItem(r, profile, targetId, type, myId, avatarMap);
    });

    return rendered.join('');
  }

  function animateRemoveFandomItem(itemEl) {
    if (!itemEl) return Promise.resolve();
    return new Promise(function (resolve) {
      itemEl.classList.add('is-removing');
      window.setTimeout(function () {
        itemEl.remove();
        resolve();
      }, 320);
    });
  }

  function bindFandomListActions(container) {
    if (!container || container.dataset.followBound === '1') return;
    container.dataset.followBound = '1';

    container.addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-follow');
      if (!btn || btn.disabled) return;
      handleFandomListAction(btn);
    });
  }

  async function handleFandomListAction(btn) {
    var targetUserId = btn.getAttribute('data-user-id');
    var listType = btn.getAttribute('data-list-type') || currentFandomSheetType;
    var action = btn.getAttribute('data-action');
    var itemEl = btn.closest('.fandom-item');
    if (!targetUserId) return;

    btn.disabled = true;

    try {
      if (action === 'unfollow') {
        var removed = await unfollowUser(targetUserId);
        if (!removed) return;

        bumpFollowStats(0, -1);

        if (listType === 'following') {
          await animateRemoveFandomItem(itemEl);
          var container = document.getElementById('fandomListContent');
          if (container && !container.querySelector('.fandom-item')) {
            showFandomEmpty(container);
          }
        } else if (listType === 'follower') {
          btn.classList.remove('following');
          btn.classList.add('match-pick', 'follow');
          btn.setAttribute('data-action', 'match-pick');
          btn.textContent = '+맞픽';
          btn.disabled = false;
        }
        return;
      }

      if (action === 'match-pick') {
        var followed = await followUser(targetUserId);
        if (!followed) return;

        bumpFollowStats(0, 1);
        btn.classList.remove('match-pick', 'follow');
        btn.classList.add('following');
        btn.setAttribute('data-action', 'unfollow');
        btn.textContent = '픽 취소';
        btn.disabled = false;
        return;
      }
    } catch (err) {
      console.error('[P!CKLE Follows] list action failed', err);
      alert(err.message || '픽 처리에 실패했습니다.');
      btn.disabled = false;
    }
  }

  async function followUser(targetUserId) {
    var sb = getSupabaseClient();
    if (!sb) throw new Error('Supabase 연결 실패');

    var myId = await getCurrentUserId();
    if (!myId) {
      alert('로그인이 필요합니다.');
      return false;
    }
    if (!targetUserId || myId === targetUserId) return false;

    if (await isFollowing(myId, targetUserId)) {
      myFollowingSet.add(String(targetUserId));
      return true;
    }

    var ins = await sb.from('user_follows').insert({
      follower_id: myId,
      following_id: targetUserId,
    });
    if (ins.error) throw ins.error;
    myFollowingSet.add(String(targetUserId));
    return true;
  }

  async function unfollowUser(targetUserId) {
    var sb = getSupabaseClient();
    if (!sb) throw new Error('Supabase 연결 실패');

    var myId = await getCurrentUserId();
    if (!myId) {
      alert('로그인이 필요합니다.');
      return false;
    }
    if (!targetUserId || myId === targetUserId) return false;

    var del = await sb
      .from('user_follows')
      .delete()
      .eq('follower_id', myId)
      .eq('following_id', targetUserId);
    if (del.error) throw del.error;
    myFollowingSet.delete(String(targetUserId));
    return true;
  }

  async function toggleFollow(targetUserId) {
    var myId = await getCurrentUserId();
    if (!myId) {
      alert('로그인이 필요합니다.');
      return null;
    }
    if (!targetUserId || myId === targetUserId) return null;

    if (await isFollowing(myId, targetUserId)) {
      await unfollowUser(targetUserId);
      return false;
    }
    await followUser(targetUserId);
    return true;
  }

  async function openFandomSheet(type) {
    var overlay = document.getElementById('commonOverlay');
    var sheet = document.getElementById('fandomSheet');
    var titleEl = document.getElementById('fandomTitle');
    var contentEl = document.getElementById('fandomListContent');
    if (!sheet || !contentEl) return;

    var userId =
      window.PickleMypage && window.PickleMypage.getCurrentUser
        ? window.PickleMypage.getCurrentUser()?.id
        : await getCurrentUserId();

    if (!userId) {
      alert('로그인이 필요합니다.');
      return;
    }

    currentFandomSheetType = type;

    if (typeof closeAllModals === 'function') closeAllModals();
    if (overlay) overlay.classList.add('open');
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (titleEl) {
      titleEl.textContent =
        type === 'follower' ? '나를 픽한 픽클러' : '내가 픽한 픽클러';
    }

    contentEl.innerHTML = '<div class="fandom-loading">불러오는 중…</div>';
    bindFandomListActions(contentEl);

    try {
      var html = await renderFandomList(type, userId);
      if (html) {
        contentEl.innerHTML = html;
      } else {
        showFandomEmpty(contentEl);
      }
    } catch (err) {
      console.error('[P!CKLE Follows] fandom list failed', err);
      contentEl.innerHTML =
        '<div class="fandom-empty">목록을 불러오지 못했습니다.</div>';
    }
  }

  async function toggleFollowFromButton(btn) {
    if (!btn) return;
    var targetUserId = btn.getAttribute('data-user-id');
    if (!targetUserId) return;

    btn.disabled = true;
    try {
      var nowFollowing = await toggleFollow(targetUserId);
      if (nowFollowing === null) return;
      setFollowButtonState(btn, nowFollowing);

      var myId =
        window.PickleMypage && window.PickleMypage.getCurrentUser
          ? window.PickleMypage.getCurrentUser()?.id
          : await getCurrentUserId();
      if (myId) await loadFollowStats(myId);
    } catch (err) {
      console.error('[P!CKLE Follows] toggle failed', err);
      alert(err.message || '픽 처리에 실패했습니다.');
    } finally {
      btn.disabled = false;
    }
  }

  async function syncDetailFollowButton(authorId) {
    var btn = document.getElementById('detailFollowBtn');
    if (!btn) return;

    var myId = await getCurrentUserId();
    if (!myId || !authorId || myId === authorId) {
      btn.hidden = true;
      return;
    }

    btn.hidden = false;
    btn.setAttribute('data-user-id', authorId);

    try {
      var following = await isFollowing(myId, authorId);
      setFollowButtonState(btn, following);
    } catch (err) {
      console.warn('[P!CKLE Follows] detail sync failed', err);
      setFollowButtonState(btn, false);
    }
  }

  function bindDetailFollowButton() {
    var btn = document.getElementById('detailFollowBtn');
    if (!btn || btn.dataset.followBound === '1') return;
    btn.dataset.followBound = '1';

    btn.addEventListener('click', async function () {
      var authorId = btn.getAttribute('data-user-id');
      if (!authorId) return;
      btn.disabled = true;
      try {
        var wasFollowing = await isFollowing(await getCurrentUserId(), authorId);
        var nowFollowing = await toggleFollow(authorId);
        if (nowFollowing === null) return;
        setFollowButtonState(btn, nowFollowing);
        bumpFollowStats(0, nowFollowing ? 1 : wasFollowing ? -1 : 0);
      } catch (err) {
        console.error('[P!CKLE Follows] detail toggle failed', err);
        alert(err.message || '픽 처리에 실패했습니다.');
      } finally {
        btn.disabled = false;
      }
    });
  }

  window.PickleFollows = {
    loadFollowStats: loadFollowStats,
    openFandomSheet: openFandomSheet,
    toggleFollow: toggleFollow,
    toggleFollowFromButton: toggleFollowFromButton,
    followUser: followUser,
    unfollowUser: unfollowUser,
    isFollowing: isFollowing,
    syncDetailFollowButton: syncDetailFollowButton,
    bindDetailFollowButton: bindDetailFollowButton,
    setFollowButtonState: setFollowButtonState,
    refreshMyFollowingSet: refreshMyFollowingSet,
    bumpFollowStats: bumpFollowStats,
  };

  window.openFandomSheet = openFandomSheet;
  window.toggleFollow = toggleFollowFromButton;

  document.addEventListener('DOMContentLoaded', function () {
    bindDetailFollowButton();
    var listEl = document.getElementById('fandomListContent');
    if (listEl) bindFandomListActions(listEl);
  });
})();
