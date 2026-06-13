/**
 * P!CKLE — 맞픽(팔로우) user_follows 연동
 */
(function () {
  'use strict';

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

  async function fetchUserMap(userIds) {
    var map = new Map();
    if (!userIds.length) return map;

    var sb = getSupabaseClient();
    if (!sb) return map;

    var result = await sb
      .from('users')
      .select('id, nickname, star_score, points')
      .in('id', userIds);

    if (result.error) {
      console.warn('[P!CKLE Follows] users fetch failed', result.error);
      return map;
    }

    (result.data || []).forEach(function (row) {
      if (row && row.id) map.set(String(row.id), row);
    });
    return map;
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

  function buildLevelBadge(userRow) {
    var pts = 0;
    if (userRow) {
      if (window.PickleProfile && window.PickleProfile.extractRankingPointsFromRow) {
        pts = window.PickleProfile.extractRankingPointsFromRow(userRow);
      } else {
        pts = Number(userRow.star_score ?? userRow.points) || 0;
      }
    }
    if (window.PickleProfile && window.PickleProfile.buildLevelBadgeFromPoints) {
      var html = window.PickleProfile.buildLevelBadgeFromPoints(pts);
      return html.replace('grade-badge', 'fandom-lvl');
    }
    return '<span class="fandom-lvl">Lv.1</span>';
  }

  function renderAvatarHtml(userRow, targetUserId, avatarMap) {
    var stored = avatarMap.get(String(targetUserId));
    if (stored) {
      if (stored.indexOf('<') !== -1) {
        return stored;
      }
      return escapeHtml(stored);
    }
    var nickname = userRow && userRow.nickname ? userRow.nickname : '픽';
    return escapeHtml(String(nickname).trim().charAt(0) || '🥒');
  }

  function renderFandomItem(userRow, targetUserId, listType, myId, avatarMap) {
    var nickname = userRow && userRow.nickname ? userRow.nickname : '픽클러';
    var isMine = myId && String(targetUserId) === String(myId);
    var iFollow = myFollowingSet.has(String(targetUserId));
    var avatarInner = renderAvatarHtml(userRow, targetUserId, avatarMap);

    var btnHtml = '';
    if (!isMine) {
      if (listType === 'following') {
        btnHtml =
          '<button type="button" class="btn-follow following" data-user-id="' +
          escapeHtml(targetUserId) +
          '" data-list-type="following" data-action="unfollow">픽 취소</button>';
      } else if (listType === 'follower') {
        if (iFollow) {
          btnHtml =
            '<button type="button" class="btn-follow following" data-user-id="' +
            escapeHtml(targetUserId) +
            '" data-list-type="follower" data-action="unfollow">픽 취소</button>';
        } else {
          btnHtml =
            '<button type="button" class="btn-follow match-pick follow" data-user-id="' +
            escapeHtml(targetUserId) +
            '" data-list-type="follower" data-action="match-pick">+맞픽</button>';
        }
      }
    }

    return (
      '<div class="fandom-item" data-user-id="' +
      escapeHtml(targetUserId) +
      '">' +
      '<div class="fandom-profile">' +
      '<div class="fandom-avatar">' +
      avatarInner +
      '</div>' +
      '<div class="fandom-name-wrap">' +
      '<div class="fandom-name">' +
      escapeHtml(nickname) +
      '</div>' +
      buildLevelBadge(userRow) +
      '</div></div>' +
      btnHtml +
      '</div>'
    );
  }

  function showFandomEmpty(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="fandom-empty">아직 목록이 없습니다.<br>먼저 픽클러를 찾아보세요!</div>';
  }

  async function renderFandomList(type, userId) {
    var sb = getSupabaseClient();
    if (!sb || !userId) return '';

    var myId = await getCurrentUserId();
    await refreshMyFollowingSet(myId);

    var rows = [];
    var userIds = [];

    if (type === 'follower') {
      var followerRes = await sb
        .from('user_follows')
        .select('follower_id, created_at')
        .eq('following_id', userId)
        .order('created_at', { ascending: false });
      if (followerRes.error) throw followerRes.error;
      rows = followerRes.data || [];
      userIds = rows.map(function (r) {
        return r.follower_id;
      });
    } else {
      var followingRes = await sb
        .from('user_follows')
        .select('following_id, created_at')
        .eq('follower_id', userId)
        .order('created_at', { ascending: false });
      if (followingRes.error) throw followingRes.error;
      rows = followingRes.data || [];
      userIds = rows.map(function (r) {
        return r.following_id;
      });
    }

    var userMap = await fetchUserMap(userIds);
    var avatarMap = await fetchAvatarHtmlMap(userIds);

    return rows
      .map(function (r) {
        var targetId = type === 'follower' ? r.follower_id : r.following_id;
        return renderFandomItem(
          userMap.get(String(targetId)),
          targetId,
          type,
          myId,
          avatarMap
        );
      })
      .join('');
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
