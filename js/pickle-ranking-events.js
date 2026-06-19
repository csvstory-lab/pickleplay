/**
 * P!CKLE — 랭킹 이벤트 기록 (조회 · 공유 · 댓글 좋아요)
 * fire_score / star_score 트리거와 연동
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

    // partial unique index (post_id,user_id / post_id,viewer_key)는 PostgREST upsert onConflict 미지원 → insert + 중복 무시
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

  window.PickleRankingEvents = {
    recordPostView: recordPostView,
    recordPostShare: recordPostShare,
    recordCommentLike: recordCommentLike,
  };
})();
