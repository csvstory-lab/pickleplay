/**
 * P!CKLE Admin — 일반 불판 관리 (Supabase posts)
 */
(function () {
  'use strict';

  var postsCache = [];
  var categoriesMap = {};
  var voteStatsCache = new Map();

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

  function formatNumber(n) {
    return Number(n || 0).toLocaleString('ko-KR');
  }

  function formatPostId(id) {
    if (!id) return '#—';
    var s = String(id).replace(/-/g, '');
    return '#' + s.slice(0, 8).toUpperCase();
  }

  function formatDeadline(value) {
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

  function formatDeadlineDisplay(post) {
    var deadline = resolveDeadline(post);
    if (!deadline) return '마감일 미정';
    return formatDeadline(deadline);
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

  function voteSummaryHtml(post, stats) {
    var votesA = stats ? Number(stats.votesA) || 0 : 0;
    var votesB = stats ? Number(stats.votesB) || 0 : 0;
    var total = votesA + votesB;
    if (total <= 0) total = Number(post.vote_count) || 0;
    if (total <= 0) {
      return (
        '<div class="vote-summary">' +
        '<span class="vote-count" style="color:var(--text-sub);">총 0명 투표</span>' +
        '<div class="mini-bar-wrapper" style="opacity:0.4;">' +
        '<div class="mini-bar-a" style="width:50%;"></div>' +
        '<div class="mini-bar-b" style="width:50%;"></div>' +
        '</div>' +
        '<div class="vote-pct" style="opacity:0.6;">' +
        '<span class="pct-a">' +
        escapeHtml(post.option_a_name || 'A') +
        ' (—)</span>' +
        '<span class="pct-b">' +
        escapeHtml(post.option_b_name || 'B') +
        ' (—)</span>' +
        '</div></div>'
      );
    }
    if (votesA + votesB <= 0 && total > 0) {
      votesA = Math.floor(total / 2);
      votesB = total - votesA;
    }
    var pctA = Math.round((votesA / total) * 100);
    var pctB = 100 - pctA;
    var ended = resolvePostStatus(post) === 'ended';
    var dim = ended ? ' style="opacity:0.6;"' : '';
    var countColor = ended ? ' style="color:var(--text-sub);"' : '';
    return (
      '<div class="vote-summary">' +
      '<span class="vote-count"' +
      countColor +
      '>총 ' +
      formatNumber(total) +
      '명 투표</span>' +
      '<div class="mini-bar-wrapper"' +
      dim +
      '>' +
      '<div class="mini-bar-a" style="width:' +
      pctA +
      '%;"></div>' +
      '<div class="mini-bar-b" style="width:' +
      pctB +
      '%;"></div>' +
      '</div>' +
      '<div class="vote-pct"' +
      dim +
      '>' +
      '<span class="pct-a">' +
      escapeHtml(post.option_a_name || 'A') +
      ' (' +
      pctA +
      '%)</span>' +
      '<span class="pct-b">' +
      escapeHtml(post.option_b_name || 'B') +
      ' (' +
      pctB +
      '%)</span>' +
      '</div></div>'
    );
  }

  function actionButtonsHtml(post, status) {
    var id = post.id;
    var idAttr = escapeHtml(id);
    if (status === 'blinded') {
      return (
        '<div class="action-btns">' +
        '<button type="button" class="btn-sm btn-detail" onclick="location.href=\'admin_post_detail.html?id=' +
        id +
        '\'">사유 확인</button>' +
        '<button type="button" class="btn-sm btn-unblind" onclick="unblindPost(this, \'' +
        idAttr +
        '\')">숨김 해제</button>' +
        '</div>'
      );
    }
    return (
      '<div class="action-btns">' +
      '<button type="button" class="btn-sm btn-detail" onclick="location.href=\'admin_post_detail.html?id=' +
      id +
      '\'">상세/댓글</button>' +
      '<button type="button" class="btn-sm btn-blind" onclick="blindPost(this, \'' +
      idAttr +
      '\')">블라인드</button>' +
      '</div>'
    );
  }

  function renderPostRow(post, stats) {
    var status = resolvePostStatus(post);
    var blinded = status === 'blinded';
    var ended = status === 'ended';
    var rowStyle = blinded
      ? ' style="opacity:0.6; background-color:rgba(255,0,127,0.02);"'
      : '';
    var titleStyle = blinded ? ' style="text-decoration:line-through;"' : '';
    var deadlineStyle = ended && !blinded ? ' style="color:var(--text-sub);"' : '';

    return (
      '<tr data-post-id="' +
      escapeHtml(post.id) +
      '"' +
      rowStyle +
      '>' +
      '<td class="post-id">' +
      escapeHtml(formatPostId(post.id)) +
      '</td>' +
      '<td><span class="cat-badge">' +
      escapeHtml(resolveCategoryBadge(post)) +
      '</span></td>' +
      '<td class="post-title-cell">' +
      '<span class="post-title"' +
      titleStyle +
      '>' +
      escapeHtml(resolvePostTitle(post)) +
      '</span>' +
      '<span class="post-author">작성자: ' +
      escapeHtml(resolveAuthorName(post)) +
      ' <span style="margin:0 5px;">|</span> ' +
      '<span class="meta-stat">💬 참견 ' +
      formatNumber(post.comment_count) +
      '</span> <span style="margin:0 5px;">|</span> ' +
      '<span class="meta-share">🔗 공유 ' +
      formatNumber(post.share_count) +
      '</span></span>' +
      '</td>' +
      '<td>' +
      voteSummaryHtml(post, stats) +
      '</td>' +
      '<td' +
      deadlineStyle +
      '>' +
      escapeHtml(formatDeadlineDisplay(post)) +
      '</td>' +
      '<td>' +
      statusBadgeHtml(status) +
      '</td>' +
      '<td>' +
      actionButtonsHtml(post, status) +
      '</td>' +
      '</tr>'
    );
  }

  function renderPostList(posts, voteStatsMap) {
    var tbody = $('postsTableBody');
    if (!tbody) return;

    if (!posts.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;padding:40px;color:#71717a;">등록된 불판이 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = posts
      .map(function (post) {
        return renderPostRow(post, voteStatsMap.get(post.id));
      })
      .join('');
  }

  function showLoadingRow() {
    var tbody = $('postsTableBody');
    if (!tbody) return;
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:40px;color:#71717a;">불판 데이터를 불러오는 중...</td></tr>';
  }

  function showErrorRow(message) {
    var tbody = $('postsTableBody');
    if (!tbody) return;
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:40px;color:#f87171;">' +
      escapeHtml(message || '불판 목록을 불러오지 못했습니다.') +
      '</td></tr>';
  }

  function updateTableTotal(count) {
    var el = $('postsTableTotal');
    if (el) el.textContent = String(count);
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
      console.warn('[Admin Posts] categories load failed', err);
    }
  }

  async function fetchVoteStatsMap(sb, postIds) {
    var map = new Map();
    if (!postIds.length) return map;
    try {
      var rpc = await sb.rpc('get_post_vote_stats', { post_ids: postIds });
      if (!rpc.error && Array.isArray(rpc.data)) {
        rpc.data.forEach(function (st) {
          if (!st || !st.post_id) return;
          map.set(st.post_id, {
            votesA: Number(st.votes_a) || 0,
            votesB: Number(st.votes_b) || 0,
            total: Number(st.total) || 0,
          });
        });
      }
    } catch (err) {
      console.warn('[Admin Posts] vote stats RPC failed', err);
    }
    return map;
  }

  async function fetchPostsFromSupabase(sb) {
    var rpc = await sb.rpc('admin_list_posts', { p_limit: 200, p_offset: 0 });
    if (!rpc.error && rpc.data != null) {
      return { data: Array.isArray(rpc.data) ? rpc.data : [], error: null };
    }
    if (rpc.error) {
      console.warn('[Admin Posts] admin_list_posts RPC fallback', rpc.error);
    }

    var select =
      'id, title, category, option_a_name, option_b_name, author_id, author_nickname, visibility_status, created_at, expires_at, vote_count, comment_count, share_count, users:author_id(nickname)';

    return sb
      .from('posts')
      .select(select)
      .order('created_at', { ascending: false })
      .limit(200);
  }

  async function loadPosts() {
    showLoadingRow();
    try {
      var sb = getSupabaseClient();
      await loadCategoriesMap(sb);

      var result = await fetchPostsFromSupabase(sb);
      if (result.error) throw result.error;

      postsCache = Array.isArray(result.data) ? result.data : [];
      postsCache.forEach(function (post) {
        if (post.category && !post.category_name && categoriesMap[post.category]) {
          post.category_name = categoriesMap[post.category].name;
          post.category_icon = categoriesMap[post.category].icon;
        }
      });

      var postIds = postsCache.map(function (p) {
        return p.id;
      });
      var voteStatsMap = await fetchVoteStatsMap(sb, postIds);
      voteStatsCache = voteStatsMap;

      renderPostList(postsCache, voteStatsMap);
      updateTableTotal(postsCache.length);
    } catch (err) {
      console.error('[Admin Posts] loadPosts failed', err);
      showErrorRow(err && err.message ? err.message : '불판 목록을 불러오지 못했습니다.');
      updateTableTotal(0);
    }
  }

  async function setPostVisibility(postId, visibilityStatus) {
    var sb = getSupabaseClient();

    var rpc = await sb.rpc('admin_set_post_visibility', {
      p_post_id: postId,
      p_status: visibilityStatus,
    });

    if (!rpc.error && rpc.data === true) {
      return { error: null };
    }

    if (rpc.error) {
      console.warn('[Admin Posts] admin_set_post_visibility RPC error', rpc.error);
      var fallback = await sb
        .from('posts')
        .update({ visibility_status: visibilityStatus })
        .eq('id', postId)
        .select('id');
      if (fallback.error) {
        return { error: rpc.error };
      }
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

  function applyRowVisibilityUI(btn, postId, visibilityStatus) {
    var post = postsCache.find(function (p) {
      return p.id === postId;
    });
    if (!post) return;

    post.visibility_status = visibilityStatus;
    post.status = visibilityStatus;

    var row = btn.closest('tr');
    if (!row) return;

    row.outerHTML = renderPostRow(post, voteStatsCache.get(postId));
  }

  async function blindPost(btn, postId) {
    if (
      !confirm(
        '해당 불판(' +
          formatPostId(postId) +
          ')을 강제 숨김 처리하시겠습니까?\n시스템 규정에 따라 작성자에게 제재가 가해질 수 있습니다.'
      )
    ) {
      return;
    }

    var result = await setPostVisibility(postId, 'blinded');
    if (result.error) {
      alert('상태 변경에 실패했습니다: ' + (result.error.message || '알 수 없는 오류'));
      return;
    }

    applyRowVisibilityUI(btn, postId, 'blinded');
  }

  async function unblindPost(btn, postId) {
    if (!confirm('해당 불판(' + formatPostId(postId) + ')의 블라인드 조치를 해제하시겠습니까?')) {
      return;
    }

    // DB 컬럼 visibility_status — 복구 값은 'visible' (UI 상태명 'active'와 동일 의미)
    var result = await setPostVisibility(postId, 'visible');
    if (result.error) {
      alert('상태 변경에 실패했습니다: ' + (result.error.message || '알 수 없는 오류'));
      return;
    }

    applyRowVisibilityUI(btn, postId, 'visible');
  }

  window.blindPost = blindPost;
  window.unblindPost = unblindPost;
  window.loadPosts = loadPosts;

  document.addEventListener('DOMContentLoaded', function () {
    loadPosts();
  });
})();
