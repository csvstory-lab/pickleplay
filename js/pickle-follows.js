/**
 * P!CKLE — 맞픽(팔로우) user_follows 연동
 */
(function () {
  'use strict';

  var myFollowingSet = new Set();

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
      btn.classList.remove('follow');
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
      return window.PickleProfile.buildLevelBadgeFromPoints(pts);
    }
    return '<span class="fandom-lvl">Lv.1</span>';
  }

  function renderFandomItem(userRow, targetUserId, listType, myId) {
    var nickname = userRow && userRow.nickname ? userRow.nickname : '픽클러';
    var initial = escapeHtml(String(nickname).trim().charAt(0) || '🥒');
    var isMine = myId && String(targetUserId) === String(myId);
    var iFollow = myFollowingSet.has(String(targetUserId));

    var btnHtml = '';
    if (!isMine) {
      var pickLabel = listType === 'follower' && !iFollow ? '맞픽 하기' : '픽 하기';
      var btnClass = iFollow ? 'btn-follow following' : 'btn-follow follow';
      var btnLabel = iFollow ? '픽 취소' : pickLabel;
      btnHtml =
        '<button type="button" class="' +
        btnClass +
        '" data-user-id="' +
        escapeHtml(targetUserId) +
        '" onclick="PickleFollows.toggleFollowFromButton(this)">' +
        escapeHtml(btnLabel) +
        '</button>';
    }

    return (
      '<div class="fandom-item">' +
      '<div class="fandom-profile">' +
      '<div class="fandom-avatar">' +
      initial +
      '</div>' +
      '<div><div class="fandom-name">' +
      escapeHtml(nickname) +
      '</div>' +
      buildLevelBadge(userRow) +
      '</div></div>' +
      btnHtml +
      '</div>'
    );
  }

  async function renderFandomList(type, userId) {
    var sb = getSupabaseClient();
    if (!sb || !userId) return '';

    var myId = await getCurrentUserId();
    await refreshMyFollowingSet(myId);

    var rows = [];
    if (type === 'follower') {
      var followerRes = await sb
        .from('user_follows')
        .select('follower_id, created_at')
        .eq('following_id', userId)
        .order('created_at', { ascending: false });
      if (followerRes.error) throw followerRes.error;
      rows = followerRes.data || [];
      var followerIds = rows.map(function (r) {
        return r.follower_id;
      });
      var followerMap = await fetchUserMap(followerIds);
      return rows
        .map(function (r) {
          return renderFandomItem(
            followerMap.get(String(r.follower_id)),
            r.follower_id,
            'follower',
            myId
          );
        })
        .join('');
    }

    var followingRes = await sb
      .from('user_follows')
      .select('following_id, created_at')
      .eq('follower_id', userId)
      .order('created_at', { ascending: false });
    if (followingRes.error) throw followingRes.error;
    rows = followingRes.data || [];
    var followingIds = rows.map(function (r) {
      return r.following_id;
    });
    var followingMap = await fetchUserMap(followingIds);
    return rows
      .map(function (r) {
        return renderFandomItem(
          followingMap.get(String(r.following_id)),
          r.following_id,
          'following',
          myId
        );
      })
      .join('');
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

    if (typeof closeAllModals === 'function') closeAllModals();
    if (overlay) overlay.classList.add('open');
    sheet.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (titleEl) {
      titleEl.textContent =
        type === 'follower'
          ? '나를 픽한 픽클러 (팔로워)'
          : '내가 픽한 픽클러 (팔로잉)';
    }

    contentEl.innerHTML =
      '<div class="empty-state" style="padding:30px 10px;">불러오는 중…</div>';

    try {
      var html = await renderFandomList(type, userId);
      contentEl.innerHTML = html
        ? html
        : '<div class="empty-state" style="padding:30px 10px;">아직 목록이 없습니다.</div>';
    } catch (err) {
      console.error('[P!CKLE Follows] fandom list failed', err);
      contentEl.innerHTML =
        '<div class="empty-state" style="padding:30px 10px;">목록을 불러오지 못했습니다.</div>';
    }
  }

  async function toggleFollow(targetUserId) {
    var sb = getSupabaseClient();
    if (!sb) throw new Error('Supabase 연결 실패');

    var myId = await getCurrentUserId();
    if (!myId) {
      alert('로그인이 필요합니다.');
      return null;
    }
    if (!targetUserId || myId === targetUserId) return null;

    var already = await isFollowing(myId, targetUserId);

    if (already) {
      var del = await sb
        .from('user_follows')
        .delete()
        .eq('follower_id', myId)
        .eq('following_id', targetUserId);
      if (del.error) throw del.error;
      myFollowingSet.delete(String(targetUserId));
      return false;
    }

    var ins = await sb.from('user_follows').insert({
      follower_id: myId,
      following_id: targetUserId,
    });
    if (ins.error) throw ins.error;
    myFollowingSet.add(String(targetUserId));
    return true;
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
        var nowFollowing = await toggleFollow(authorId);
        if (nowFollowing === null) return;
        setFollowButtonState(btn, nowFollowing);
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
    isFollowing: isFollowing,
    syncDetailFollowButton: syncDetailFollowButton,
    bindDetailFollowButton: bindDetailFollowButton,
    setFollowButtonState: setFollowButtonState,
    refreshMyFollowingSet: refreshMyFollowingSet,
  };

  window.openFandomSheet = openFandomSheet;
  window.toggleFollow = toggleFollowFromButton;

  document.addEventListener('DOMContentLoaded', function () {
    bindDetailFollowButton();
  });
})();
