/**
 * P!CKLE — 불판 상세 (?id=UUID) · posts / pickle_posts
 */
(function () {
  'use strict';

  var currentPost = null;
  var timerInterval = null;
  var currentPostId = null;

  var CATEGORY_LABELS = {
    hot: '🔥 HOT',
    brand: '🤝 브랜드',
    love: '💖 연애',
    brain: '⚖️ 밸런스',
    ugc: '✨ UGC',
    other: '📌 기타',
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return window.PickleMediaView
      ? window.PickleMediaView.escapeHtml(str)
      : String(str ?? '');
  }

  function getPostIdFromUrl() {
    return new URLSearchParams(window.location.search).get('id');
  }

  function categoryDisplay(category) {
    if (!category) return '🔥 불판';
    return CATEGORY_LABELS[category] || category;
  }

  function mapMediaTypeToMode(mediaType) {
    if (!mediaType || mediaType === 'none') return 'text';
    if (mediaType === 'dual' || mediaType === 'video_dual') return 'vs';
    if (mediaType === 'single' || mediaType === 'video') return 'single';
    return 'text';
  }

  function normalizePicklePostsRow(row) {
    return {
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
    };
  }

  function resolveAuthorFieldsFromRow(row) {
    var nickname = row.author_nickname ? String(row.author_nickname).trim() : '';
    var avatarHtml = row.author_avatar_html ? String(row.author_avatar_html).trim() : '';
    if (!nickname && row.users && row.users.nickname) {
      nickname = String(row.users.nickname).trim();
    }
    return {
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
    return row;
  }

  function isCommentSchemaColumnError(error) {
    if (!error) return false;
    var msg = String(error.message || '').toLowerCase();
    return (
      msg.indexOf('author_nickname') !== -1 ||
      msg.indexOf('author_avatar_html') !== -1 ||
      msg.indexOf('column') !== -1 ||
      msg.indexOf('could not find') !== -1 ||
      error.code === '42703' ||
      error.code === 'PGRST204'
    );
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

  function computeEndsAt(post) {
    if (!post) return null;

    var raw = post.expires_at || post.end_at || post.end_date || null;
    if (!raw) return null;

    var endDate = new Date(raw);
    return Number.isNaN(endDate.getTime()) ? null : endDate;
  }

  function formatCountdown(endsAt) {
    if (!endsAt || Number.isNaN(endsAt.getTime())) return '⏳ 진행 중';
    var ms = endsAt.getTime() - Date.now();
    if (ms <= 0) return '⏳ 종료된 불판';

    var minuteMs = 60 * 1000;
    var hourMs = 60 * minuteMs;
    var dayMs = 24 * hourMs;

    if (ms < hourMs) {
      var minutes = Math.max(1, Math.ceil(ms / minuteMs));
      return '⏳ ' + minutes + '분 남음';
    }
    if (ms < dayMs) {
      var hours = Math.floor(ms / hourMs);
      return '⏳ ' + hours + '시간 남음';
    }
    var days = Math.floor(ms / dayMs);
    return '⏳ ' + days + '일 남음';
  }

  function startTimer(post) {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    var endsAt = computeEndsAt(post);
    var timerEl = $('detailTimer');
    if (!timerEl) return;

    function tick() {
      var label = formatCountdown(endsAt);
      timerEl.textContent = label;
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

  function renderCommentItemHtml(comment) {
    var body = comment.filtered_content || comment.content || '';
    return (
      '<div class="comment-item" data-comment-id="' +
      escapeHtml(comment.id) +
      '">' +
      '<div class="author-pic" style="width: 36px; height: 36px; font-size: 1rem; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:50%;">' +
      commentAuthorAvatarInner(comment) +
      '</div>' +
      '<div class="comment-content">' +
      '<div class="comment-user"><span>' +
      escapeHtml(commentAuthorLabel(comment)) +
      '</span><span style="font-size:0.7rem;color:#71717a;">' +
      escapeHtml(formatCommentTime(comment.created_at)) +
      '</span></div>' +
      '<div class="comment-text">' +
      escapeHtml(body) +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  var COMMENT_SELECT_VARIANTS = [
    'id, content, filtered_content, created_at, user_id, author_nickname, author_avatar_html',
    'id, content, filtered_content, created_at, user_id, users:user_id ( nickname )',
  ];

  async function fetchCommentsList(sb, postId) {
    var lastError = null;

    for (var i = 0; i < COMMENT_SELECT_VARIANTS.length; i++) {
      var result = await sb
        .from('comments')
        .select(COMMENT_SELECT_VARIANTS[i])
        .eq('post_id', postId)
        .eq('visibility_status', 'visible')
        .order('created_at', { ascending: false });

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

  function updateCommentHeader(count) {
    var headerEl = $('detailCommentCount');
    if (headerEl) {
      headerEl.textContent = '댓글 (' + Number(count || 0).toLocaleString() + ')';
    }

    var lockSub = document.querySelector('#commentLock .lock-subtext');
    if (lockSub) {
      lockSub.textContent =
        '지금 참전하고 ' +
        Number(count || 0).toLocaleString() +
        '개의 훈수를 확인하세요.';
    }
  }

  function renderCommentsList(comments) {
    var listEl = $('detailCommentList');
    if (!listEl) return;

    if (!comments.length) {
      listEl.innerHTML =
        '<p class="comments-empty-msg" id="detailCommentEmpty">아직 댓글이 없습니다. 첫 훈수를 남겨보세요!</p>';
      return;
    }

    listEl.innerHTML = comments.map(renderCommentItemHtml).join('');
  }

  async function loadComments(postId) {
    if (!postId) return [];

    try {
      var sb = window.PickleSupabase.getClient();
      var comments = await fetchCommentsList(sb, postId);
      renderCommentsList(comments);
      updateCommentHeader(comments.length);
      renderStats(cachedVoteStats, comments.length);
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
    var inputEl = $('detailCommentInput');
    var submitBtn = $('detailCommentSubmit');
    var text = inputEl ? inputEl.value.trim() : '';

    if (!text) {
      alert('댓글 내용을 입력해주세요.');
      return;
    }

    if (!currentPostId) {
      alert('불판 정보를 찾을 수 없습니다.');
      return;
    }

    var sb = window.PickleSupabase.getClient();
    var authResult = await sb.auth.getUser();

    if (authResult.error) {
      console.error('[P!CKLE Detail] auth', authResult.error);
      alert('로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요.');
      return;
    }

    var user = authResult.data && authResult.data.user;
    if (!user) {
      alert('댓글을 남기려면 로그인이 필요합니다.');
      window.location.href =
        'login.html?redirect=' +
        encodeURIComponent(
          'detail.html?id=' + encodeURIComponent(currentPostId)
        );
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '등록 중…';
    }

    try {
      var authorSnapshot = extractCommentAuthorSnapshot(user);
      var insertPayload = {
        user_id: user.id,
        post_id: currentPostId,
        content: text,
        filtered_content: text,
        ai_filter_status: 'passed',
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

      if (inputEl) inputEl.value = '';

      var listEl = $('detailCommentList');
      var emptyEl = $('detailCommentEmpty');
      if (emptyEl) emptyEl.remove();

      if (listEl) {
        listEl.insertAdjacentHTML(
          'afterbegin',
          renderCommentItemHtml(newComment)
        );
      }

      var count = listEl
        ? listEl.querySelectorAll('.comment-item').length
        : 1;
      updateCommentHeader(count);
      renderStats(cachedVoteStats, count);
    } catch (err) {
      console.error('[P!CKLE Detail] 댓글 등록 실패', err);
      alert(
        '댓글 등록에 실패했습니다. ' + (err.message || String(err))
      );
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '등록';
      }
    }
  }

  function bindCommentForm() {
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
      .eq('visibility_status', 'visible');

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
      .select('*, users:author_id ( nickname )')
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
      return normalizePicklePostsRow(legacy.data);
    }

    return null;
  }

  function renderMeta(post) {
    var metaEl = $('detailMetaTags');
    if (!metaEl) return;

    var html = [];
    var catLabel = categoryDisplay(post.category);

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
    startTimer(post);
  }

  function renderAuthor(post) {
    var picEl = $('detailAuthorPic');
    var nameEl = $('detailAuthorName');
    var badgeEl = $('detailCategoryBadge');
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

    if (badgeEl && post.category) {
      badgeEl.textContent = categoryDisplay(post.category)
        .replace(/^(\p{Extended_Pictographic}\s*)/u, '')
        .trim() || catLabelFallback(post.category);
      badgeEl.hidden = false;
    } else if (badgeEl) {
      badgeEl.hidden = true;
    }

    if (commentInput) {
      var shortCat = categoryDisplay(post.category)
        .replace(/^(\p{Extended_Pictographic}\s*)/u, '')
        .trim() || '불판';
      commentInput.placeholder = shortCat + ' 훈수를 자유롭게 남겨보세요.';
    }
  }

  function catLabelFallback(category) {
    return String(category || '불판');
  }

  function renderStats(voteStats, commentCount) {
    var statsEl = $('detailStats');
    if (!statsEl) return;

    var total = voteStats && voteStats.total ? voteStats.total : 0;
    var label = total > 0 ? '🔥 ' + total.toLocaleString() + '명 참전' : '🔥 NEW';

    statsEl.innerHTML =
      '<span>' +
      escapeHtml(label) +
      '</span><span>💬 ' +
      Number(commentCount || 0).toLocaleString() +
      ' 댓글</span>';
  }

  var cachedVoteStats = { votesA: 0, votesB: 0, total: 0 };

  function renderDetail(post, voteStats, commentCount) {
    currentPost = post;
    currentPostId = post.id;
    cachedVoteStats = voteStats || { votesA: 0, votesB: 0, total: 0 };
    document.title = 'P!CKLE - ' + (post.title || '불판 상세');

    renderAuthor(post);
    renderMeta(post);

    var titleEl = $('detailTitle');
    if (titleEl) titleEl.textContent = post.title || '';

    var optA = $('optBtnA');
    var optB = $('optBtnB');
    if (optA) {
      optA.innerHTML =
        '<span class="opt-label-a">A</span> ' + escapeHtml(post.option_a || '');
    }
    if (optB) {
      optB.innerHTML =
        '<span class="opt-label-b">B</span> ' + escapeHtml(post.option_b || '');
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
    if (mediaEl && window.PickleMediaView) {
      mediaEl.innerHTML = window.PickleMediaView.buildDetailMediaHtml(post);
    }

    renderStats(voteStats, commentCount);
    updateCommentHeader(commentCount);
    loadComments(post.id);
    bindCommentForm();
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
      var sb = window.PickleSupabase.getClient();
      var post = await fetchPostById(postId);

      if (!post) {
        showError('해당 불판을 찾을 수 없습니다.');
        return;
      }

      var voteStats = await fetchVoteStats(sb, postId);
      var commentCount = await fetchCommentCount(sb, postId);

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
    submitComment: submitComment,
    loadComments: loadComments,
  };

  document.addEventListener('DOMContentLoaded', loadDetail);
})();
