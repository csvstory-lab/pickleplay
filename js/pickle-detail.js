/**
 * P!CKLE — 불판 상세 (?id=UUID) · posts / pickle_posts
 */
(function () {
  'use strict';

  var currentPost = null;
  var timerInterval = null;
  var currentPostId = null;
  var likedCommentIdSet = Object.create(null);
  var openInlineReplyParentId = null;
  var commentListDelegationBound = false;
  var commentFormBound = false;
  var replySubmitInFlight = false;
  var commentSubmitInFlight = false;
  var commentByIdCache = Object.create(null);

  function categoryDisplay(category) {
    var slug = String(category || '').trim().toLowerCase();
    if (!slug) return '불판';
    if (window.PickleCategories && window.PickleCategories.resolveCategoryName) {
      return window.PickleCategories.resolveCategoryName(slug);
    }
    return slug;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return window.PickleMediaView
      ? window.PickleMediaView.escapeHtml(str)
      : String(str ?? '');
  }

  function getSharedSupabaseClient() {
    if (window.PickleAuth && window.PickleAuth.getClient) {
      try {
        return window.PickleAuth.getClient();
      } catch (e) {
        /* fall through */
      }
    }
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.getClient) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
  }

  async function getAuthUserForAction() {
    try {
      if (window.PickleAuth && window.PickleAuth.ensureAuthenticated) {
        var auth = await window.PickleAuth.ensureAuthenticated({ timeoutMs: 5000 });
        return auth && auth.user ? auth.user : null;
      }
      if (window.PickleAuth && window.PickleAuth.resolveAuthUser) {
        return await window.PickleAuth.resolveAuthUser();
      }
    } catch (err) {
      console.warn('[P!CKLE Detail] auth resolve failed', err);
    }
    return null;
  }

  function isSessionMissingError(err) {
    if (window.PickleAuth && window.PickleAuth.isSessionMissingError) {
      return window.PickleAuth.isSessionMissingError(err);
    }
    var msg = String(err && err.message ? err.message : err || '').toLowerCase();
    return msg.indexOf('auth session missing') !== -1 || msg.indexOf('session missing') !== -1;
  }

  function isAuthRelatedDbError(err) {
    if (!err) return false;
    var code = String(err.code || '');
    var msg = String(err.message || err || '').toLowerCase();
    return (
      code === '42501' ||
      code === 'PGRST301' ||
      msg.indexOf('row-level security') !== -1 ||
      msg.indexOf('jwt') !== -1 ||
      msg.indexOf('not authenticated') !== -1 ||
      msg.indexOf('auth session') !== -1 ||
      msg.indexOf('session missing') !== -1
    );
  }

  function isProfileMissingDbError(err) {
    if (!err) return false;
    var code = String(err.code || '');
    var msg = String(err.message || err || '').toLowerCase();
    return (
      code === '23503' &&
      (msg.indexOf('users') !== -1 || msg.indexOf('user_id') !== -1)
    );
  }

  function alertLoginRequired(message, onRedirect) {
    if (window.PickleOAuthCallbackGuard && window.PickleOAuthCallbackGuard.promptLoginRequired) {
      return window.PickleOAuthCallbackGuard.promptLoginRequired(message, onRedirect);
    }
    var isOAuthCallback =
      window.location.hash.indexOf('access_token=') !== -1 ||
      window.location.hash.indexOf('type=recovery') !== -1;
    if (isOAuthCallback) {
      return false;
    }
    if (window.PickleAuth && window.PickleAuth.alertLoginRequired) {
      return window.PickleAuth.alertLoginRequired(message, onRedirect);
    }
    alert(message);
    if (typeof onRedirect === 'function') {
      onRedirect();
    }
    return true;
  }

  function getPostIdFromUrl() {
    return new URLSearchParams(window.location.search).get('id');
  }

  function mapMediaTypeToMode(mediaType) {
    if (!mediaType || mediaType === 'none') return 'text';
    if (mediaType === 'dual' || mediaType === 'video_dual') return 'vs';
    if (mediaType === 'single' || mediaType === 'video') return 'single';
    return 'text';
  }

  function normalizePicklePostsRow(row) {
    return Object.assign(
      {
        id: row.id,
        title: row.title || '',
        category: row.category,
        option_a: row.option_a || '',
        option_b: row.option_b || '',
        description: row.description || null,
        media_url_1: row.media_url_1,
        media_url_2: row.media_url_2,
        media_mode: row.media_mode || 'text',
        media_type: row.media_mode,
        layout_style: row.media_orientation || row.layout_style,
        hashtags: row.hashtags || row.tags || '',
        tags: row.tags || row.hashtags || '',
        created_at: row.created_at,
        duration: row.duration,
        expires_at: row.expires_at || row.end_at || row.end_date || null,
        start_at: row.start_at,
        end_at: row.end_at || row.end_date,
        end_date: row.end_date || row.end_at,
        media_layout: row.media_layout || row.layout_style || 'horizontal',
        authorNickname: null,
        author_nickname: '',
        author_avatar_html: '',
      },
      resolveAuthorFieldsFromRow(row)
    );
  }

  function resolveAuthorFieldsFromRow(row) {
    var nickname = row.author_nickname ? String(row.author_nickname).trim() : '';
    var avatarHtml = row.author_avatar_html ? String(row.author_avatar_html).trim() : '';
    if (!nickname && row.users && row.users.nickname) {
      nickname = String(row.users.nickname).trim();
    }
    var authorPoints = null;
    if (row.users && window.PickleProfile && window.PickleProfile.extractRankingPointsFromRow) {
      var userRow = Array.isArray(row.users) ? row.users[0] : row.users;
      authorPoints = window.PickleProfile.extractRankingPointsFromRow(userRow);
    }
    return {
      author_id: row.author_id || row.user_id || null,
      author_ranking_points: authorPoints,
      author_nickname: nickname,
      author_avatar_html: avatarHtml,
      authorNickname: nickname || null,
    };
  }

  /** 로그인 유저 메타데이터 → comments.author_nickname / author_avatar_html */
  function extractCommentAuthorSnapshot(user) {
    var meta = (user && user.user_metadata) || {};
    var nickname = meta.nickname ? String(meta.nickname).trim() : '';

    if (!nickname && user && user.email) {
      nickname = String(user.email).split('@')[0] || '';
    }
    if (!nickname) {
      nickname = '픽클러';
    }

    var avatarHtml = '';
    if (meta.avatar_html && String(meta.avatar_html).trim()) {
      avatarHtml = String(meta.avatar_html).trim();
    } else if (meta.avatar_emoji && String(meta.avatar_emoji).trim()) {
      avatarHtml = String(meta.avatar_emoji).trim();
    } else {
      var avatarUrl = meta.avatar_url || meta.picture || meta.avatar || '';
      if (avatarUrl) {
        avatarHtml =
          '<img src="' +
          String(avatarUrl).replace(/"/g, '&quot;') +
          '" alt="">';
      } else {
        avatarHtml = '🥒';
      }
    }

    return {
      author_nickname: nickname,
      author_avatar_html: avatarHtml,
    };
  }

  function normalizeCommentRow(row) {
    if (!row) return row;

    var nickname = row.author_nickname ? String(row.author_nickname).trim() : '';
    var avatarHtml = row.author_avatar_html ? String(row.author_avatar_html).trim() : '';

    if (!nickname && row.users && row.users.nickname) {
      nickname = String(row.users.nickname).trim();
    }

    row.author_nickname = nickname || null;
    row.author_avatar_html = avatarHtml || null;
    row.parent_id = row.parent_id || null;
    row.like_count = Number(row.like_count);
    if (!Number.isFinite(row.like_count) || row.like_count < 0) row.like_count = 0;
    return row;
  }

  function isCommentSchemaColumnError(error) {
    if (!error) return false;
    var msg = String(error.message || '').toLowerCase();
    return (
      msg.indexOf('author_nickname') !== -1 ||
      msg.indexOf('author_avatar_html') !== -1 ||
      msg.indexOf('parent_id') !== -1 ||
      msg.indexOf('like_count') !== -1 ||
      msg.indexOf('column') !== -1 ||
      msg.indexOf('could not find') !== -1 ||
      error.code === '42703' ||
      error.code === 'PGRST204'
    );
  }

  function isCommentAuthorSnapshotColumnError(error) {
    if (!error) return false;
    var msg = String(error.message || '').toLowerCase();
    return (
      msg.indexOf('author_nickname') !== -1 ||
      msg.indexOf('author_avatar_html') !== -1
    );
  }

  function isCommentParentIdColumnError(error) {
    if (!error) return false;
    var msg = String(error.message || '').toLowerCase();
    return msg.indexOf('parent_id') !== -1;
  }

  function normalizePostsRow(row) {
    return Object.assign(
      {
        id: row.id,
        title: row.title || '',
        category: row.category,
        option_a: row.option_a_name || '',
        option_b: row.option_b_name || '',
        description: row.description || null,
        media_url_1: row.media_url_1 || row.option_a_image_url,
        media_url_2: row.media_url_2 || row.option_b_image_url,
        thumbnail_url: row.thumbnail_url || null,
        media_mode: mapMediaTypeToMode(row.media_type),
        media_type: row.media_type,
        layout_style: row.layout_style,
        media_layout: row.media_layout || row.layout_style || 'horizontal',
        hashtags: row.hashtags || row.tags || '',
        tags: row.tags || row.hashtags || '',
        created_at: row.created_at,
        duration: row.duration,
        expires_at: row.expires_at || row.end_at || row.end_date || null,
        start_at: row.start_at,
        end_at: row.end_at || row.end_date,
        end_date: row.end_date || row.end_at,
      },
      resolveAuthorFieldsFromRow(row)
    );
  }

  async function ensurePostAuthorRankingPoints(post) {
    if (!post) return post;
    if (post.author_ranking_points != null) return post;
    if (!post.author_id || !window.PickleProfile || !window.PickleProfile.fetchRankingPoints) {
      return post;
    }
    try {
      var sb = window.PickleSupabase.getClient();
      post.author_ranking_points = await window.PickleProfile.fetchRankingPoints(
        sb,
        post.author_id
      );
    } catch (err) {
      console.warn('[P!CKLE Detail] 작성자 레벨 포인트 조회 실패', err);
      post.author_ranking_points = 0;
    }
    return post;
  }

  function safeTagsValue(post) {
    if (!post) return '';
    var raw = post.tags;
    if (raw === null || raw === undefined || raw === '') {
      raw = post.hashtags;
    }
    if (raw === null || raw === undefined) return '';
    return String(raw);
  }

  function formatHashtags(raw) {
    if (!raw) return [];
    return String(raw)
      .split(/\s+/)
      .map(function (tag) {
        tag = tag.trim();
        if (!tag) return '';
        return tag.startsWith('#') ? tag : '#' + tag;
      })
      .filter(Boolean)
      .slice(0, 5);
  }

  function firstEmoji(text) {
    var m = String(text || '').match(/(\p{Extended_Pictographic})/u);
    return m ? m[1] : '🔥';
  }

  function getRemainingTime(expiresAt) {
    if (expiresAt == null || expiresAt === '') return '⏳ 마감된 불판';

    var expireDate = new Date(expiresAt);
    if (Number.isNaN(expireDate.getTime())) return '⏳ 마감된 불판';

    var now = new Date();
    var diffMs = expireDate.getTime() - now.getTime();

    if (diffMs <= 0) return '⏳ 종료된 불판';

    var diffMins = Math.floor(diffMs / (1000 * 60));
    var diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return '⏳ ' + diffMins + '분 남음';
    if (diffHours < 24) return '⏳ ' + diffHours + '시간 남음';
    return '⏳ ' + diffDays + '일 남음';
  }

  function formatDetailRemainingTime(expiresAt) {
    if (expiresAt == null || expiresAt === '') return '마감된 불판';

    var expireDate = new Date(expiresAt);
    if (Number.isNaN(expireDate.getTime())) return '마감된 불판';

    var diffMs = expireDate.getTime() - Date.now();
    if (diffMs <= 0) return '종료된 불판';

    var totalMins = Math.floor(diffMs / (1000 * 60));
    var days = Math.floor(totalMins / (60 * 24));
    if (days >= 1) return days + '일 남음';

    var hours = Math.floor(totalMins / 60);
    var mins = totalMins % 60;
    return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0') + ' 남음';
  }

  function parseExpiresAt(post) {
    if (!post) return null;
    var raw = post.expires_at || post.end_date || post.end_at || null;
    if (raw == null || raw === '') return null;
    var endDate = new Date(raw);
    return Number.isNaN(endDate.getTime()) ? null : endDate;
  }

  function formatCountdown(expiresAt) {
    return getRemainingTime(expiresAt);
  }

  function startTimer(post) {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    var expiresRaw =
      post &&
      (post.expires_at || post.end_date || post.end_at || null);
    var endsAt = parseExpiresAt(post);
    var timerEl = $('detailTimer');
    if (!timerEl) return;

    function tick() {
      timerEl.textContent = formatDetailRemainingTime(expiresRaw);
      if (endsAt && endsAt.getTime() - Date.now() <= 0) {
        timerEl.classList.add('is-ended');
      } else {
        timerEl.classList.remove('is-ended');
      }
    }

    tick();
    if (endsAt) {
      timerInterval = setInterval(tick, 30000);
    }
  }

  function formatCommentTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    var sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return '방금 전';
    if (sec < 3600) return Math.floor(sec / 60) + '분 전';
    if (sec < 86400) return Math.floor(sec / 3600) + '시간 전';
    if (sec < 604800) return Math.floor(sec / 86400) + '일 전';
    return d.toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function commentAuthorLabel(comment) {
    if (comment && comment.author_nickname && String(comment.author_nickname).trim()) {
      return String(comment.author_nickname).trim();
    }
    if (comment && comment.users && comment.users.nickname) {
      return String(comment.users.nickname).trim();
    }
    return '픽클러';
  }

  function commentAuthorAvatarInner(comment) {
    var raw =
      comment && comment.author_avatar_html
        ? String(comment.author_avatar_html).trim()
        : '';
    if (!raw) return escapeHtml('🥒');
    if (raw.indexOf('<') !== -1) return raw;
    return escapeHtml(raw);
  }

  function isCommentLiked(commentId) {
    return !!likedCommentIdSet[commentId];
  }

  function setCommentLiked(commentId, liked) {
    if (liked) likedCommentIdSet[commentId] = true;
    else delete likedCommentIdSet[commentId];
  }

  function buildCommentTree(comments) {
    var byId = Object.create(null);
    var parents = [];
    var repliesByParent = Object.create(null);

    (comments || []).forEach(function (comment) {
      if (comment && comment.id) byId[comment.id] = comment;
    });

    function getThreadRootId(comment) {
      var current = comment;
      var guard = 0;
      while (current && current.parent_id && byId[current.parent_id] && guard < 50) {
        current = byId[current.parent_id];
        guard += 1;
      }
      return current ? current.id : comment.id;
    }

    (comments || []).forEach(function (comment) {
      if (comment.parent_id) {
        var rootId = getThreadRootId(comment);
        if (!repliesByParent[rootId]) {
          repliesByParent[rootId] = [];
        }
        repliesByParent[rootId].push(comment);
      } else {
        parents.push(comment);
      }
    });

    parents.sort(function (a, b) {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    Object.keys(repliesByParent).forEach(function (parentId) {
      repliesByParent[parentId].sort(function (a, b) {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    });

    return { parents: parents, repliesByParent: repliesByParent };
  }

  function renderCommentActionsHtml(comment, options) {
    options = options || {};
    var cName = commentAuthorLabel(comment);
    var likeCount = Number(comment.like_count);
    if (!Number.isFinite(likeCount) || likeCount < 0) likeCount = 0;
    var liked = isCommentLiked(comment.id);
    var likeClass = liked ? ' comment-like-btn is-liked' : ' comment-like-btn';
    var replyBtn =
      '<button type="button" class="comment-action-btn comment-reply-btn" data-comment-id="' +
      escapeHtml(comment.id) +
      '" data-author-name="' +
      escapeHtml(cName) +
      '">💬 답글</button>';

    return (
      '<div class="comment-actions">' +
      '<button type="button" class="comment-action-btn' +
      likeClass +
      '" data-comment-id="' +
      escapeHtml(comment.id) +
      '">❤️ <span class="comment-like-count">' +
      likeCount.toLocaleString() +
      '</span></button>' +
      replyBtn +
      '</div>'
    );
  }
// 👉 [수정 1] 팝업창 생성을 위해 프로필에 ID 및 닉네임 데이터 심기 및 커서 포인터 추가
function renderCommentItemHtml(comment, options) {
  options = options || {};
  var blinded =
    window.PickleCommentClean && window.PickleCommentClean.isCommentBlinded
      ? window.PickleCommentClean.isCommentBlinded(comment)
      : comment.is_blind === true || comment.visibility_status === 'blinded';
  var body =
    window.PickleCommentClean && window.PickleCommentClean.getDisplayBody
      ? window.PickleCommentClean.getDisplayBody(comment)
      : blinded
        ? '🚫 관리자 및 규정 위반 신고에 의해 블라인드 처리된 댓글입니다.'
        : comment.filtered_content || comment.content || '';
  var textClass = blinded ? 'comment-text comment-text--blinded' : 'comment-text';
  var isReply = !!options.isReply;
  var itemClass = isReply ? 'comment-item comment-item--reply' : 'comment-item';
  var replyMarker = isReply
    ? '<span class="comment-reply-marker" aria-hidden="true">↳</span>'
    : '';

  // 👇 여기에 실제 유저 ID와 닉네임을 가져오는 로직 추가
  var cUid = comment.user_id || '';
  var cName = commentAuthorLabel(comment);

  return (
    '<div class="' +
    itemClass +
    '" id="comment-' +
    escapeHtml(comment.id) +
    '" data-comment-id="' +
    escapeHtml(comment.id) +
    '" data-user-id="' + 
    escapeHtml(cUid) + 
    '" data-author-name="' + 
    escapeHtml(cName) + 
    '">' +
    '<div class="author-pic" style="width: 36px; height: 36px; font-size: 1rem; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:50%; cursor:pointer;">' +
    commentAuthorAvatarInner(comment) +
    '</div>' +
    '<div class="comment-content">' +
    '<div class="comment-user">' +
    replyMarker +
    '<span style="cursor:pointer;">' +
    escapeHtml(cName) +
    '</span><span style="font-size:0.7rem;color:#71717a;">' +
    escapeHtml(formatCommentTime(comment.created_at)) +
    '</span></div>' +
    '<div class="' +
    textClass +
    '">' +
    escapeHtml(body) +
    '</div>' +
    renderCommentActionsHtml(comment, options) +
    '</div>' +
    '</div>'
  );
}

  function renderCommentThreadHtml(parent, repliesByParent) {
    var replies = repliesByParent[parent.id] || [];
    var repliesHtml = replies
      .map(function (reply) {
        return renderCommentItemHtml(reply, { isReply: true });
      })
      .join('');

    return (
      '<div class="comment-thread" data-thread-id="' +
      escapeHtml(parent.id) +
      '">' +
      renderCommentItemHtml(parent, { isReply: false }) +
      (repliesHtml
        ? '<div class="comment-replies">' + repliesHtml + '</div>'
        : '') +
      '</div>'
    );
  }

  var COMMENT_SELECT_VARIANTS = [
    'id, content, filtered_content, created_at, user_id, parent_id, like_count, visibility_status, author_nickname, author_avatar_html',
    'id, content, filtered_content, created_at, user_id, parent_id, like_count, visibility_status, users:user_id ( nickname )',
    'id, content, filtered_content, created_at, user_id, parent_id, like_count, author_nickname, author_avatar_html',
    'id, content, filtered_content, created_at, user_id, parent_id, like_count, users:user_id ( nickname )',
    'id, content, filtered_content, created_at, user_id, author_nickname, author_avatar_html',
    'id, content, filtered_content, created_at, user_id, users:user_id ( nickname )',
  ];

  async function fetchMyLikedCommentIds(sb, userId, commentIds) {
    likedCommentIdSet = Object.create(null);
    if (!userId || !commentIds || !commentIds.length) return;

    try {
      var result = await sb
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', userId)
        .in('comment_id', commentIds);

      if (result.error) {
        console.warn('[P!CKLE Detail] comment_likes 조회 실패', result.error);
        return;
      }

      (result.data || []).forEach(function (row) {
        if (row && row.comment_id) likedCommentIdSet[row.comment_id] = true;
      });
    } catch (err) {
      console.warn('[P!CKLE Detail] comment_likes 조회 예외', err);
    }
  }

  async function fetchCommentsList(sb, postId) {
    var lastError = null;

    for (var i = 0; i < COMMENT_SELECT_VARIANTS.length; i++) {
      var query = sb
        .from('comments')
        .select(COMMENT_SELECT_VARIANTS[i])
        .eq('post_id', postId);

      if (COMMENT_SELECT_VARIANTS[i].indexOf('visibility_status') !== -1) {
        query = query.in('visibility_status', ['visible', 'blinded']);
      }

      var result = await query.order('created_at', { ascending: true });

      if (!result.error) {
        return (result.data || []).map(normalizeCommentRow);
      }

      lastError = result.error;

      if (!isCommentSchemaColumnError(result.error)) {
        throw result.error;
      }
    }

    throw lastError || new Error('댓글을 불러오지 못했습니다.');
  }

  function updateCommentLikeButton(btn, likeCount, liked) {
    if (!btn) return;
    btn.classList.toggle('is-liked', !!liked);
    var countEl = btn.querySelector('.comment-like-count');
    if (countEl) countEl.textContent = Number(likeCount || 0).toLocaleString();
  }

  async function toggleCommentLike(commentId, btnEl) {
    if (!commentId) return;
    if (btnEl && btnEl.dataset.likePending === '1') return;

    var sb = window.PickleSupabase.getClient();
    var user = await getAuthUserForAction();
    if (!user) {
      alertLoginRequired('좋아요를 누르려면 로그인이 필요합니다.');
      return;
    }

    var userId = user.id;
    var currentlyLiked = isCommentLiked(commentId);
    var countEl = btnEl ? btnEl.querySelector('.comment-like-count') : null;
    var currentCount = countEl ? Number(String(countEl.textContent || '0').replace(/,/g, '')) : 0;
    if (!Number.isFinite(currentCount)) currentCount = 0;

    var nextLiked = !currentlyLiked;
    var nextCount = nextLiked
      ? currentCount + 1
      : Math.max(0, currentCount - 1);

    setCommentLiked(commentId, nextLiked);
    updateCommentLikeButton(btnEl, nextCount, nextLiked);
    if (btnEl) btnEl.dataset.likePending = '1';

    try {
      if (currentlyLiked) {
        var delResult = await sb
          .from('comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', userId);

        if (delResult.error) throw delResult.error;
      } else {
        var insResult = await sb.from('comment_likes').insert({
          comment_id: commentId,
          user_id: userId,
        });

        if (insResult.error) {
          if (insResult.error.code === '23505') {
        setCommentLiked(commentId, true);
        updateCommentLikeButton(btnEl, Math.max(currentCount, nextCount), true);
        return;
          }
          throw insResult.error;
        }

        if (window.PickleRankingEvents && window.PickleRankingEvents.recordCommentLike) {
          window.PickleRankingEvents.recordCommentLike(commentId);
        }
      }
    } catch (err) {
      setCommentLiked(commentId, currentlyLiked);
      updateCommentLikeButton(btnEl, currentCount, currentlyLiked);
      console.error('[P!CKLE Detail] 댓글 좋아요 토글 실패', err);
      alert('좋아요 처리에 실패했습니다. ' + (err.message || String(err)));
    } finally {
      if (btnEl) delete btnEl.dataset.likePending;
    }
  }

  function buildCommentNotificationLink(postId, commentId) {
    var link = 'detail.html?id=' + encodeURIComponent(postId);
    if (commentId) {
      link += '#comment-' + encodeURIComponent(commentId);
    }
    return link;
  }

  async function deliverNotification(sb, payload) {
    if (!sb || !payload || !payload.userId || !payload.message) return false;

    var notiType = payload.type || 'comment';
    var linkUrl = payload.linkUrl || null;

    var insertRes = await sb.from('notifications').insert({
      user_id: payload.userId,
      type: notiType,
      message: payload.message,
      link_url: linkUrl,
    });

    if (!insertRes.error) return true;

    console.error('알림 전송 실패:', insertRes.error);

    var rpcRes = await sb.rpc('pickle_insert_notification', {
      p_user_id: payload.userId,
      p_type: notiType,
      p_message: payload.message,
      p_link_url: linkUrl,
    });

    if (!rpcRes.error) return true;

    console.error('[P!CKLE Detail] 알림 RPC 실패:', rpcRes.error);

    if (notiType === 'reply') {
      var fallbackRes = await sb.rpc('pickle_insert_notification', {
        p_user_id: payload.userId,
        p_type: 'comment',
        p_message: payload.message,
        p_link_url: linkUrl,
      });

      if (!fallbackRes.error) return true;
      console.error('[P!CKLE Detail] 알림 RPC(comment fallback) 실패:', fallbackRes.error);
    }

    return false;
  }

  async function resolveParentCommentAuthor(sb, parentId) {
    if (!parentId) return null;

    var cached = commentByIdCache[parentId];
    if (cached && cached.user_id) return cached.user_id;

    var parentRes = await sb
      .from('comments')
      .select('user_id')
      .eq('id', parentId)
      .single();

    if (parentRes.error) {
      console.error('알림 전송 실패: 부모 댓글 조회 실패', parentRes.error);
      return null;
    }

    if (!parentRes.data || !parentRes.data.user_id) {
      console.error('알림 전송 실패: 부모 댓글 작성자를 찾을 수 없습니다.');
      return null;
    }

    return parentRes.data.user_id;
  }

  async function sendReplyNotification(sb, parentId, newCommentId, currentUserId) {
    if (!sb || !parentId || !newCommentId || !currentUserId || !currentPostId) return;

    var parentAuthorId = await resolveParentCommentAuthor(sb, parentId);
    if (!parentAuthorId || parentAuthorId === currentUserId) return;

    await deliverNotification(sb, {
      userId: parentAuthorId,
      type: 'reply',
      message: '내 댓글에 답글이 달렸습니다.',
      linkUrl: buildCommentNotificationLink(currentPostId, newCommentId),
    });
  }

  function setReplySubmitButtonsDisabled(disabled, activeBtn) {
    document.querySelectorAll('.comment-inline-reply-submit').forEach(function (btn) {
      btn.disabled = disabled;
      btn.textContent = disabled && btn === activeBtn ? '등록 중…' : '등록';
    });
  }

  function closeInlineReplyForm() {
    document.querySelectorAll('.comment-inline-reply-form').forEach(function (form) {
      form.remove();
    });
    openInlineReplyParentId = null;
  }

  function buildInlineReplyFormHtml(parentId) {
    return (
      '<div class="comment-inline-reply-form" data-parent-id="' +
      escapeHtml(parentId) +
      '">' +
      '<input type="text" class="comment-inline-reply-input" maxlength="2000" placeholder="답글을 입력하세요...">' +
      '<button type="button" class="comment-inline-reply-submit" data-parent-id="' +
      escapeHtml(parentId) +
      '">등록</button>' +
      '<button type="button" class="comment-inline-reply-cancel">취소</button>' +
      '</div>'
    );
  }

  function openInlineReplyForm(parentId, anchorItem) {
    if (!parentId || !anchorItem) return;

    var existing = document.querySelector('.comment-inline-reply-form');
    if (
      existing &&
      existing.getAttribute('data-parent-id') === String(parentId)
    ) {
      closeInlineReplyForm();
      return;
    }

    closeInlineReplyForm();

    var wrapper = document.createElement('div');
    wrapper.innerHTML = buildInlineReplyFormHtml(parentId);
    var form = wrapper.firstElementChild;
    if (!form) return;

    anchorItem.insertAdjacentElement('afterend', form);
    openInlineReplyParentId = parentId;

    var input = form.querySelector('.comment-inline-reply-input');
    if (input) {
      input.focus({ preventScroll: false });
    }
  }

  function focusMainCommentInput() {
    var lockScreen = $('commentLock');
    var activeArea = $('commentActive');
    if (lockScreen) lockScreen.style.display = 'none';
    if (activeArea) activeArea.classList.add('show');
  }

  function startReplyToComment(commentId, replyBtn) {
    if (!commentId) return;

    focusMainCommentInput();

    var commentItem = replyBtn ? replyBtn.closest('.comment-item') : null;
    if (!commentItem) {
      commentItem = document.getElementById('comment-' + commentId);
    }
    if (!commentItem) return;

    openInlineReplyForm(commentId, commentItem);
  }

  async function submitReply(parentId) {
    if (!parentId || !currentPostId || replySubmitInFlight) return;

    var form = document.querySelector(
      '.comment-inline-reply-form[data-parent-id="' +
        String(parentId).replace(/"/g, '') +
        '"]'
    );
    if (!form) return;

    var inputEl = form.querySelector('.comment-inline-reply-input');
    var submitBtn = form.querySelector('.comment-inline-reply-submit');
    var rawText = inputEl ? inputEl.value : '';

    if (!rawText.trim()) {
      alert('답글 내용을 입력해주세요.');
      return;
    }

    var supabase = window.PickleSupabase.getClient();
    var prepared = { ok: true, text: rawText.trim(), wasMasked: false };
    if (window.PickleCommentClean && window.PickleCommentClean.prepareCommentForInsert) {
      prepared = await window.PickleCommentClean.prepareCommentForInsert(rawText, supabase);
      if (!prepared.ok) return;
    } else if (window.PickleCommentClean && window.PickleCommentClean.blockCommentOnSubmit) {
      if (await window.PickleCommentClean.blockCommentOnSubmit(rawText, supabase)) return;
      prepared.text = rawText.trim();
    }

    var text = prepared.text;

    var currentUser = await getAuthUserForAction();
    if (currentUser && window.PickleUserSanction && window.PickleUserSanction.checkCommentSubmitSanction) {
      var sanctionCheck = await window.PickleUserSanction.checkCommentSubmitSanction(
        currentUser,
        supabase
      );
      if (sanctionCheck.blocked) return;
    }

    replySubmitInFlight = true;
    setReplySubmitButtonsDisabled(true, submitBtn);

    try {
      var sb = window.PickleSupabase.getClient();
      var user = await getAuthUserForAction();

      if (!user) {
        alertLoginRequired('답글을 남기려면 로그인이 필요합니다.');
        return;
      }

      var authorSnapshot = extractCommentAuthorSnapshot(user);
      var insertPayload = {
        user_id: user.id,
        post_id: currentPostId,
        parent_id: parentId,
        content: text,
        filtered_content: text,
        ai_filter_status: prepared.wasMasked ? 'masked' : 'passed',
        visibility_status: 'visible',
        author_nickname: authorSnapshot.author_nickname,
        author_avatar_html: authorSnapshot.author_avatar_html,
      };

      var insertResult = await sb.from('comments').insert(insertPayload).select('id').single();

      if (insertResult.error && isCommentAuthorSnapshotColumnError(insertResult.error)) {
        delete insertPayload.author_nickname;
        delete insertPayload.author_avatar_html;
        insertResult = await sb.from('comments').insert(insertPayload).select('id').single();
      }

      if (insertResult.error && isCommentParentIdColumnError(insertResult.error)) {
        delete insertPayload.parent_id;
        insertResult = await sb.from('comments').insert(insertPayload).select('id').single();
      }

      if (insertResult.error) throw insertResult.error;

      var newReplyId =
        insertResult.data && insertResult.data.id ? insertResult.data.id : null;
      var replyParentId = insertPayload.parent_id || null;

      try {
        var commentPoints =
          (window.PickleProfile &&
            window.PickleProfile.STAR_SCORE_GUIDE &&
            window.PickleProfile.STAR_SCORE_GUIDE.COMMENT) ||
          3;
        if (window.PickleProfile && window.PickleProfile.tryIncrementSelfStarScoreFireAndForget) {
          window.PickleProfile.tryIncrementSelfStarScoreFireAndForget(commentPoints, 'reply');
        } else {
          await sb.rpc('increment_star_score', { p_amount: commentPoints });
          if (window.PickleProfile && window.PickleProfile.clearRankingPointsCache) {
            window.PickleProfile.clearRankingPointsCache(user.id);
          }
        }
      } catch (scoreErr) {
        console.error('[Score Engine Error]', 'reply increment_star_score', scoreErr);
      }

      if (replyParentId && newReplyId) {
        await sendReplyNotification(sb, replyParentId, newReplyId, user.id);
      }

      if (window.PicklePoints && window.PicklePoints.tryAwardPoints) {
        window.PicklePoints.tryAwardPoints(user.id, 'comment', 'Comment').catch(function (err) {
          console.warn('[P!CKLE Detail] reply points skipped', err);
        });
      } else if (window.PicklePoints && window.PicklePoints.awardPoints) {
        console.log('✅ [Comment] 완료 -> awardPoints 호출 시도');
        window.PicklePoints.awardPoints(user.id, 'comment').catch(function (err) {
          console.warn('[P!CKLE Detail] reply points skipped', err);
        });
      }

      if (inputEl) inputEl.value = '';
      closeInlineReplyForm();
      await loadComments(currentPostId);
    } catch (err) {
      console.error('[P!CKLE Detail] 답글 등록 실패', err);
      var msg = String(err.message || err);
      if (msg.indexOf('parent_id') !== -1) {
        alert('대댓글 기능을 사용하려면 supabase/34_comments_parent_id.sql 을 실행해 주세요.');
      } else {
        alert('답글 등록에 실패했습니다. ' + msg);
      }
    } finally {
      replySubmitInFlight = false;
      setReplySubmitButtonsDisabled(false);
    }
  }

  function onCommentListClick(e) {
    var likeBtn = e.target.closest('.comment-like-btn');
    if (likeBtn) {
      e.preventDefault();
      toggleCommentLike(likeBtn.getAttribute('data-comment-id'), likeBtn);
      return;
    }

    var replyCancel = e.target.closest('.comment-inline-reply-cancel');
    if (replyCancel) {
      e.preventDefault();
      closeInlineReplyForm();
      return;
    }

    var replySubmit = e.target.closest('.comment-inline-reply-submit');
    if (replySubmit) {
      e.preventDefault();
      if (replySubmitInFlight || replySubmit.disabled) return;
      submitReply(replySubmit.getAttribute('data-parent-id'));
      return;
    }

    var replyBtn = e.target.closest('.comment-reply-btn');
    if (replyBtn) {
      e.preventDefault();
      startReplyToComment(replyBtn.getAttribute('data-comment-id'), replyBtn);
      return;
    }
  }

  function onCommentListKeydown(e) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    var replyInput = e.target.closest('.comment-inline-reply-input');
    if (!replyInput) return;
    e.preventDefault();
    if (replySubmitInFlight) return;
    var form = replyInput.closest('.comment-inline-reply-form');
    var parentId = form ? form.getAttribute('data-parent-id') : null;
    if (parentId) submitReply(parentId);
  }

  function bindCommentListDelegationOnce() {
    var rootEl = $('commentActive') || $('detailCommentList');
    if (!rootEl || commentListDelegationBound) return;

    rootEl.addEventListener('click', onCommentListClick);
    rootEl.addEventListener('keydown', onCommentListKeydown);
    commentListDelegationBound = true;
  }

  function focusCommentFromHash() {
    var hash = window.location.hash || '';
    if (!hash || hash.indexOf('#comment-') !== 0) return;

    var commentId = decodeURIComponent(hash.slice('#comment-'.length));
    if (!commentId) return;

    var el =
      document.getElementById('comment-' + commentId) ||
      document.querySelector(
        '[data-comment-id="' + String(commentId).replace(/"/g, '') + '"]'
      );

    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('highlight-pulse');
    void el.offsetWidth;
    el.classList.add('highlight-pulse');
    window.setTimeout(function () {
      el.classList.remove('highlight-pulse');
    }, 2000);
  }

  function updateCommentHeader(count) {
    var headerEl = $('detailCommentCount');
    if (headerEl) {
      headerEl.textContent = '댓글 (' + Number(count || 0).toLocaleString() + ')';
    }

    var lockSub = document.querySelector('#commentLock .lock-subtext');
    if (lockSub) {
      lockSub.textContent =
        '지금 투표하고 ' +
        Number(count || 0).toLocaleString() +
        '개의 훈수를 확인하세요.';
    }
  }
// 👉 [수정 2] 정렬(sortType) 파라미터 추가 및 인기순(좋아요 순) 정렬 로직 적용
function renderCommentsList(comments, sortType) {
  closeInlineReplyForm();
  var listEl = $('detailCommentList');
  if (!listEl) return;

  if (!comments.length) {
    listEl.innerHTML =
      '<p class="comments-empty-msg" id="detailCommentEmpty">첫 번째 댓글의 주인공이 되어보세요!</p>';
    return;
  }

  var tree = buildCommentTree(comments);

  // 👇 인기순(popular)일 경우 좋아요(like_count) 내림차순 정렬, 같으면 최신순
  if (sortType === 'popular') {
    tree.parents.sort(function (a, b) {
      var diff = Number(b.like_count || 0) - Number(a.like_count || 0);
      if (diff !== 0) return diff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  } else {
    tree.parents.sort(function (a, b) {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  listEl.innerHTML = tree.parents
    .map(function (parent) {
      return renderCommentThreadHtml(parent, tree.repliesByParent);
    })
    .join('');
  }

  // 👉 [수정 3] postId와 sortType 파라미터 꼬임 방어 및 renderCommentsList에 sortType 전달
  async function loadComments(postId, sortType) {
    // 👇 파라미터가 꼬여 들어오는 경우(uuid 에러 튕김 방어)
    if (postId === 'latest' || postId === 'popular') {
      sortType = postId;
      postId = currentPostId;
    }
    if (!postId) postId = currentPostId;
    if (!postId) return [];
    if (!sortType) sortType = 'latest';

    try {
      var sb = window.PickleSupabase.getClient();
      var comments = await fetchCommentsList(sb, postId);
      var auth = null;
      if (window.PickleAuth && window.PickleAuth.ensureAuthenticated) {
        auth = await window.PickleAuth.ensureAuthenticated({ skipProfile: true }).catch(function(){});
      }
      var userId = auth && auth.user ? auth.user.id : null;

      await fetchMyLikedCommentIds(
        sb,
        userId,
        comments.map(function (comment) {
          return comment.id;
        })
      );

      commentByIdCache = Object.create(null);
      comments.forEach(function (comment) {
        if (comment && comment.id) commentByIdCache[comment.id] = comment;
      });

      // 👇 2단계에서 만든 함수에 sortType을 던져줌
      renderCommentsList(comments, sortType); 
      updateCommentHeader(comments.length);
      renderStats(cachedVoteStats, comments.length);

      window.requestAnimationFrame(function () {
        window.setTimeout(focusCommentFromHash, 100);
      });

      return comments;
    } catch (err) {
      console.error('[P!CKLE Detail] 댓글 로드 실패', err);
      var listEl = $('detailCommentList');
      if (listEl) {
        listEl.innerHTML =
          '<p class="comments-empty-msg">댓글을 불러오지 못했습니다.</p>';
      }
      return [];
    }
  }

  async function submitComment() {
    if (commentSubmitInFlight) return;

    var inputEl = $('detailCommentInput');
    var submitBtn = $('detailCommentSubmit');
    var rawText = inputEl ? inputEl.value : '';

    if (!rawText.trim()) {
      alert('댓글 내용을 입력해주세요.');
      return;
    }

    var supabase = window.PickleSupabase.getClient();
    if (window.PickleCommentClean && window.PickleCommentClean.prepareCommentForInsert) {
      var commentPrepared = await window.PickleCommentClean.prepareCommentForInsert(
        rawText,
        supabase
      );
      if (!commentPrepared.ok) return;
    } else if (window.PickleCommentClean && window.PickleCommentClean.blockCommentOnSubmit) {
      if (await window.PickleCommentClean.blockCommentOnSubmit(rawText, supabase)) return;
      var commentPrepared = { ok: true, text: rawText.trim(), wasMasked: false };
    } else {
      var commentPrepared = { ok: true, text: rawText.trim(), wasMasked: false };
    }

    var text = commentPrepared.text;

    var currentUser = await getAuthUserForAction();

    if (currentUser) {
      var sanctionQuery = await supabase
        .from('users')
        .select('is_banned, restricted_until')
        .eq('id', currentUser.id)
        .single();
      var userData = sanctionQuery.data;

      if (userData && userData.is_banned === true) {
        alert('클린 가이드 위반으로 제재된 계정입니다.');
        return;
      }

      if (
        userData &&
        userData.restricted_until &&
        new Date(userData.restricted_until) > new Date()
      ) {
        alert('클린 가이드 위반으로 제재된 계정입니다.');
        return;
      }
    }

    if (!currentPostId) {
      alert('불판 정보를 찾을 수 없습니다.');
      return;
    }

    commentSubmitInFlight = true;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '등록 중…';
    }

    try {
      var sb = window.PickleSupabase.getClient();
      var user = await getAuthUserForAction();

      if (!user) {
        var detailRedirect =
          'detail.html?id=' + encodeURIComponent(currentPostId);
        if (window.PickleAuth && window.PickleAuth.promptAuthForAction) {
          await window.PickleAuth.promptAuthForAction({
            message: '로그인이 필요한 서비스입니다.',
            redirect: detailRedirect,
            from: 'comment',
          });
        } else {
          alertLoginRequired('댓글을 남기려면 로그인이 필요합니다.', function () {
            window.location.href =
              'login.html?redirect=' + encodeURIComponent(detailRedirect);
          });
        }
        return;
      }

      var authorSnapshot = extractCommentAuthorSnapshot(user);
      var insertPayload = {
        user_id: user.id,
        post_id: currentPostId,
        content: text,
        filtered_content: text,
        ai_filter_status: commentPrepared.wasMasked ? 'masked' : 'passed',
        visibility_status: 'visible',
        author_nickname: authorSnapshot.author_nickname,
        author_avatar_html: authorSnapshot.author_avatar_html,
      };

      var insertResult = await sb
        .from('comments')
        .insert(insertPayload)
        .select(
          'id, content, filtered_content, created_at, user_id, author_nickname, author_avatar_html'
        )
        .single();

      if (insertResult.error && isCommentSchemaColumnError(insertResult.error)) {
        delete insertPayload.author_nickname;
        delete insertPayload.author_avatar_html;
        insertResult = await sb
          .from('comments')
          .insert(insertPayload)
          .select(
            'id, content, filtered_content, created_at, user_id, users:user_id ( nickname )'
          )
          .single();
      }

      if (insertResult.error) throw insertResult.error;

      var newComment = normalizeCommentRow(insertResult.data);
      if (!newComment.author_nickname) {
        newComment.author_nickname = authorSnapshot.author_nickname;
      }
      if (!newComment.author_avatar_html) {
        newComment.author_avatar_html = authorSnapshot.author_avatar_html;
      }

      try {
        var commentPoints =
          (window.PickleProfile &&
            window.PickleProfile.STAR_SCORE_GUIDE &&
            window.PickleProfile.STAR_SCORE_GUIDE.COMMENT) ||
          3;
        if (window.PickleProfile && window.PickleProfile.tryIncrementSelfStarScoreFireAndForget) {
          window.PickleProfile.tryIncrementSelfStarScoreFireAndForget(commentPoints, 'comment');
        } else {
          await sb.rpc('increment_star_score', { p_amount: commentPoints });
          if (window.PickleProfile && window.PickleProfile.clearRankingPointsCache) {
            window.PickleProfile.clearRankingPointsCache(user.id);
          }
        }
      } catch (scoreErr) {
        console.error('[Score Engine Error]', 'comment increment_star_score', scoreErr);
      }

      if (window.PicklePoints && window.PicklePoints.tryAwardPoints) {
        window.PicklePoints.tryAwardPoints(user.id, 'comment', 'Comment').catch(function (err) {
          console.warn('[P!CKLE Detail] comment points skipped', err);
        });
      } else if (window.PicklePoints && window.PicklePoints.awardPoints) {
        console.log('✅ [Comment] 완료 -> awardPoints 호출 시도');
        window.PicklePoints.awardPoints(user.id, 'comment').catch(function (err) {
          console.warn('[P!CKLE Detail] comment points skipped', err);
        });
      }

      if (inputEl) inputEl.value = '';

      await loadComments(currentPostId);
    } catch (err) {
      console.error('[P!CKLE Detail] 댓글 등록 실패', err);
      alert(
        '댓글 등록에 실패했습니다. ' + (err.message || String(err))
      );
    } finally {
      commentSubmitInFlight = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '등록';
      }
    }
  }

  function bindCommentFormOnce() {
    if (commentFormBound) return;
    commentFormBound = true;

    var submitBtn = $('detailCommentSubmit');
    var inputEl = $('detailCommentInput');

    if (submitBtn) {
      submitBtn.addEventListener('click', function (e) {
        e.preventDefault();
        submitComment();
      });
    }

    if (inputEl) {
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submitComment();
        }
      });
    }
  }

  async function fetchVoteStats(sb, postId) {
    var empty = { votesA: 0, votesB: 0, total: 0 };

    var rpc = await sb.rpc('get_post_vote_stats', { post_ids: [postId] });
    if (!rpc.error && rpc.data && rpc.data.length) {
      var st = rpc.data[0];
      return {
        votesA: Number(st.votes_a) || 0,
        votesB: Number(st.votes_b) || 0,
        total: Number(st.total) || 0,
      };
    }

    var fallback = await sb
      .from('votes')
      .select('choice')
      .eq('post_id', postId);

    if (fallback.error) {
      console.warn('[P!CKLE Detail] 투표 집계 실패', fallback.error);
      return empty;
    }

    var stats = { votesA: 0, votesB: 0, total: 0 };
    (fallback.data || []).forEach(function (row) {
      if (row.choice === 'A') stats.votesA += 1;
      if (row.choice === 'B') stats.votesB += 1;
      stats.total += 1;
    });
    return stats;
  }

  async function fetchCommentCount(sb, postId) {
    var result = await sb
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId)
      .in('visibility_status', ['visible', 'blinded']);

    if (result.error) {
      console.warn('[P!CKLE Detail] 댓글 수 조회 실패', result.error);
      return 0;
    }
    return result.count || 0;
  }

  async function fetchPostById(postId) {
    var sb = window.PickleSupabase.getClient();

    var postsResult = await sb
      .from('posts')
      .select('*, users:author_id ( nickname, points )')
      .eq('id', postId)
      .maybeSingle();

    if (postsResult.error) {
      throw postsResult.error;
    }
    if (postsResult.data) {
      return normalizePostsRow(postsResult.data);
    }

    var legacy = await sb
      .from('pickle_posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle();

    if (legacy.error) {
      throw legacy.error;
    }
    if (legacy.data) {
      var legacyPost = normalizePicklePostsRow(legacy.data);
      legacyPost._voteTable = 'pickle_posts';
      return legacyPost;
    }

    return null;
  }

  function renderMeta(post) {
    var catLabel = categoryDisplay(post.category);
    var catEl = $('detailCategoryText');
    if (catEl) {
      catEl.textContent = catLabel;
    }

    var metaEl = $('detailMetaTags');
    if (metaEl) {
      var html = [];

      html.push(
        '<span class="pickle-meta-cat">[ ' + escapeHtml(catLabel) + ' ]</span>'
      );

      formatHashtags(safeTagsValue(post)).forEach(function (tag) {
        html.push(
          '<span class="pickle-meta-tag">' + escapeHtml(tag) + '</span>'
        );
      });

      html.push(
        '<span class="pickle-meta-timer" id="detailTimer">⏳ --</span>'
      );

      metaEl.className = 'pickle-meta-row meta-row-top';
      metaEl.innerHTML = html.join('');
    }

    startTimer(post);
  }

  function renderAuthor(post) {
    var picEl = $('detailAuthorPic');
    var nameEl = $('detailAuthorName');
    var levelEl = $('detailAuthorLevelBadge');
    var commentInput = $('detailCommentInput');

    var avatarRaw =
      post && post.author_avatar_html ? String(post.author_avatar_html).trim() : '';
    if (picEl) {
      if (avatarRaw) {
        if (avatarRaw.indexOf('<') !== -1) {
          picEl.innerHTML = avatarRaw;
        } else {
          picEl.textContent = avatarRaw;
        }
      } else {
        picEl.textContent = '🥒';
      }
    }

    if (nameEl) {
      var nickname =
        (post && post.author_nickname && String(post.author_nickname).trim()) ||
        (post && post.authorNickname) ||
        '픽클러';
      nameEl.textContent = nickname;
    }

    if (levelEl) {
      if (
        post &&
        post.author_ranking_points != null &&
        window.PickleProfile &&
        window.PickleProfile.buildLevelBadgeFromPoints
      ) {
        levelEl.innerHTML = window.PickleProfile.buildLevelBadgeFromPoints(
          post.author_ranking_points
        );
        levelEl.hidden = false;
      } else {
        levelEl.innerHTML = '';
        levelEl.hidden = true;
      }
    }

    if (commentInput) {
      var shortCat = categoryDisplay(post.category) || '불판';
      commentInput.placeholder = shortCat + ' 훈수를 자유롭게 남겨보세요.';
    }

    if (window.PickleFollows && post && post.author_id) {
      window.PickleFollows.syncDetailFollowButton(post.author_id);
    } else if (window.PickleFollows) {
      window.PickleFollows.syncDetailFollowButton(null);
    }
  }

  function catLabelFallback(category) {
    return String(category || '불판');
  }

  function renderStats(voteStats, commentCount) {
    var statsEl = $('detailStats');
    if (!statsEl) return;

    var total = voteStats && voteStats.total ? voteStats.total : 0;
    var label = total > 0 ? '🔥 ' + total.toLocaleString() + '명 참여' : '🔥 NEW';

    statsEl.innerHTML =
      '<span>' +
      escapeHtml(label) +
      '</span><span>💬 ' +
      Number(commentCount || 0).toLocaleString() +
      ' 댓글</span>';
  }

  var cachedVoteStats = { votesA: 0, votesB: 0, total: 0 };
  var detailHasVoted = false;
  var resultConfettiFired = false;
  var resultFakeIntervalId = null;
  var resultRevealTimeoutId = null;
  var resultRevealDone = false;

  function isPostExpired(post) {
    if (!post) return true;
    var raw = post.expires_at;
    if (raw == null || raw === '') return true;
    var expireDate = new Date(raw);
    if (Number.isNaN(expireDate.getTime())) return true;
    return new Date() > expireDate;
  }

  function calcVotePercent(votesA, votesB) {
    var a = Number(votesA) || 0;
    var b = Number(votesB) || 0;
    var total = a + b;
    if (total <= 0) {
      return { pctA: 0, pctB: 0, total: 0 };
    }
    var pctA = Math.round((a / total) * 100);
    return { pctA: pctA, pctB: 100 - pctA, total: total };
  }

  function hideVoteOptions() {
    var box = $('optionsBox');
    if (box) box.classList.add('is-hidden');
  }

  function showVoteOptions() {
    var box = $('optionsBox');
    if (box) box.classList.remove('is-hidden');
    var resultView = $('detailResultView');
    if (resultView) {
      resultView.classList.remove('show');
      resultView.setAttribute('aria-hidden', 'true');
    }
  }

  function unlockCommentsArea() {
    var lock = $('commentLock');
    var active = $('commentActive');
    var input = $('detailCommentInput');
    var submitBtn = $('detailCommentSubmit');

    if (lock) lock.style.display = 'none';
    if (active) active.classList.add('show');
    if (input) {
      input.disabled = false;
      input.readOnly = false;
    }
    if (submitBtn) submitBtn.disabled = false;
  }

  function resetVoteOptionStyles() {
    var optA = $('optBtnA');
    var optB = $('optBtnB');
    if (optA) optA.classList.remove('selected-a', 'selected-b');
    if (optB) optB.classList.remove('selected-a', 'selected-b');
  }

  function applyVoteSelectionUI(choice) {
    if (!choice) return;
    resetVoteOptionStyles();
    var optEl = choice === 'A' ? $('optBtnA') : $('optBtnB');
    if (optEl) {
      optEl.classList.add(choice === 'A' ? 'selected-a' : 'selected-b');
    }
  }

  function canCastVoteNow() {
    return !!(currentPost && currentPostId && !detailHasVoted && !isPostExpired(currentPost));
  }

  function hashPostIdToAssetSet(postId) {
    var str = String(postId || '');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return (Math.abs(hash) % 7) + 1;
  }

  function getPickleVoteAssetPath(side, setIndex) {
    var idx = Math.max(1, Math.min(7, Number(setIndex) || 1));
    var suffix = side === 'B' ? 'B' : 'A';
    return 'asset/asset_' + suffix + '_' + idx + '.png';
  }

  function buildVoteOptionInnerHtml(side, optionText, setIndex) {
    var labelClass = side === 'B' ? 'opt-label-b' : 'opt-label-a';
    var labelLetter = side === 'B' ? 'B' : 'A';
    var textId = side === 'B' ? 'optTextB' : 'optTextA';
    var src = getPickleVoteAssetPath(side, setIndex);
    return (
      '<img class="opt-pickle-char" src="' +
      escapeHtml(src) +
      '" alt="" aria-hidden="true" loading="lazy" decoding="async">' +
      '<div class="opt-item-body">' +
      '<span class="' +
      labelClass +
      '">' +
      labelLetter +
      '</span>' +
      '<span class="opt-text" id="' +
      textId +
      '">' +
      escapeHtml(optionText || '') +
      '</span>' +
      '</div>'
    );
  }

  function bindDetailMediaVoteHandlers() {
    var container = $('videoContainer');
    if (!container) return;

    if (container.dataset.voteBound !== '1') {
      container.dataset.voteBound = '1';

      container.addEventListener('click', function (e) {
        if (!canCastVoteNow()) return;
        if (e.target.closest('iframe') || e.target.closest('a.youtube-watch-fallback')) {
          return;
        }

        var half = e.target.closest('.split-half[data-side]');
        if (!half) return;

        var side = half.getAttribute('data-side');
        if (side !== 'A' && side !== 'B') return;

        e.preventDefault();
        var optEl = side === 'A' ? $('optBtnA') : $('optBtnB');
        castVote(side, e, optEl || half);
      });

      container.addEventListener('keydown', function (e) {
        if (!canCastVoteNow()) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;

        var half = e.target.closest('.split-half[data-side]');
        if (!half) return;

        e.preventDefault();
        var side = half.getAttribute('data-side');
        var optEl = side === 'A' ? $('optBtnA') : $('optBtnB');
        castVote(side, e, optEl || half);
      });
    }

    var halves = container.querySelectorAll('.split-half[data-side]');
    halves.forEach(function (half) {
      half.classList.toggle('is-vote-disabled', !canCastVoteNow());
    });
  }

  async function syncDetailViewerState(post) {
    if (!post) return;

    if (isPostExpired(post)) {
      unlockCommentsArea();
      return;
    }

    var sb = getSharedSupabaseClient();
    var user = await getAuthUserForAction();

    showVoteOptions();
    resetVoteOptionStyles();
    detailHasVoted = false;

    var blindFeedback = $('blindFeedback');
    if (blindFeedback) blindFeedback.classList.remove('show');

    if (post.author_id && window.PickleFollows && window.PickleFollows.syncDetailFollowButton) {
      await window.PickleFollows.syncDetailFollowButton(post.author_id);
    }

    if (!user) {
      bindDetailMediaVoteHandlers();
      return;
    }

    if (post.author_id && post.author_id === user.id) {
      unlockCommentsArea();
      if (post.id) await loadComments(post.id);
      bindDetailMediaVoteHandlers();
      return;
    }

    var voteResult = await sb
      .from('votes')
      .select('choice')
      .eq('post_id', post.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (voteResult.error || !voteResult.data) {
      bindDetailMediaVoteHandlers();
      return;
    }

    detailHasVoted = true;
    applyVoteSelectionUI(voteResult.data.choice);
    unlockCommentsArea();
    if (blindFeedback) blindFeedback.classList.add('show');
    if (post.id) await loadComments(post.id);
    bindDetailMediaVoteHandlers();
  }

  function ensureCommentsEnabledWhenExpired(post) {
    if (isPostExpired(post)) {
      unlockCommentsArea();
    }
  }

  function randomFakePct() {
    return Math.floor(Math.random() * 81) + 10;
  }

  function setResultBarTransition(mode) {
    var resultView = $('detailResultView');
    if (!resultView) return;
    resultView.classList.remove('is-fake-reveal', 'is-final-reveal');
    if (mode === 'fake') resultView.classList.add('is-fake-reveal');
    if (mode === 'final') resultView.classList.add('is-final-reveal');
  }

  function updateResultBars(pctA, pctB) {
    var barA = $('resultBarA');
    var barB = $('resultBarB');
    var pctAEl = $('resultPctA');
    var pctBEl = $('resultPctB');
    var countAEl = $('resultCountA');
    var countBEl = $('resultCountB');

    if (barA) barA.style.width = pctA + '%';
    if (barB) barB.style.width = pctB + '%';
    if (pctAEl) pctAEl.textContent = pctA + '%';
    if (pctBEl) pctBEl.textContent = pctB + '%';
    if (countAEl) {
      countAEl.textContent = (Number(cachedVoteStats.votesA) || 0).toLocaleString();
    }
    if (countBEl) {
      countBEl.textContent = (Number(cachedVoteStats.votesB) || 0).toLocaleString();
    }
  }

  function stopResultFakeAnimation() {
    if (resultFakeIntervalId) {
      clearInterval(resultFakeIntervalId);
      resultFakeIntervalId = null;
    }
    if (resultRevealTimeoutId) {
      clearTimeout(resultRevealTimeoutId);
      resultRevealTimeoutId = null;
    }
  }

  function revealResultBars(pctA, pctB, withConfetti) {
    stopResultFakeAnimation();
    setResultBarTransition('final');
    updateResultBars(pctA, pctB);
    resultRevealDone = true;

    if (withConfetti) {
      fireResultConfetti();
    }
  }

  function startResultFakeAnimation(pctA, pctB, withConfetti) {
    stopResultFakeAnimation();
    resultRevealDone = false;
    resultConfettiFired = false;

    setResultBarTransition('fake');
    updateResultBars(0, 0);

    resultFakeIntervalId = setInterval(function () {
      updateResultBars(randomFakePct(), randomFakePct());
    }, 100);

    resultRevealTimeoutId = setTimeout(function () {
      if (resultFakeIntervalId) {
        clearInterval(resultFakeIntervalId);
        resultFakeIntervalId = null;
      }
      resultRevealTimeoutId = null;
      revealResultBars(pctA, pctB, withConfetti);
    }, 3000);
  }

  function loadConfettiScript() {
    return new Promise(function (resolve, reject) {
      if (window.confetti) {
        resolve();
        return;
      }
      var existing = document.querySelector('script[data-pickle-confetti]');
      if (existing) {
        existing.addEventListener('load', function () {
          resolve();
        });
        existing.addEventListener('error', reject);
        return;
      }
      var script = document.createElement('script');
      script.src =
        'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
      script.async = true;
      script.setAttribute('data-pickle-confetti', '1');
      script.onload = function () {
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function fireResultConfetti() {
    if (resultConfettiFired) return;
    resultConfettiFired = true;

    loadConfettiScript()
      .then(function () {
        if (!window.confetti) return;

        var colors = ['#39ff14', '#00f0ff', '#ff007f', '#ffcc00', '#ffffff'];

        window.confetti({
          particleCount: 90,
          spread: 110,
          startVelocity: 38,
          decay: 0.92,
          scalar: 1.05,
          ticks: 140,
          origin: { x: 0.5, y: 0.5 },
          colors: colors,
        });
      })
      .catch(function (err) {
        console.warn('[P!CKLE Detail] confetti 로드 실패', err);
      });
  }

  function showResultView(post, voteStats, options) {
    var opts = options || {};
    cachedVoteStats = voteStats || cachedVoteStats || { votesA: 0, votesB: 0, total: 0 };
    var pct = calcVotePercent(cachedVoteStats.votesA, cachedVoteStats.votesB);

    hideVoteOptions();

    var resultView = $('detailResultView');
    if (resultView) {
      resultView.classList.add('show');
      resultView.setAttribute('aria-hidden', 'false');
    }

    var labelA = $('resultLabelA');
    var labelB = $('resultLabelB');
    var totalEl = $('resultTotalVotes');
    if (labelA) labelA.textContent = post.option_a || '';
    if (labelB) labelB.textContent = post.option_b || '';
    if (totalEl) {
      totalEl.textContent =
        '🔥 ' + Number(pct.total).toLocaleString() + '명 참여';
    }

    if (resultRevealDone || opts.skipFake) {
      revealResultBars(pct.pctA, pct.pctB, !!opts.withConfetti);
    } else if (resultFakeIntervalId || resultRevealTimeoutId) {
      /* 페이크 애니메이션 진행 중 — 재시작하지 않음 */
    } else {
      startResultFakeAnimation(pct.pctA, pct.pctB, !!opts.withConfetti);
    }

    if (opts.scrollIntoView && resultView) {
      setTimeout(function () {
        resultView.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    }
  }

  async function submitVoteToSupabase(postId, choice) {
    var sb = getSharedSupabaseClient();
    var user = await getAuthUserForAction();
    if (!user) {
      throw new Error('LOGIN_REQUIRED');
    }

    async function insertVote() {
      return sb.from('votes').insert({
        user_id: user.id,
        post_id: postId,
        choice: choice,
      });
    }

    var insertResult = await insertVote();

    if (insertResult.error && isAuthRelatedDbError(insertResult.error)) {
      if (window.PickleAuth && window.PickleAuth.refreshSession) {
        await window.PickleAuth.refreshSession();
      }
      user = await getAuthUserForAction();
      if (!user) {
        throw new Error('LOGIN_REQUIRED');
      }
      insertResult = await insertVote();
    }

    if (insertResult.error) {
      if (isProfileMissingDbError(insertResult.error)) {
        throw new Error(
          '회원 프로필이 아직 동기화되지 않았습니다. 잠시 후 다시 시도하거나 새로고침해 주세요.'
        );
      }
      throw insertResult.error;
    }

    try {
      var votePoints =
        (window.PickleProfile &&
          window.PickleProfile.STAR_SCORE_GUIDE &&
          window.PickleProfile.STAR_SCORE_GUIDE.VOTE) ||
        1;
      if (window.PickleProfile && window.PickleProfile.tryIncrementSelfStarScoreFireAndForget) {
        window.PickleProfile.tryIncrementSelfStarScoreFireAndForget(votePoints, 'vote');
      } else {
        await sb.rpc('increment_star_score', { p_amount: votePoints });
        if (window.PickleProfile && window.PickleProfile.clearRankingPointsCache) {
          window.PickleProfile.clearRankingPointsCache(user.id);
        }
      }
    } catch (scoreErr) {
      console.error('[Score Engine Error]', 'vote increment_star_score', scoreErr);
    }

    if (window.PicklePoints && window.PicklePoints.tryAwardPoints) {
      window.PicklePoints.tryAwardPoints(user.id, 'vote', 'Vote').catch(function (err) {
        console.warn('[P!CKLE Detail] vote points skipped', err);
      });
    } else if (window.PicklePoints && window.PicklePoints.awardPoints) {
      console.log('✅ [Vote] 완료 -> awardPoints 호출 시도');
      window.PicklePoints.awardPoints(user.id, 'vote').catch(function (err) {
        console.warn('[P!CKLE Detail] vote points skipped', err);
      });
    }
  }

  function playVotePickEffects(choice, event, element) {
    if (!element) return;

    element.classList.add(choice === 'A' ? 'selected-a' : 'selected-b');
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);

    var box = $('optionsBox');
    if (box) {
      box.classList.remove('shake-animation');
      void box.offsetWidth;
      box.classList.add('shake-animation');
    }

    if (event && element) {
      var rect = element.getBoundingClientRect();
      var x = event.clientX ? event.clientX - rect.left : rect.width / 2;
      var y = event.clientY ? event.clientY - rect.top : rect.height / 2;

      var effectGroup = document.createElement('div');
      effectGroup.style.position = 'absolute';
      effectGroup.style.left = x + 'px';
      effectGroup.style.top = y + 'px';
      effectGroup.style.zIndex = '300';

      var fireball = document.createElement('div');
      fireball.className = 'fireball';
      var stamp = document.createElement('div');
      stamp.className = 'stamp';
      stamp.innerText = choice === 'A' ? 'A P!CK' : 'B P!CK';

      effectGroup.appendChild(fireball);
      effectGroup.appendChild(stamp);
      element.appendChild(effectGroup);
    }
  }

  function revealBlindVoteFeedback() {
    var blindFeedback = $('blindFeedback');
    if (blindFeedback) blindFeedback.classList.add('show');

    unlockCommentsArea();
    if (currentPostId) {
      loadComments(currentPostId);
    }

    if (blindFeedback) {
      setTimeout(function () {
        blindFeedback.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }

  async function castVote(choice, event, element) {
    if (detailHasVoted) return;

    if (isPostExpired(currentPost)) {
      alert('⏳ 이 불판은 이미 뜨겁게 타오르고 마감된 불판입니다!');
      showResultView(currentPost, cachedVoteStats, { withConfetti: false });
      unlockCommentsArea();
      return;
    }

    if (!currentPost || !currentPostId) {
      alert('불판 정보를 찾을 수 없습니다.');
      return;
    }

    if (currentPost._voteTable === 'pickle_posts') {
      alert('이 불판은 구버전 데이터라 투표 저장을 지원하지 않습니다.');
      return;
    }

    var user = await getAuthUserForAction();
    if (!user) {
      var detailRedirect =
        'detail.html?id=' + encodeURIComponent(currentPostId);
      if (window.PickleAuth && window.PickleAuth.promptAuthForAction) {
        await window.PickleAuth.promptAuthForAction({
          message: '로그인이 필요한 서비스입니다.',
          redirect: detailRedirect,
          from: 'vote',
        });
      } else {
        alertLoginRequired('투표하려면 로그인이 필요합니다.', function () {
          window.location.href =
            'login.html?redirect=' + encodeURIComponent(detailRedirect);
        });
      }
      return;
    }

    detailHasVoted = true;
    playVotePickEffects(choice, event, element);

    try {
      await submitVoteToSupabase(currentPostId, choice);
      cachedVoteStats = await fetchVoteStats(
        window.PickleSupabase.getClient(),
        currentPostId
      );
      renderStats(cachedVoteStats, null);
    } catch (err) {
      detailHasVoted = false;
      element.classList.remove('selected-a', 'selected-b');

      var msg = String(err.message || err || '');
      if (
        msg === 'LOGIN_REQUIRED' ||
        isSessionMissingError(err) ||
        msg.toLowerCase().indexOf('auth session missing') !== -1
      ) {
        alertLoginRequired('투표하려면 로그인이 필요합니다.', function () {
          window.location.href =
            'login.html?redirect=' +
            encodeURIComponent('detail.html?id=' + encodeURIComponent(currentPostId));
        });
        return;
      }
      if (isAuthRelatedDbError(err)) {
        alertLoginRequired('투표하려면 로그인이 필요합니다.', function () {
          window.location.href =
            'login.html?redirect=' +
            encodeURIComponent('detail.html?id=' + encodeURIComponent(currentPostId));
        });
        return;
      }
      if (
        msg.toLowerCase().indexOf('duplicate') !== -1 ||
        msg.toLowerCase().indexOf('unique') !== -1
      ) {
        alert('이미 이 불판에 투표하셨습니다.');
        revealBlindVoteFeedback();
        return;
      }
      alert('투표 저장 실패: ' + msg);
      return;
    }

    setTimeout(revealBlindVoteFeedback, 800);
    bindDetailMediaVoteHandlers();
  }

  function renderDetail(post, voteStats, commentCount) {
    currentPost = post;
    currentPostId = post.id;
    cachedVoteStats = voteStats || { votesA: 0, votesB: 0, total: 0 };
    document.title = 'P!CKLE - ' + (post.title || '불판 상세');

    if (window.PickleRankingEvents && window.PickleRankingEvents.recordPostView) {
      window.PickleRankingEvents.recordPostView(post.id);
    }

    renderAuthor(post);
    renderMeta(post);

    var titleEl = $('detailTitle');
    if (titleEl) titleEl.textContent = post.title || '';

    var assetSet = hashPostIdToAssetSet(post.id);
    var optA = $('optBtnA');
    var optB = $('optBtnB');
    if (optA) {
      optA.innerHTML = buildVoteOptionInnerHtml('A', post.option_a || '', assetSet);
    }
    if (optB) {
      optB.innerHTML = buildVoteOptionInnerHtml('B', post.option_b || '', assetSet);
    }

    var descEl = $('detailDescription');
    if (descEl) {
      if (post.description) {
        descEl.textContent = post.description;
        descEl.hidden = false;
      } else {
        descEl.hidden = true;
      }
    }

    var mediaEl = $('videoContainer');
    if (mediaEl) {
      mediaEl.dataset.voteBound = '';
      if (window.PickleMediaView) {
        mediaEl.innerHTML = window.PickleMediaView.buildDetailMediaHtml(post);
      }
    }

    renderStats(voteStats, commentCount);
    updateCommentHeader(commentCount);
    loadComments(post.id);

    detailHasVoted = false;
    resultConfettiFired = false;
    resultRevealDone = false;
    stopResultFakeAnimation();

    if (isPostExpired(post)) {
      showResultView(post, voteStats, {
        withConfetti: true,
        scrollIntoView: false,
      });
      unlockCommentsArea();
    } else {
      showVoteOptions();
      var blindFeedback = $('blindFeedback');
      if (blindFeedback) blindFeedback.classList.remove('show');
    }

    ensureCommentsEnabledWhenExpired(post);
    syncDetailViewerState(post);
  }

  function showError(message) {
    if (timerInterval) clearInterval(timerInterval);
    var main = document.querySelector('main');
    if (!main) return;
    main.innerHTML =
      '<div style="padding:40px 20px;text-align:center;">' +
      '<p style="color:#ff007f;font-weight:800;margin-bottom:12px;">' +
      escapeHtml(message) +
      '</p>' +
      '<button onclick="location.href=\'index.html\'" style="background:#39ff14;color:#000;border:none;padding:12px 20px;border-radius:12px;font-weight:800;cursor:pointer;">피드로 돌아가기</button>' +
      '</div>';
  }

  async function loadDetail() {
    var postId = getPostIdFromUrl();
    if (!postId) {
      showError('불판 ID가 없습니다. 메인 피드에서 카드를 선택해 주세요.');
      return;
    }

    try {
      if (window.PickleAuth && window.PickleAuth.ensureAuthenticated) {
        await window.PickleAuth.ensureAuthenticated({ skipProfile: true }).catch(function () {});
      } else if (window.PickleAuth && window.PickleAuth.waitForSessionReady) {
        await window.PickleAuth.waitForSessionReady().catch(function () {});
      }

      if (window.PickleCategories && window.PickleCategories.load) {
        await window.PickleCategories.load();
      }

      var sb = window.PickleSupabase.getClient();
      var post = await fetchPostById(postId);

      if (!post) {
        showError('해당 불판을 찾을 수 없습니다.');
        return;
      }

      var voteStats = await fetchVoteStats(sb, postId);
      var commentCount = await fetchCommentCount(sb, postId);

      post = await ensurePostAuthorRankingPoints(post);
      renderDetail(post, voteStats, commentCount);
    } catch (err) {
      console.error('[P!CKLE Detail]', err);
      showError('불판을 불러오지 못했습니다. ' + (err.message || String(err)));
    }
  }

  window.PickleDetail = {
    load: loadDetail,
    getCurrentPost: function () {
      return currentPost;
    },
    getCurrentPostId: function () {
      return currentPostId;
    },
    isPostExpired: isPostExpired,
    castVote: castVote,
    submitComment: submitComment,
    loadComments: loadComments,
    toggleCommentLike: toggleCommentLike,
    focusCommentFromHash: focusCommentFromHash,
  };

  window.toggleCommentLike = toggleCommentLike;

  document.addEventListener('DOMContentLoaded', function () {
    bindCommentListDelegationOnce();
    bindCommentFormOnce();
    var startDetail = function () {
      loadDetail();
    };
    if (window.PickleAuth && window.PickleAuth.ensureAuthenticated) {
      window.PickleAuth.ensureAuthenticated({ skipProfile: true })
        .then(startDetail)
        .catch(startDetail);
    } else if (window.PickleAuth && window.PickleAuth.waitForSessionReady) {
      window.PickleAuth.waitForSessionReady().then(startDetail).catch(startDetail);
    } else {
      startDetail();
    }
  });

  // =========================================================================
  // 💡 [수정 4] 프로필 팝업 호출, 실시간 통계 조회, '나의 픽' 기능 통합 로직
  // =========================================================================

  // 1) 팝업창 내 '나의 픽' 버튼 클릭 실행 함수
  window.handlePopupFollow = async function() {
    var btn = document.getElementById('popupFollowBtn');
    if (!btn) return;
    var targetUid = btn.getAttribute('data-user-id');
    if (!targetUid) return;

    // pickle-follows.js 에 있는 핵심 팔로우 모듈 호출
    if (window.PickleFollows && typeof window.PickleFollows.toggleFollow === 'function') {
      btn.disabled = true;
      try {
        var nowFollowing = await window.PickleFollows.toggleFollow(targetUid);
        if (nowFollowing === null) return; // 미로그인 상태 등

        // 버튼 색상 및 텍스트 즉시 변경 (파스텔톤)
        btn.style.background = nowFollowing ? '#2c2c2e' : 'linear-gradient(135deg, #4ADE80, #22c55e)';
        btn.style.color = nowFollowing ? '#fff' : '#0a0a0c';
        btn.innerHTML = nowFollowing ? '✓ 팔로잉 중' : '<i class="ph ph-plus-bold"></i> 나의 픽';
        
        // 팔로워 숫자 통계 즉시 새로고침
        if (typeof window.loadProfilePopupCounts === 'function') {
          window.loadProfilePopupCounts(targetUid);
        }
      } catch (err) {
        console.error('[P!CKLE Detail] 팝업 팔로우 에러', err);
        alert('픽 처리에 실패했습니다.');
      } finally {
        btn.disabled = false;
      }
    } else {
      alert('팔로우 기능이 로드되지 않았습니다.');
    }
  };

  // 2) 프로필 팝업의 팔로워/팔로잉 수 및 한줄 소개(bio) 연동
  window.loadProfilePopupCounts = async function(uid) {
    var followerEl = document.getElementById('popupFollowerCount');
    var followingEl = document.getElementById('popupFollowingCount');

    if (followerEl) followerEl.textContent = '0';
    if (followingEl) followingEl.textContent = '0';

    if (window.PickleFollows && typeof window.PickleFollows.loadProfileModalBio === 'function') {
      await window.PickleFollows.loadProfileModalBio(uid);
    } else {
      var bioEl = document.getElementById('popupUserBadge');
      if (bioEl) {
        bioEl.textContent = '';
        bioEl.hidden = true;
        bioEl.style.display = 'none';
      }
    }

    if (!uid) return;

    try {
      var sb = window.PickleSupabase ? window.PickleSupabase.getClient() : null;
      if (!sb) return;

      sb.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', uid)
        .then(function(res) {
          if (!res.error && res.count !== null && followerEl) followerEl.textContent = res.count;
        });

      sb.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid)
        .then(function(res) {
          if (!res.error && res.count !== null && followingEl) followingEl.textContent = res.count;
        });
    } catch (err) {
      console.warn('[P!CKLE Detail] 통계 로드 실패', err);
    }
  };

  // 프로필 클릭은 pickle-profile-modal.js 공통 위임 핸들러가 처리합니다.
})();
