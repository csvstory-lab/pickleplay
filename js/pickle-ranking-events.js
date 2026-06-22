/**
 * P!CKLE — 랭킹 이벤트 기록 (조회 · 공유 · 좋아요)
 * fire_score 트리거 + star_score 가이드 지급(updateUserScore) 연동
 */
(function () {
  'use strict';

  var viewDedupe = new Set();

  function getClient() {
    if (!window.PickleSupabase || !window.PickleSupabase.getClient) return null;
    return window.PickleSupabase.getClient();
  }

  function getViewerKey() {
    try {
      var key = 'pickle_viewer_' + (window.location.hostname || 'local');
      var stored = localStorage.getItem(key);
      if (stored) return stored;
      stored =
        'v_' +
        Date.now().toString(36) +
        '_' +
        Math.random().toString(36).slice(2, 10);
      localStorage.setItem(key, stored);
      return stored;
    } catch (e) {
      return 'anon';
    }
  }

  async function getAuthUserId() {
    var sb = getClient();
    if (!sb) return null;
    try {
      var session = await sb.auth.getSession();
      return session.data.session?.user?.id || null;
    } catch (e) {
      return null;
    }
  }

  function isDuplicateDbError(error) {
    if (!error) return false;
    if (error.code === '23505') return true;
    if (Number(error.status) === 409) return true;
    var msg = String(error.message || error.details || '').toLowerCase();
    return msg.indexOf('duplicate') !== -1 || msg.indexOf('unique') !== -1;
  }

  async function recordPostView(postId) {
    if (!postId) return;
    var dedupeKey = String(postId) + ':view';
    if (viewDedupe.has(dedupeKey)) return;
    viewDedupe.add(dedupeKey);

    var sb = getClient();
    if (!sb) return;

    var userId = await getAuthUserId();
    var viewerKey = getViewerKey();
    var row = {
      post_id: postId,
      viewer_key: viewerKey,
    };

    if (userId) {
      row.user_id = userId;
      row.viewer_id = userId;
    }

    var insertResult = await sb.from('post_views').insert(row);
    if (!insertResult.error) return;
    if (isDuplicateDbError(insertResult.error)) return;

    console.warn('[P!CKLE Ranking] post view record failed', insertResult.error);
  }

  async function recordPostShare(postId, channel) {
    if (!postId) return;

    var sb = getClient();
    if (!sb) return;

    var userId = await getAuthUserId();
    var row = {
      post_id: postId,
      share_channel: channel || 'unknown',
    };
    if (userId) row.user_id = userId;

    var result = await sb.from('post_shares').insert(row);
    if (result.error) {
      console.warn('[P!CKLE Ranking] post share record failed', result.error);
      return;
    }

    if (window.PickleProfile && window.PickleProfile.tryAwardPostAuthorFromPostIdFireAndForget) {
      window.PickleProfile.tryAwardPostAuthorFromPostIdFireAndForget(postId, 'SHARE');
    }
  }

  async function recordCommentLike(commentId) {
    if (!commentId) return false;

    var sb = getClient();
    if (!sb) return false;

    var userId = await getAuthUserId();
    if (!userId) return false;

    var result = await sb.from('comment_likes').insert({
      comment_id: commentId,
      user_id: userId,
    });

    if (result.error) {
      if (result.error.code === '23505') return false;
      console.warn('[P!CKLE Ranking] comment like failed', result.error);
      return false;
    }
    return true;
  }

  async function recordPostLike(postId) {
    if (!postId) return false;

    var sb = getClient();
    if (!sb) return false;

    var userId = await getAuthUserId();
    if (!userId) return false;

    var insertResult = await sb.from('post_likes').insert({
      post_id: postId,
      user_id: userId,
    });

    if (insertResult.error) {
      if (isDuplicateDbError(insertResult.error)) return false;
      console.warn('[P!CKLE Ranking] post like record failed', insertResult.error);
      return false;
    }

    var postResult = await sb
      .from('posts')
      .select('author_id, like_count')
      .eq('id', postId)
      .maybeSingle();

    var post = postResult.data;
    if (!post || !post.author_id) return true;

    var currentLikes = Number(post.like_count);
    if (!Number.isFinite(currentLikes) || currentLikes < 1) currentLikes = 1;

    if (window.PickleProfile && window.PickleProfile.updateUserScore) {
      await window.PickleProfile.updateUserScore(post.author_id, 'LIKE_MILESTONE', {
        postId: postId,
        currentLikes: currentLikes,
      });
    }

    return true;
  }

  window.PickleRankingEvents = {
    recordPostView: recordPostView,
    recordPostShare: recordPostShare,
    recordCommentLike: recordCommentLike,
    recordPostLike: recordPostLike,
  };
})();
