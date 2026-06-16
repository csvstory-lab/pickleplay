/**
 * P!CKLE Admin — 불판 상세 및 댓글 (Supabase)
 */
(function () {
  'use strict';

  var postId = null;
  var postCache = null;
  var commentsCache = [];
  var categoriesMap = {};

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getSupabaseClient() {
    var cfg = window.PICKLE_SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey) {
      throw new Error('Supabase 접속 정보가 없습니다. js/supabase-config.js 를 확인해 주세요.');
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase JS 라이브러리가 로드되지 않았습니다.');
    }
    return window.supabase.createClient(cfg.url.trim(), cfg.anonKey.trim());
  }

  function getPostIdFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    if (!id || !String(id).trim()) return null;
    return String(id).trim();
  }

  function formatNumber(n) {
    return Number(n || 0).toLocaleString('ko-KR');
  }

  function formatPostId(id) {
    if (!id) return '#—';
    var s = String(id).replace(/-/g, '');
    return '#' + s.slice(0, 8).toUpperCase();
  }

  function formatDateTime(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    var yy = String(d.getFullYear()).slice(2);
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return yy + '.' + mm + '.' + dd + ' ' + hh + ':' + min;
  }

  function resolvePostTitle(post) {
    if (post.title && String(post.title).trim()) return String(post.title).trim();
    var a = post.option_a_name ? String(post.option_a_name).trim() : '';
    var b = post.option_b_name ? String(post.option_b_name).trim() : '';
    if (a || b) return (a || 'A') + ' vs ' + (b || 'B');
    return '제목 없음';
  }

  function resolveCategoryBadge(post) {
    var icon = post.category_icon ? String(post.category_icon).trim() : '';
    var name =
      post.category_name ||
      (post.category && categoriesMap[post.category]
        ? categoriesMap[post.category].name
        : post.category) ||
      '—';
    return (icon ? icon + ' ' : '') + name;
  }

  function resolveAuthorName(post) {
    if (post.author_nickname && String(post.author_nickname).trim()) {
      return String(post.author_nickname).trim();
    }
    if (post.users && post.users.nickname) return String(post.users.nickname);
    if (post.author_id) return String(post.author_id).slice(0, 8);
    return '익명';
  }

  function resolveDeadline(post) {
    return post.expires_at || null;
  }

  function isBlindedPost(post) {
    if (!post) return false;
    return post.visibility_status === 'blinded' || post.status === 'blinded';
  }

  function resolvePostStatus(post) {
    if (isBlindedPost(post)) return 'blinded';
    if (post.visibility_status === 'hidden' || post.visibility_status === 'draft') {
      return 'ended';
    }
    var deadline = resolveDeadline(post);
    if (deadline && new Date(deadline).getTime() < Date.now()) return 'ended';
    return 'active';
  }

  function statusBadgeHtml(status) {
    if (status === 'blinded') {
      return '<span class="status-badge status-blinded">블라인드됨</span>';
    }
    if (status === 'ended') {
      return '<span class="status-badge status-ended">마감됨</span>';
    }
    return '<span class="status-badge status-active">진행 중</span>';
  }

  function resolveCommentText(comment) {
    var filtered = comment.filtered_content ? String(comment.filtered_content).trim() : '';
    if (filtered) return filtered;
    return comment.content ? String(comment.content).trim() : '';
  }

  function resolveAvatarDisplay(avatarHtml) {
    var raw = avatarHtml ? String(avatarHtml).trim() : '';
    if (!raw) return '👤';
    if (raw.indexOf('<') !== -1) {
      var stripped = raw.replace(/<[^>]*>/g, '').trim();
      return stripped || '👤';
    }
    return raw.slice(0, 2);
  }

  function pickBadgeHtml(choice, optionA, optionB) {
    if (!choice) return '';
    var isA = String(choice).toUpperCase() === 'A';
    var label = isA ? 'A 픽' : 'B 픽';
    var cls = isA ? 'pick-a' : 'pick-b';
    var title = isA ? optionA || 'A' : optionB || 'B';
    return (
      ' <span class="pick-badge ' +
      cls +
      '" title="' +
      escapeHtml(title) +
      '">' +
      escapeHtml(label) +
      '</span>'
    );
  }

  function voteBoardHtml(post, stats) {
    var votesA = stats ? Number(stats.votesA) || 0 : 0;
    var votesB = stats ? Number(stats.votesB) || 0 : 0;
    var total = votesA + votesB;
    if (total <= 0) total = Number(post.vote_count) || 0;
    if (total <= 0) {
      return (
        '<div class="vote-board">' +
        '<div class="vote-text-wrap">' +
        '<div class="vote-a-text">A. ' +
        escapeHtml(post.option_a_name || 'A') +
        '</div>' +
        '<div class="vote-b-text">B. ' +
        escapeHtml(post.option_b_name || 'B') +
        '</div>' +
        '</div>' +
        '<div class="vote-bar-bg" style="opacity:0.4;">' +
        '<div class="vote-bar-a" style="width:50%;">—</div>' +
        '<div class="vote-bar-b" style="width:50%;">—</div>' +
        '</div></div>'
      );
    }
    if (votesA + votesB <= 0 && total > 0) {
      votesA = Math.floor(total / 2);
      votesB = total - votesA;
    }
    var pctA = Math.round((votesA / total) * 100);
    var pctB = 100 - pctA;
    var widthA = pctA > 0 ? Math.max(pctA, 8) : 0;
    var widthB = pctB > 0 ? Math.max(pctB, 8) : 0;
    return (
      '<div class="vote-board">' +
      '<div class="vote-text-wrap">' +
      '<div class="vote-a-text">A. ' +
      escapeHtml(post.option_a_name || 'A') +
      '</div>' +
      '<div class="vote-b-text">B. ' +
      escapeHtml(post.option_b_name || 'B') +
      '</div>' +
      '</div>' +
      '<div class="vote-bar-bg">' +
      '<div class="vote-bar-a" style="width:' +
      widthA +
      '%;">' +
      pctA +
      '%</div>' +
      '<div class="vote-bar-b" style="width:' +
      widthB +
      '%;">' +
      pctB +
      '%</div>' +
      '</div></div>'
    );
  }

  function renderPostSummary(post, stats) {
    var card = $('postSummaryCard');
    if (!card || !post) return;

    var status = resolvePostStatus(post);
    var blinded = status === 'blinded';
    var authorUid = post.author_id ? String(post.author_id).slice(0, 8) : '—';
    var blindBtnLabel = blinded ? '👁️ 블라인드 해제' : '👁️ 이 불판 강제 블라인드(숨김)';
    var blindBtnClass = blinded ? 'btn-action-post btn-restore-post' : 'btn-action-post btn-stop-post';

    card.innerHTML =
      '<div class="post-info-left">' +
      '<div class="badge-wrap">' +
      '<span class="cat-badge">' +
      escapeHtml(resolveCategoryBadge(post)) +
      '</span>' +
      statusBadgeHtml(status) +
      '<span style="font-size:0.8rem;color:var(--text-sub);align-self:center;">ID: ' +
      escapeHtml(formatPostId(post.id)) +
      '</span>' +
      '</div>' +
      '<h2 class="post-title"' +
      (blinded ? ' style="text-decoration:line-through;opacity:0.7;"' : '') +
      '>' +
      escapeHtml(resolvePostTitle(post)) +
      '</h2>' +
      '<div class="post-meta">' +
      '<span>👤 작성자: <strong>' +
      escapeHtml(resolveAuthorName(post)) +
      '</strong> (UID: ' +
      escapeHtml(authorUid) +
      ')</span>' +
      '<span>🕒 등록일: ' +
      escapeHtml(formatDateTime(post.created_at)) +
      '</span>' +
      '</div>' +
      voteBoardHtml(post, stats) +
      '</div>' +
      '<div class="post-info-right">' +
      '<div class="stat-box"><span class="stat-label">누적 투표수</span><span class="stat-val" style="color:var(--theme-gold);">' +
      formatNumber(stats && stats.total ? stats.total : post.vote_count) +
      '</span></div>' +
      '<div class="stat-box"><span class="stat-label">누적 공유(Share)수</span><span class="stat-val" style="color:var(--neon-blue);">' +
      formatNumber(post.share_count) +
      '</span></div>' +
      '<div class="stat-box"><span class="stat-label">작성된 참견(댓글)</span><span class="stat-val">' +
      formatNumber(post.comment_count) +
      '</span></div>' +
      '<div class="stat-box"><span class="stat-label">누적 신고 접수</span><span class="stat-val" style="color:var(--neon-pink);">' +
      formatNumber(post.report_count) +
      '</span></div>' +
      '<button type="button" class="' +
      blindBtnClass +
      '" id="postBlindBtn">' +
      escapeHtml(blindBtnLabel) +
      '</button>' +
      '</div>';

    var blindBtn = $('postBlindBtn');
    if (blindBtn) {
      blindBtn.addEventListener('click', function () {
        if (blinded) {
          unblindPost(post.id);
        } else {
          blindPost(post.id);
        }
      });
    }
  }

  function renderCommentRow(comment, post) {
    var blinded = comment.visibility_status === 'blinded';
    var deleted = comment.visibility_status === 'deleted';
    var rowStyle = blinded
      ? ' style="opacity:0.6;background-color:rgba(255,0,127,0.03);"'
      : deleted
        ? ' style="opacity:0.45;"'
        : '';
    var nickname = comment.author_nickname || '익명';
    var uid = comment.user_id ? String(comment.user_id).slice(0, 8) : '—';
    var text = resolveCommentText(comment);
    var reportCount = Number(comment.report_count) || 0;
    var reportHtml =
      reportCount > 0
        ? '<span class="report-count">🚨 ' + formatNumber(reportCount) + '건</span>'
        : '<span style="color:var(--text-sub);font-size:0.8rem;">0 건</span>';

    var textStyle = blinded ? ' style="color:var(--text-sub);text-decoration:line-through;"' : '';
    var autoBadge =
      blinded && reportCount >= 10
        ? '<span class="auto-blind-badge">🤖 다수 신고로 시스템 자동 숨김됨</span>'
        : blinded
          ? '<span class="auto-blind-badge">👁️ 블라인드 처리됨</span>'
          : '';

    var actionHtml;
    if (blinded) {
      actionHtml =
        '<button type="button" class="btn-sm btn-restore" data-comment-id="' +
        escapeHtml(comment.id) +
        '" onclick="restoreComment(this)">제재 무효 및 복구</button>';
    } else if (deleted) {
      actionHtml = '<span style="color:var(--text-sub);font-size:0.8rem;">삭제됨</span>';
    } else {
      actionHtml =
        '<button type="button" class="btn-sm btn-blind" data-comment-id="' +
        escapeHtml(comment.id) +
        '" data-nickname="' +
        escapeHtml(nickname) +
        '" onclick="blindComment(this)">🚨 즉시 숨김(제재)</button>';
    }

    return (
      '<tr data-comment-id="' +
      escapeHtml(comment.id) +
      '"' +
      rowStyle +
      '>' +
      '<td><div class="user-info">' +
      '<div class="avatar">' +
      escapeHtml(resolveAvatarDisplay(comment.author_avatar_html)) +
      '</div>' +
      '<div><div class="nickname">' +
      escapeHtml(nickname) +
      pickBadgeHtml(comment.vote_choice, post.option_a_name, post.option_b_name) +
      '</div>' +
      '<div class="uid">UID: ' +
      escapeHtml(uid) +
      '</div></div></div></td>' +
      '<td>' +
      autoBadge +
      '<div class="comment-text"' +
      textStyle +
      '>' +
      escapeHtml(text) +
      '</div>' +
      '<span class="comment-date">' +
      escapeHtml(formatDateTime(comment.created_at)) +
      '</span></td>' +
      '<td style="text-align:center;">' +
      reportHtml +
      '</td>' +
      '<td style="text-align:right;"><div class="action-btns" style="justify-content:flex-end;">' +
      actionHtml +
      '</div></td></tr>'
    );
  }

  function renderCommentList(comments, post) {
    var tbody = $('commentsTableBody');
    if (!tbody) return;

    if (!comments || !comments.length) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="text-align:center;padding:40px;color:#71717a;">등록된 참견이 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = comments
      .map(function (comment) {
        return renderCommentRow(comment, post);
      })
      .join('');
  }

  function showPostSummaryError(message) {
    var card = $('postSummaryCard');
    if (!card) return;
    card.innerHTML =
      '<div style="width:100%;padding:40px;text-align:center;color:#f87171;">' +
      escapeHtml(message || '불판 정보를 불러오지 못했습니다.') +
      '</div>';
  }

  function showCommentsLoading() {
    var tbody = $('commentsTableBody');
    if (!tbody) return;
    tbody.innerHTML =
      '<tr><td colspan="4" style="text-align:center;padding:40px;color:#71717a;">참견 데이터를 불러오는 중...</td></tr>';
  }

  async function loadCategoriesMap(sb) {
    categoriesMap = {};
    try {
      var res = await sb.from('categories').select('slug, name, icon');
      if (res.error || !Array.isArray(res.data)) return;
      res.data.forEach(function (row) {
        if (row && row.slug) categoriesMap[row.slug] = row;
      });
    } catch (err) {
      console.warn('[Admin Post Detail] categories load failed', err);
    }
  }

  async function fetchVoteStats(sb, id) {
    try {
      var rpc = await sb.rpc('get_post_vote_stats', { post_ids: [id] });
      if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length) {
        var st = rpc.data[0];
        return {
          votesA: Number(st.votes_a) || 0,
          votesB: Number(st.votes_b) || 0,
          total: Number(st.total) || 0,
        };
      }
    } catch (err) {
      console.warn('[Admin Post Detail] vote stats RPC failed', err);
    }
    return { votesA: 0, votesB: 0, total: 0 };
  }

  async function fetchPost(sb, id) {
    var rpc = await sb.rpc('admin_get_post', { p_post_id: id });
    if (!rpc.error && rpc.data) {
      return { data: rpc.data, error: null };
    }
    if (rpc.error) {
      console.warn('[Admin Post Detail] admin_get_post RPC fallback', rpc.error);
    }

    var select =
      'id, title, category, option_a_name, option_b_name, author_id, author_nickname, visibility_status, created_at, expires_at, vote_count, comment_count, share_count, users:author_id(nickname)';

    return sb.from('posts').select(select).eq('id', id).maybeSingle();
  }

  async function fetchComments(sb, id) {
    var rpc = await sb.rpc('admin_list_post_comments', { p_post_id: id });
    if (!rpc.error && rpc.data != null) {
      return { data: Array.isArray(rpc.data) ? rpc.data : [], error: null };
    }
    if (rpc.error) {
      console.warn('[Admin Post Detail] admin_list_post_comments RPC fallback', rpc.error);
    }

    return sb
      .from('comments')
      .select(
        'id, user_id, post_id, content, filtered_content, visibility_status, created_at, author_nickname, author_avatar_html, users:user_id(nickname, avatar_html)'
      )
      .eq('post_id', id)
      .order('created_at', { ascending: false });
  }

  async function loadPostDetail() {
    postId = getPostIdFromUrl();
    if (!postId) {
      showPostSummaryError('불판 ID가 없습니다. 목록에서 다시 접속해 주세요.');
      renderCommentList([], null);
      return;
    }

    showCommentsLoading();

    try {
      var sb = getSupabaseClient();
      await loadCategoriesMap(sb);

      var postResult = await fetchPost(sb, postId);
      if (postResult.error) throw postResult.error;
      if (!postResult.data) {
        showPostSummaryError('해당 불판을 찾을 수 없습니다.');
        renderCommentList([], null);
        return;
      }

      postCache = postResult.data;
      if (postCache.category && !postCache.category_name && categoriesMap[postCache.category]) {
        postCache.category_name = categoriesMap[postCache.category].name;
        postCache.category_icon = categoriesMap[postCache.category].icon;
      }
      if (postCache.report_count == null) postCache.report_count = 0;

      var stats = await fetchVoteStats(sb, postId);
      renderPostSummary(postCache, stats);

      var commentsResult = await fetchComments(sb, postId);
      if (commentsResult.error) throw commentsResult.error;

      commentsCache = Array.isArray(commentsResult.data) ? commentsResult.data : [];
      commentsCache.forEach(function (c) {
        if (!c.author_nickname && c.users && c.users.nickname) {
          c.author_nickname = c.users.nickname;
        }
        if (!c.author_avatar_html && c.users && c.users.avatar_html) {
          c.author_avatar_html = c.users.avatar_html;
        }
        if (c.report_count == null) c.report_count = 0;
      });

      renderCommentList(commentsCache, postCache);

      var titleEl = document.querySelector('.section-title');
      if (titleEl) {
        titleEl.textContent = '💬 참견(댓글) 실시간 모니터링 (' + formatNumber(commentsCache.length) + '건)';
      }
    } catch (err) {
      console.error('[Admin Post Detail] load failed', err);
      showPostSummaryError(err && err.message ? err.message : '불판 정보를 불러오지 못했습니다.');
      renderCommentList([], null);
    }
  }

  async function setPostVisibility(id, visibilityStatus) {
    var sb = getSupabaseClient();
    var rpc = await sb.rpc('admin_set_post_visibility', {
      p_post_id: id,
      p_status: visibilityStatus,
    });

    if (!rpc.error && rpc.data === true) return { error: null };

    if (rpc.error) {
      var fallback = await sb
        .from('posts')
        .update({ visibility_status: visibilityStatus })
        .eq('id', id)
        .select('id');
      if (fallback.error) return { error: rpc.error };
      if (!fallback.data || !fallback.data.length) {
        return { error: { message: '업데이트 대상 불판을 찾을 수 없습니다.' } };
      }
      return { error: null };
    }

    if (rpc.data === false) {
      return { error: { message: '업데이트 대상 불판을 찾을 수 없습니다.' } };
    }
    return { error: null };
  }

  async function setCommentVisibility(commentId, visibilityStatus) {
    var sb = getSupabaseClient();
    var rpc = await sb.rpc('admin_set_comment_visibility', {
      p_comment_id: commentId,
      p_status: visibilityStatus,
    });

    if (!rpc.error && rpc.data === true) return { error: null };

    if (rpc.error) {
      var fallback = await sb
        .from('comments')
        .update({ visibility_status: visibilityStatus })
        .eq('id', commentId)
        .select('id');
      if (fallback.error) return { error: rpc.error };
      if (!fallback.data || !fallback.data.length) {
        return { error: { message: '업데이트 대상 댓글을 찾을 수 없습니다.' } };
      }
      return { error: null };
    }

    if (rpc.data === false) {
      return { error: { message: '업데이트 대상 댓글을 찾을 수 없습니다.' } };
    }
    return { error: null };
  }

  async function blindPost(id) {
    if (
      !confirm(
        '해당 불판(' +
          formatPostId(id) +
          ')을 강제 숨김 처리하시겠습니까?\n시스템 규정에 따라 작성자에게 제재가 가해질 수 있습니다.'
      )
    ) {
      return;
    }
    var result = await setPostVisibility(id, 'blinded');
    if (result.error) {
      alert('상태 변경에 실패했습니다: ' + (result.error.message || '알 수 없는 오류'));
      return;
    }
    if (postCache) postCache.visibility_status = 'blinded';
    var stats = await fetchVoteStats(getSupabaseClient(), id);
    renderPostSummary(postCache, stats);
  }

  async function unblindPost(id) {
    if (!confirm('해당 불판(' + formatPostId(id) + ')의 블라인드 조치를 해제하시겠습니까?')) {
      return;
    }
    var result = await setPostVisibility(id, 'visible');
    if (result.error) {
      alert('상태 변경에 실패했습니다: ' + (result.error.message || '알 수 없는 오류'));
      return;
    }
    if (postCache) postCache.visibility_status = 'visible';
    var stats = await fetchVoteStats(getSupabaseClient(), id);
    renderPostSummary(postCache, stats);
  }

  async function blindComment(btn) {
    var username = (btn && btn.getAttribute('data-nickname')) || '유저';
    if (
      !confirm(
        '[' +
          username +
          '] 유저의 댓글을 즉시 숨김(블라인드) 처리하시겠습니까?\n\n※ 확인 시, 해당 댓글은 모든 유저에게 가려집니다.'
      )
    ) {
      return;
    }
    var row = btn.closest('tr');
    var commentId =
      (btn && btn.getAttribute('data-comment-id')) ||
      (row && row.getAttribute('data-comment-id'));
    if (!commentId) return;

    var result = await setCommentVisibility(commentId, 'blinded');
    if (result.error) {
      alert('댓글 숨김 처리에 실패했습니다: ' + (result.error.message || '알 수 없는 오류'));
      return;
    }

    var comment = commentsCache.find(function (c) {
      return c.id === commentId;
    });
    if (comment) comment.visibility_status = 'blinded';
    renderCommentList(commentsCache, postCache);
  }

  async function restoreComment(btn) {
    if (!confirm('이 댓글의 숨김 조치를 해제하시겠습니까?')) return;
    var row = btn.closest('tr');
    var commentId = row && row.getAttribute('data-comment-id');
    if (!commentId) return;

    var result = await setCommentVisibility(commentId, 'visible');
    if (result.error) {
      alert('댓글 복구에 실패했습니다: ' + (result.error.message || '알 수 없는 오류'));
      return;
    }

    var comment = commentsCache.find(function (c) {
      return c.id === commentId;
    });
    if (comment) comment.visibility_status = 'visible';
    renderCommentList(commentsCache, postCache);
  }

  window.blindComment = blindComment;
  window.restoreComment = restoreComment;
  window.loadPostDetail = loadPostDetail;

  document.addEventListener('DOMContentLoaded', function () {
    loadPostDetail();
  });
})();
