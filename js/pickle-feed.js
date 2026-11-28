/**
 * P!CKLE 메인 피드 — posts / pickle_posts Supabase 연동
 * 상단: 오늘의 픽클 · 하단: 지금 뜨거운 불판
 * 노출 순서는 DB 함수 pickle_feed_ranked 가 정하고, 함수가 없거나 실패하면 최신순으로 대체
 */
(function () {
  'use strict';

  var LOADING_HTML =
    '<div class="feed-loading">' +
    '<div class="feed-spinner" aria-hidden="true"></div>' +
    '<p>🔥 불판을 뜨겁게 달구는 중입니다...</p>' +
    '</div>';

  var feedTimerInterval = null;
  var feedIsLoading = false;

  /* ── 메인 노출 알고리즘(DB: pickle_feed_ranked) ── */
  var RANKED_PAGE_SIZE = 60;
  var FEED_QUEUE_KEY = 'pk_feed_q';
  var FEED_QUEUE_MAX = 100;
  var ANON_KEY_STORAGE = 'pk_anon_key';
  /** post id → { slot, rank } (랭킹으로 불러온 카드만) */
  var rankedMeta = new Map();
  var rankedState = { active: false, offset: 0, hasMore: false, loadingMore: false };
  var feedFlushing = false;
  var feedFlushTimer = null;
  var impressionSeen = new Set();
  var impressionObserver = null;

  var FEED_LOGIN_PROMPT =
    '🔥 픽클의 뜨거운 불판 참여는 회원만 가능합니다!\n1초 만에 회원가입하고 진짜 취향을 저격해 볼까요?';

  /** 작성자 스냅샷 우선 — tags/end_date/users 조인 실패 시에도 author 컬럼 유지 */
  var POSTS_SELECT_VARIANTS = [
    [
      'id',
      'title',
      'category',
      'option_a_name',
      'option_b_name',
      'thumbnail_url',
      'expires_at',
      'is_sponsor',
      'visibility_status',
      'created_at',
      'author_id',
      'author_nickname',
      'author_avatar_html',
    ].join(', '),
    [
      'id',
      'title',
      'category',
      'option_a_name',
      'option_b_name',
      'layout_style',
      'thumbnail_url',
      'tags',
      'expires_at',
      'end_at',
      'end_date',
      'is_sponsor',
      'visibility_status',
      'created_at',
      'author_id',
      'author_nickname',
      'author_avatar_html',
    ].join(', '),
    [
      'id',
      'title',
      'category',
      'option_a_name',
      'option_b_name',
      'thumbnail_url',
      'expires_at',
      'end_at',
      'is_sponsor',
      'visibility_status',
      'created_at',
      'author_id',
      'author_nickname',
      'author_avatar_html',
    ].join(', '),
    [
      'id',
      'title',
      'category',
      'option_a_name',
      'option_b_name',
      'thumbnail_url',
      'expires_at',
      'is_sponsor',
      'visibility_status',
      'created_at',
      'author_id',
    ].join(', '),
  ];

  var PICKLE_POSTS_SELECT_VARIANTS = [
    'id, category, title, option_a, option_b, thumbnail_url, hashtags, tags, expires_at, end_at, created_at',
    'id, category, title, option_a, option_b, hashtags, end_at, created_at',
    'id, category, title, option_a, option_b, created_at',
  ];

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safeStr(value, fallback) {
    if (value === null || value === undefined) return fallback || '';
    return String(value);
  }

  function safeTags(post) {
    if (!post) return '';
    var raw = post.tags;
    if (raw === null || raw === undefined || raw === '') {
      raw = post.hashtags;
    }
    if (raw === null || raw === undefined) return '';
    return safeStr(raw, '');
  }

  function isVideoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (window.PickleMedia && window.PickleMedia.isValidVideoUrl) {
      return window.PickleMedia.isValidVideoUrl(url);
    }
    return /youtube|youtu\.be|tiktok|vimeo|\.mp4|\.webm/i.test(url);
  }

  function isCssThumbnailValue(value) {
    if (value == null || value === '') return false;
    var s = String(value).trim();
    return (
      /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s) ||
      /^linear-gradient\(/i.test(s) ||
      /^radial-gradient\(/i.test(s) ||
      /^rgba?\(/i.test(s) ||
      /^hsla?\(/i.test(s)
    );
  }

  /** 피드 썸네일 — posts.thumbnail_url (http URL 또는 CSS 배경값) */
  function resolveFeedThumbnailUrl(thumbnailUrl) {
    try {
      if (thumbnailUrl == null || thumbnailUrl === '') return null;
      var url = String(thumbnailUrl).trim();
      if (!url) return null;
      if (isCssThumbnailValue(url)) return url;
      if (isVideoUrl(url)) return null;
      return url;
    } catch (_) {
      return null;
    }
  }

  function isCssFeedThumbnail(value) {
    return isCssThumbnailValue(value);
  }

  function escapeCssBackground(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function safeTotalVotes(post) {
    var n = Number(post && post.totalVotes);
    return Number.isFinite(n) && n >= 0 ? n : 0;
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

  function parseExpiresAt(post) {
    if (!post || post.expires_at == null || post.expires_at === '') return null;
    var endDate = new Date(post.expires_at);
    return Number.isNaN(endDate.getTime()) ? null : endDate;
  }

  function formatRemainingTimeLabel(expiresAt) {
    return getRemainingTime(expiresAt);
  }

  function formatListRemainingLabel(expiresAt) {
    return getRemainingTime(expiresAt);
  }

  function formatRemainingLabelForEl(expiresAt, el) {
    return getRemainingTime(expiresAt);
  }

  function formatFeedRemainingLabel(expiresAt) {
    return getRemainingTime(expiresAt);
  }

  function tickFeedTimers() {
    document.querySelectorAll('.feed-meta-timer[data-ends-at]').forEach(function (el) {
      var iso = el.getAttribute('data-ends-at');
      if (!iso) return;

      el.textContent = getRemainingTime(iso);

      var endsAt = new Date(iso);
      if (Number.isNaN(endsAt.getTime())) return;

      if (endsAt.getTime() - Date.now() <= 0) {
        el.classList.add('is-ended');
      } else {
        el.classList.remove('is-ended');
      }
    });
  }

  function startFeedTimerRefresh() {
    if (feedTimerInterval) {
      clearInterval(feedTimerInterval);
      feedTimerInterval = null;
    }

    tickFeedTimers();
    feedTimerInterval = setInterval(tickFeedTimers, 30000);
  }

  function stopFeedTimerRefresh() {
    if (feedTimerInterval) {
      clearInterval(feedTimerInterval);
      feedTimerInterval = null;
    }
  }

  function detailUrl(id) {
    return 'detail.html?id=' + encodeURIComponent(id);
  }

  async function hasActiveSession() {
    try {
      var sb = getClient();
      var result = await sb.auth.getSession();
      return !!(result.data && result.data.session && result.data.session.user);
    } catch (err) {
      console.warn('[P!CKLE Feed] session check failed', err);
      return false;
    }
  }

  function redirectToLoginForFeed(targetUrl) {
    var redirect = targetUrl || 'index.html';
    if (window.PickleAuth && window.PickleAuth.goToLogin) {
      window.PickleAuth.goToLogin({ redirect: redirect, from: 'vote' });
      return;
    }
    window.location.href =
      'login.html?redirect=' + encodeURIComponent(redirect) + '&from=vote';
  }

async function goDetail(id) {
    if (!id) return;

    // 로그인 여부와 상관없이 상세 페이지는 누구나 볼 수 있도록 변경.
    // 투표/댓글/좋아요 시점의 로그인 요구는 pickle-detail.js 에 이미 구현되어 있음.
    var target = detailUrl(id);
    window.location.href = target;
  }

  function getClient() {
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.isReady()) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    if (window.PickleSupabase && window.PickleSupabase.getClient) {
      return window.PickleSupabase.getClient();
    }
    throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
  }

  function showLoading(container) {
    if (container) container.innerHTML = LOADING_HTML;
  }

  function setFeedLoading(isLoading) {
    feedIsLoading = !!isLoading;
  }

  function isAuthRelatedError(err) {
    if (!err) return false;
    var code = String(err.code || err.status || err.statusCode || '').toLowerCase();
    var msg = String(err.message || err || '').toLowerCase();

    if (
      code === '401' ||
      code === '403' ||
      code === 'pgrst301' ||
      code === '42501'
    ) {
      return true;
    }

    return (
      /jwt|expired|invalid.*token|refresh token|session|not authenticated|auth session missing|user not found|invalid claim/i.test(
        msg
      ) || /unauthorized|forbidden/.test(msg)
    );
  }

  async function clearStaleSession() {
    try {
      var sb = getClient();
      await sb.auth.signOut();
    } catch (signOutErr) {
      console.warn('[P!CKLE Feed] stale session signOut failed', signOutErr);
    }

    if (window.PickleAuth && typeof window.PickleAuth.init === 'function') {
      try {
        await window.PickleAuth.init();
      } catch (_) {}
    }
  }

  /** 스피너만 남아 있으면 빈 상태로 전환 (무한 로딩 방지) */
  function clearLoadingIfStuck(container, emptyHtml) {
    if (!container) return;
    var hasContent = container.querySelector(
      '.king-card, .list-card, .feed-empty, .feed-error'
    );
    if (hasContent) return;
    if (container.querySelector('.feed-loading') || !container.innerHTML.trim()) {
      if (emptyHtml) {
        container.innerHTML = emptyHtml;
      } else {
        renderEmptyState(container);
      }
    }
  }

  function ensureFeedLoadingStopped(king, list) {
    clearLoadingIfStuck(king);
    clearLoadingIfStuck(
      list,
      '<div class="feed-empty"><p class="feed-empty-title" style="margin:0;font-size:0.85rem;">더 많은 불판이 곧 올라옵니다 🔥</p></div>'
    );
  }

  function renderGuestSafeEmptyFeed(king, list) {
    renderEmptyState(king);
    if (list) {
      list.innerHTML =
        '<div class="feed-empty"><p class="feed-empty-title" style="margin:0;font-size:0.85rem;">더 많은 불판이 곧 올라옵니다 🔥</p></div>';
    }
  }

  function calcPercent(votesA, votesB) {
    var a = Number(votesA) || 0;
    var b = Number(votesB) || 0;
    var total = a + b;
    if (total === 0) return { a: 50, b: 50, total: 0 };
    var pctA = Math.round((a / total) * 100);
    return { a: pctA, b: 100 - pctA, total: total };
  }

  function resolvePostCategoryLabel(category) {
    var slug = String(category || '').trim().toLowerCase();
    if (!slug) return null;
    if (window.PickleCategories && window.PickleCategories.resolveCategoryName) {
      return window.PickleCategories.resolveCategoryName(slug);
    }
    return slug;
  }

  function categoryLabel(category) {
    return resolvePostCategoryLabel(category);
  }

  function isSchemaColumnError(error) {
    if (!error) return false;
    var msg = safeStr(error.message, '').toLowerCase();
    return (
      msg.indexOf('column') !== -1 ||
      msg.indexOf('does not exist') !== -1 ||
      msg.indexOf('could not find') !== -1 ||
      error.code === '42703' ||
      error.code === 'PGRST204'
    );
  }

  function resolveAuthorFields(row) {
    var nickname = '';
    var avatarHtml = '';

    if (row) {
      if (row.author_nickname != null && row.author_nickname !== '') {
        nickname = safeStr(row.author_nickname, '').trim();
      }
      if (row.author_avatar_html != null && row.author_avatar_html !== '') {
        avatarHtml = safeStr(row.author_avatar_html, '').trim();
      }
      if (!nickname && row.users && row.users.nickname) {
        nickname = safeStr(row.users.nickname, '').trim();
      }
    }

    return {
      author_nickname: nickname,
      author_avatar_html: avatarHtml,
      authorNickname: nickname || null,
    };
  }

  /** 스폰서(광고) 불판 표시 — js/pickle-sponsor-badge.js 공통 모듈, 미로드 시에도 최소 표시 유지 */
  function sponsorAdHtml(post, overlay) {
    if (!post || post.is_sponsor !== true) return '';
    if (window.PickleSponsor && window.PickleSponsor.badgeHtml) {
      return overlay
        ? window.PickleSponsor.overlayHtml(post)
        : window.PickleSponsor.badgeHtml(post);
    }
    return (
      '<span role="note" aria-label="광고(스폰서) 게시물" style="' +
      (overlay ? 'position:absolute;top:10px;left:10px;z-index:3;' : 'margin-right:6px;') +
      'display:inline-block;padding:1px 5px;border-radius:4px;font-size:0.6rem;font-weight:600;' +
      'color:#a1a1aa;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);">광고</span>'
    );
  }

  function renderFeedCategoryBadge(post) {
    var categoryText = post && post.categoryLabel;
    if (!categoryText) return '';

    var badgeClass = 'feed-cat-badge';
    if (post && post.is_sponsor) {
      badgeClass += ' feed-cat-badge--sponsor';
    }
    return (
      '<span class="' +
      badgeClass +
      '">' +
      escapeHtml(categoryText) +
      '</span>'
    );
  }

  function renderFeedCardMetaFooter(post) {
    var timer = getPostTimerState(post);

    return (
      '<div class="feed-card-meta">' +
      renderFeedCategoryBadge(post) +
      '<span class="feed-meta-participants">🔥 ' +
      safeTotalVotes(post).toLocaleString() +
      '명 참여</span>' +
      '<span class="feed-meta-timer' +
      timer.endedClass +
      '"' +
      (timer.endsIso ? ' data-ends-at="' + escapeHtml(timer.endsIso) + '"' : '') +
      '>' +
      escapeHtml(timer.timerText) +
      '</span>' +
      '</div>'
    );
  }

  function renderCardThumbTop(post) {
    var rawThumb = post && post.thumbnail_url;
    var thumbValue = resolveFeedThumbnailUrl(rawThumb);

    if (thumbValue && isCssFeedThumbnail(thumbValue)) {
      return (
        '<div class="card-thumb-top" style="background:' +
        escapeCssBackground(thumbValue) +
        '">' +
        sponsorAdHtml(post, true) +
        '</div>'
      );
    }

    if (thumbValue) {
      return (
        '<div class="card-thumb-top">' +
        '<img class="card-thumb-img" src="' +
        escapeHtml(thumbValue) +
        '" alt="' +
        escapeHtml(safeStr(post && post.title, '불판 썸네일')) +
        '" loading="lazy" decoding="async">' +
        sponsorAdHtml(post, true) +
        '</div>'
      );
    }

    /* 썸네일이 없는 불판은 컬러 박스 안에 "불판 제목"을 보여준다 (제목이 없을 때만 카테고리명) */
    var fallbackTitle = post && post.title ? String(post.title).trim() : '';
    var fallbackText = fallbackTitle
      ? escapeHtml(fallbackTitle)
      : post && post.categoryLabel
        ? escapeHtml(post.categoryLabel)
        : '🔥 불판';
    return (
      '<div class="card-thumb-top card-thumb-top--fallback">' +
      '<span class="card-thumb-fallback-label" style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;max-width:100%;box-sizing:border-box;">' +
      fallbackText +
      '</span>' +
      sponsorAdHtml(post, true) +
      '</div>'
    );
  }

  function getPostTimerState(post) {
    var expiresRaw = post && post.expires_at;
    var endsAt = parseExpiresAt(post);
    var endsIso =
      expiresRaw != null && expiresRaw !== ''
        ? String(expiresRaw)
        : endsAt
          ? endsAt.toISOString()
          : '';
    var timerText = getRemainingTime(expiresRaw);
    var endedClass =
      endsAt && endsAt.getTime() - Date.now() <= 0 ? ' is-ended' : '';

    return {
      endsIso: endsIso,
      timerText: timerText,
      endedClass: endedClass,
    };
  }

  function normalizePostRow(row, source) {
    if (!row || row.id == null) return null;

    try {
      if (source === 'pickle_posts') {
        return Object.assign(
          {
            id: row.id,
            title: safeStr(row.title, '제목 없음'),
            category: row.category || null,
            categoryLabel: categoryLabel(row.category),
            option_a: safeStr(row.option_a, ''),
            option_b: safeStr(row.option_b, ''),
            thumbnail_url: resolveFeedThumbnailUrl(row.thumbnail_url),
            tags: safeTags(row),
            expires_at: row.expires_at || row.end_at || row.end_date || null,
            is_sponsor: false,
            created_at: row.created_at || null,
            author_id: row.author_id || null,
            author_nickname: '',
            author_avatar_html: '',
            authorNickname: null,
          },
          resolveAuthorFields(row)
        );
      }

      return Object.assign(
        {
          id: row.id,
          title: safeStr(row.title, '제목 없음'),
          category: row.category || null,
          categoryLabel: categoryLabel(row.category),
          option_a: safeStr(row.option_a_name, ''),
          option_b: safeStr(row.option_b_name, ''),
          thumbnail_url: resolveFeedThumbnailUrl(row.thumbnail_url),
          tags: safeTags(row),
          expires_at: row.expires_at || row.end_at || row.end_date || null,
          is_sponsor: !!row.is_sponsor,
          created_at: row.created_at || null,
          author_id: row.author_id || null,
        },
        resolveAuthorFields(row)
      );
    } catch (err) {
      console.warn('[P!CKLE Feed] normalizePostRow 실패', row && row.id, err);
      return null;
    }
  }

  async function fetchVoteStatsMap(sb, postIds) {
    var map = new Map();
    if (!postIds.length) return map;

    try {
      var rpc = await sb.rpc('get_post_vote_stats', { post_ids: postIds });
      if (!rpc.error && rpc.data) {
        rpc.data.forEach(function (st) {
          if (!st || !st.post_id) return;
          map.set(st.post_id, {
            votesA: Number(st.votes_a) || 0,
            votesB: Number(st.votes_b) || 0,
            total: Number(st.total) || 0,
          });
        });
        return map;
      }
    } catch (err) {
      console.warn('[P!CKLE Feed] RPC 투표 집계 실패', err);
    }

    try {
      var fallback = await sb
        .from('votes')
        .select('post_id, choice')
        .in('post_id', postIds);

      if (fallback.error) {
        console.warn('[P!CKLE Feed] 투표 집계 실패', fallback.error);
        return map;
      }

      postIds.forEach(function (id) {
        map.set(id, { votesA: 0, votesB: 0, total: 0 });
      });

      (fallback.data || []).forEach(function (row) {
        if (!row || !row.post_id) return;
        var st = map.get(row.post_id) || { votesA: 0, votesB: 0, total: 0 };
        if (row.choice === 'A') st.votesA += 1;
        if (row.choice === 'B') st.votesB += 1;
        st.total += 1;
        map.set(row.post_id, st);
      });
    } catch (err) {
      console.warn('[P!CKLE Feed] votes 테이블 집계 실패', err);
    }

    return map;
  }

  async function fetchCommentCountMap(sb, postIds) {
    var map = new Map();
    if (!postIds.length) return map;

    try {
      var result = await sb
        .from('comments')
        .select('post_id')
        .in('post_id', postIds)
        .in('visibility_status', ['visible', 'blinded']);

      if (result.error) {
        console.warn('[P!CKLE Feed] 댓글 수 조회 실패', result.error);
        return map;
      }

      (result.data || []).forEach(function (row) {
        if (!row || !row.post_id) return;
        map.set(row.post_id, (map.get(row.post_id) || 0) + 1);
      });
    } catch (err) {
      console.warn('[P!CKLE Feed] 댓글 수 조회 예외', err);
    }

    return map;
  }

  async function queryWithColumnFallback(sb, table, variants, applyFilters) {
    var lastError = null;

    for (var i = 0; i < variants.length; i++) {
      var query = sb.from(table).select(variants[i]);
      query = applyFilters(query);
      var result = await query;

      if (!result.error) {
        if (i > 0) {
          console.info('[P!CKLE Feed]', table, '선택 컬럼 폴백 적용 (variant', i + 1, ')');
        }
        return result;
      }

      lastError = result.error;

      if (!isSchemaColumnError(result.error)) {
        return result;
      }

      console.warn(
        '[P!CKLE Feed]',
        table,
        '컬럼 누락 — 조회 재시도',
        i + 1,
        result.error.message
      );
    }

    return { data: null, error: lastError };
  }

  function getActivePostsNowIso() {
    return new Date().toISOString();
  }

  /** 진행 중인 불판만 — expires_at > now (메인·카테고리 피드 전용) */
  function applyActivePostsFilter(q, nowIso) {
    return q.gt('expires_at', nowIso || getActivePostsNowIso());
  }

  async function fetchFromPostsTable(sb, applyFilters) {
    var nowIso = getActivePostsNowIso();
    var filterFn =
      applyFilters ||
      function (q) {
        return applyActivePostsFilter(
          q.eq('visibility_status', 'visible'),
          nowIso
        ).order('created_at', { ascending: false });
      };
    return queryWithColumnFallback(sb, 'posts', POSTS_SELECT_VARIANTS, filterFn);
  }

  async function fetchFromPicklePostsTable(sb, applyFilters) {
    var nowIso = getActivePostsNowIso();
    var filterFn =
      applyFilters ||
      function (q) {
        return applyActivePostsFilter(q, nowIso).order('created_at', {
          ascending: false,
        });
      };
    return queryWithColumnFallback(
      sb,
      'pickle_posts',
      PICKLE_POSTS_SELECT_VARIANTS,
      filterFn
    );
  }

  async function fetchPostRows(applyFilters) {
    var sb = getClient();
    var source = 'posts';
    var result = await fetchFromPostsTable(sb, applyFilters);

    if (result.error) {
      console.warn('[P!CKLE Feed] posts 조회 실패, pickle_posts 폴백', result.error);
      source = 'pickle_posts';
      result = await fetchFromPicklePostsTable(sb, applyFilters);
    }

    return {
      rows: (result && result.data) || [],
      source: source,
      error: result && result.error,
    };
  }

  async function hydrateAuthorSnapshots(sb, posts, source) {
    if (source !== 'posts' || !posts || !posts.length) return posts;

    var needIds = [];
    posts.forEach(function (p) {
      if (!p || !p.id) return;
      if (!p.author_nickname) needIds.push(p.id);
    });
    if (!needIds.length) return posts;

    try {
      var res = await sb
        .from('posts')
        .select('id, author_nickname, author_avatar_html')
        .in('id', needIds);

      if (res.error || !res.data || !res.data.length) {
        if (res.error) {
          console.warn('[P!CKLE Feed] 작성자 스냅샷 보강 실패', res.error);
        }
        return posts;
      }

      var byId = {};
      res.data.forEach(function (row) {
        if (row && row.id) byId[row.id] = row;
      });

      return posts.map(function (p) {
        var extra = byId[p.id];
        if (!extra) return p;
        if (extra.author_nickname) {
          p.author_nickname = safeStr(extra.author_nickname, '').trim();
          p.authorNickname = p.author_nickname;
        }
        if (extra.author_avatar_html) {
          p.author_avatar_html = safeStr(extra.author_avatar_html, '').trim();
        }
        return p;
      });
    } catch (err) {
      console.warn('[P!CKLE Feed] 작성자 스냅샷 보강 예외', err);
      return posts;
    }
  }

  async function enrichRowsToPosts(rows, source) {
    var sb = getClient();
    var safeRows = rows || [];
    if (!safeRows.length) return [];

    var postIds = safeRows
      .map(function (r) {
        return r && r.id;
      })
      .filter(Boolean);

    var voteStatsMap = await fetchVoteStatsMap(sb, postIds);
    var commentCountMap = await fetchCommentCountMap(sb, postIds);

    var posts = safeRows
      .map(function (row) {
        try {
          var post = normalizePostRow(row, source);
          if (!post) return null;

          var st = voteStatsMap.get(post.id) || {
            votesA: 0,
            votesB: 0,
            total: 0,
          };
          var pct = calcPercent(st.votesA, st.votesB);
          post.votesA = st.votesA;
          post.votesB = st.votesB;
          post.totalVotes = pct.total;
          post.pctA = pct.a;
          post.pctB = pct.b;
          post.commentCount = commentCountMap.get(post.id) || 0;
          post.participationScore = post.totalVotes + post.commentCount;
          post.thumbnail_url = resolveFeedThumbnailUrl(post.thumbnail_url);
          return post;
        } catch (err) {
          console.warn('[P!CKLE Feed] 게시물 정규화 실패', row && row.id, err);
          return null;
        }
      })
      .filter(Boolean);

    posts = await hydrateAuthorSnapshots(sb, posts, source);
    return hydrateThumbnailUrls(sb, posts);
  }

  /* ───────────────────────── 노출 알고리즘 연동 ───────────────────────── */

  /**
   * DB 함수로 노출 순서를 받아 불판 정보를 채운다.
   * 실패(함수 없음 등)하면 null → 호출한 쪽이 기존 최신순으로 대체한다.
   * @returns {Promise<{posts:Array,lastRank:number,hasMore:boolean}|null>}
   */
  async function fetchRankedPosts(offset) {
    var sb = getClient();
    var rpc = await sb.rpc('pickle_feed_ranked', {
      p_limit: RANKED_PAGE_SIZE,
      p_offset: offset || 0,
    });
    if (rpc.error || !Array.isArray(rpc.data)) {
      if (rpc.error) console.warn('[P!CKLE Feed] 노출 순위 조회 실패 → 최신순으로 대체', rpc.error);
      return null;
    }

    var ranked = rpc.data.filter(function (r) {
      return r && r.post_id;
    });
    if (!ranked.length) return { posts: [], lastRank: offset || 0, hasMore: false };

    var ids = ranked.map(function (r) {
      return r.post_id;
    });
    var nowIso = getActivePostsNowIso();
    var result = await fetchPostRows(function (q) {
      return applyActivePostsFilter(
        q.eq('visibility_status', 'visible').in('id', ids),
        nowIso
      );
    });
    if (result.error || result.source !== 'posts') return null;

    var posts = await enrichRowsToPosts(result.rows, result.source);
    var order = new Map();
    var maxRank = offset || 0;
    ranked.forEach(function (r, i) {
      order.set(r.post_id, i);
      var rn = Number(r.rank_no) || 0;
      if (rn > maxRank) maxRank = rn;
      rankedMeta.set(r.post_id, { slot: r.slot || null, rank: rn || null });
    });

    posts.forEach(function (p) {
      var meta = rankedMeta.get(p.id);
      p.feedSlot = meta ? meta.slot : null;
      p.feedRank = meta ? meta.rank : null;
    });
    posts.sort(function (a, b) {
      return (order.has(a.id) ? order.get(a.id) : 1e9) - (order.has(b.id) ? order.get(b.id) : 1e9);
    });

    return {
      posts: posts,
      lastRank: maxRank,
      hasMore: ranked.length >= RANKED_PAGE_SIZE,
    };
  }

  /** 메인 피드용: 노출 순서 우선, 실패/빈 결과면 기존 최신순 */
  async function fetchFeedPosts() {
    rankedMeta.clear();
    rankedState = { active: false, offset: 0, hasMore: false, loadingMore: false };

    try {
      var r = await fetchRankedPosts(0);
      if (r && r.posts.length) {
        rankedState.active = true;
        rankedState.offset = r.lastRank;
        rankedState.hasMore = r.hasMore;
        return r.posts;
      }
    } catch (err) {
      console.warn('[P!CKLE Feed] 노출 순서 적용 실패 → 최신순으로 대체', err);
    }
    return fetchPicklePosts();
  }

  /* ── 노출/클릭 기록 (실패해도 화면은 정상 동작) ── */

  function feedAnonKey() {
    try {
      var k = window.localStorage.getItem(ANON_KEY_STORAGE);
      if (!k) {
        k = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        window.localStorage.setItem(ANON_KEY_STORAGE, k);
      }
      return k;
    } catch (e) {
      return null;
    }
  }

  function feedEventId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function readFeedQueue() {
    try {
      var raw = window.localStorage.getItem(FEED_QUEUE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeFeedQueue(arr) {
    try {
      window.localStorage.setItem(FEED_QUEUE_KEY, JSON.stringify(arr.slice(-FEED_QUEUE_MAX)));
    } catch (e) {
      /* ignore */
    }
  }

  function enqueueFeedEvent(type, postId) {
    var meta = rankedMeta.get(postId);
    if (!meta) return; // 랭킹으로 불러온 카드만 기록
    var q = readFeedQueue();
    q.push({ e: type, p: postId, s: meta.slot, r: meta.rank, id: feedEventId() });
    writeFeedQueue(q);
  }

  async function flushFeedQueue() {
    if (feedFlushing) return;
    var q = readFeedQueue();
    if (!q.length) return;

    var sb;
    try {
      sb = getClient();
    } catch (e) {
      return;
    }
    if (!sb || !sb.rpc) return;

    feedFlushing = true;
    try {
      var guard = 0;
      while (q.length && guard < 5) {
        guard += 1;
        var batch = q.slice(0, 30);
        var res = await sb.rpc('pickle_feed_log', {
          p_events: batch,
          p_anon_key: feedAnonKey(),
        });
        if (res && res.error) break; // 다음 기회에 다시 시도
        var sent = {};
        batch.forEach(function (x) {
          sent[x.id] = true;
        });
        // 그사이 새로 쌓인 항목은 남기고, 보낸 것만 제거
        q = readFeedQueue().filter(function (x) {
          return !sent[x.id];
        });
        writeFeedQueue(q);
      }
    } catch (e) {
      /* ignore */
    } finally {
      feedFlushing = false;
    }
  }

  function scheduleFeedFlush(delayMs) {
    if (feedFlushTimer) clearTimeout(feedFlushTimer);
    feedFlushTimer = setTimeout(function () {
      feedFlushTimer = null;
      flushFeedQueue();
    }, delayMs == null ? 1500 : delayMs);
  }

  function logFeedClick(postId) {
    try {
      if (!postId || !rankedMeta.has(postId)) return;
      enqueueFeedEvent('click', postId);
      flushFeedQueue(); // 화면 이동 전에 최대한 전송, 못 보내도 다음 방문 때 전송
    } catch (e) {
      /* ignore */
    }
  }

  function markImpression(postId) {
    if (!postId || impressionSeen.has(postId) || !rankedMeta.has(postId)) return;
    impressionSeen.add(postId);
    enqueueFeedEvent('impression', postId);
    scheduleFeedFlush(2000);
  }

  /** 카드가 화면에 절반 이상 보이면 노출 1회 기록 (IntersectionObserver 없으면 앞쪽 일부만) */
  function observeImpressions(root) {
    if (!root || !rankedState.active) return;
    var cards = root.querySelectorAll('[data-id]');
    if (!cards.length) return;

    if (typeof window.IntersectionObserver === 'function') {
      if (!impressionObserver) {
        impressionObserver = new window.IntersectionObserver(
          function (entries) {
            entries.forEach(function (en) {
              if (!en.isIntersecting) return;
              var id = en.target.getAttribute('data-id');
              markImpression(id);
              impressionObserver.unobserve(en.target);
            });
          },
          { threshold: 0.5 }
        );
      }
      cards.forEach(function (c) {
        impressionObserver.observe(c);
      });
    } else {
      var n = 0;
      cards.forEach(function (c) {
        if (n++ < 12) markImpression(c.getAttribute('data-id'));
      });
    }
  }

  function bindFeedFlushOnHide() {
    if (bindFeedFlushOnHide.done) return;
    bindFeedFlushOnHide.done = true;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushFeedQueue();
    });
  }

  /* ── 더 보기 ── */

  function ensureLoadMoreButton(list) {
    var btn = document.getElementById('feedLoadMoreBtn');
    if (!list) return null;
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'feedLoadMoreBtn';
      btn.textContent = '불판 더 보기';
      btn.style.cssText =
        'display:none;width:calc(100% - 32px);margin:14px 16px 6px;padding:13px 0;' +
        'border-radius:999px;border:1px solid rgba(255,255,255,0.18);' +
        'background:rgba(255,255,255,0.06);color:#fcfcfc;font-size:0.9rem;' +
        'font-weight:600;cursor:pointer;font-family:inherit;';
      btn.addEventListener('click', loadMoreFeed);
      if (list.parentNode) list.parentNode.insertBefore(btn, list.nextSibling);
    }
    return btn;
  }

  function updateLoadMoreButton() {
    var list = document.getElementById('hotFeedList');
    var btn = ensureLoadMoreButton(list);
    if (!btn) return;
    btn.style.display = rankedState.active && rankedState.hasMore ? 'block' : 'none';
    btn.disabled = false;
    btn.textContent = '불판 더 보기';
  }

  async function loadMoreFeed() {
    if (!rankedState.active || !rankedState.hasMore || rankedState.loadingMore) return;
    var list = document.getElementById('hotFeedList');
    var btn = document.getElementById('feedLoadMoreBtn');
    if (!list) return;

    rankedState.loadingMore = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '불러오는 중...';
    }

    try {
      var r = await fetchRankedPosts(rankedState.offset);
      if (!r) {
        rankedState.hasMore = false;
        return;
      }
      rankedState.offset = r.lastRank;
      rankedState.hasMore = r.hasMore && r.posts.length > 0;

      var html = [];
      r.posts.forEach(function (post) {
        if (document.querySelector('#hotFeedList [data-id="' + post.id + '"]')) return;
        if (document.querySelector('#aiCurationContainer [data-id="' + post.id + '"]')) return;
        try {
          var h = buildListCardHtml(post);
          if (h) html.push(h);
        } catch (err) {
          console.warn('[P!CKLE Feed] 더보기 카드 렌더 스킵', post && post.id, err);
        }
      });

      if (html.length) {
        var before = list.querySelectorAll('.list-card').length;
        list.insertAdjacentHTML('beforeend', html.join(''));
        bindCardNavigation(list, '.list-card');
        startFeedTimerRefresh();
        var fresh = Array.prototype.slice.call(list.querySelectorAll('.list-card')).slice(before);
        fresh.forEach(function (c) {
          if (typeof window.IntersectionObserver === 'function' && impressionObserver) {
            impressionObserver.observe(c);
          } else {
            markImpression(c.getAttribute('data-id'));
          }
        });
      }
    } catch (err) {
      console.warn('[P!CKLE Feed] 더보기 실패', err);
    } finally {
      rankedState.loadingMore = false;
      updateLoadMoreButton();
    }
  }

  /**
   * Supabase posts 테이블에서 최신 불판 + 투표·댓글 집계
   * 인증 만료/탈퇴 잔여 세션 시 signOut 후 1회 재시도
   * @returns {Promise<Array>}
   */
  async function fetchPicklePosts() {
    var attempt = 0;
    var lastError = null;

    while (attempt < 2) {
      attempt += 1;
      try {
        var result = await fetchPostRows();
        if (result.error) {
          if (isAuthRelatedError(result.error) && attempt === 1) {
            await clearStaleSession();
            continue;
          }
          throw result.error;
        }
        return enrichRowsToPosts(result.rows, result.source);
      } catch (err) {
        lastError = err;
        if (isAuthRelatedError(err) && attempt === 1) {
          await clearStaleSession();
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('불판 데이터를 불러오지 못했습니다.');
  }

  async function hydrateThumbnailUrls(sb, posts) {
    if (!posts || !posts.length) return posts || [];

    var needIds = [];
    posts.forEach(function (p) {
      if (!p || !p.id) return;
      if (!resolveFeedThumbnailUrl(p.thumbnail_url || null)) {
        needIds.push(p.id);
      }
    });
    if (!needIds.length) return posts;

    try {
      var res = await sb.from('posts').select('id, thumbnail_url').in('id', needIds);
      if (res.error || !res.data || !res.data.length) return posts;

      var byId = {};
      res.data.forEach(function (row) {
        if (!row || !row.id) return;
        var url = resolveFeedThumbnailUrl(row.thumbnail_url || null);
        if (url) byId[row.id] = url;
      });

      return posts.map(function (p) {
        if (!p || !p.id) return p;
        if (resolveFeedThumbnailUrl(p.thumbnail_url || null)) return p;
        var hydrated = byId[p.id] || null;
        if (hydrated) p.thumbnail_url = hydrated;
        return p;
      });
    } catch (_) {
      return posts;
    }
  }

  function renderKingAbBox(post) {
    return (
      '<div class="king-ab-box">' +
      '<span class="king-ab-a">[A: ' +
      escapeHtml(safeStr(post && post.option_a, '')) +
      ']</span>' +
      '<span class="king-ab-vs">vs</span>' +
      '<span class="king-ab-b">[B: ' +
      escapeHtml(safeStr(post && post.option_b, '')) +
      ']</span>' +
      '</div>'
    );
  }

  function buildKingCardHtml(post, cardIndex) {
    if (!post || post.id == null) return '';

    var pickVariants = ['coral', 'blue', 'mint'];
    var pickVariant = pickVariants[(cardIndex || 0) % 3];

    return (
      '<article class="king-card" data-id="' +
      escapeHtml(post.id) +
      '" role="button" tabindex="0" aria-label="' +
      escapeHtml(safeStr(post.title, '불판')) +
      '">' +
      renderCardThumbTop(post) +
      '<div class="card-body">' +
      '<h2 class="title">' +
      escapeHtml(safeStr(post.title, '제목 없음')) +
      '</h2>' +
      renderKingAbBox(post) +
      '<button type="button" class="btn-pick btn-pick--' +
      pickVariant +
      '"><span class="btn-pick-icon-circle" aria-hidden="true">✓</span> 내 픽 남기기</button>' +
      renderFeedCardMetaFooter(post) +
      '</div>' +
      '</article>'
    );
  }

  function renderListVsBox(post) {
    return (
      '<div class="text-vs-box">' +
      '<span class="vs-a">' +
      escapeHtml(safeStr(post && post.option_a, '')) +
      '</span>' +
      '<span class="vs-label">VS</span>' +
      '<span class="vs-b">' +
      escapeHtml(safeStr(post && post.option_b, '')) +
      '</span>' +
      '</div>'
    );
  }

  function buildListCardHtml(post) {
    if (!post || post.id == null) return '';

    var sponsorClass = post.is_sponsor ? ' sponsor-card' : '';

    return (
      '<article class="list-card' +
      sponsorClass +
      '" data-id="' +
      escapeHtml(post.id) +
      '" role="button" tabindex="0">' +
      renderCardThumbTop(post) +
      '<div class="card-body">' +
      '<h3 class="title">' +
      escapeHtml(safeStr(post.title, '제목 없음')) +
      '</h3>' +
      renderListVsBox(post) +
      renderFeedCardMetaFooter(post) +
      '</div>' +
      '</article>'
    );
  }

  function bindCardNavigation(root, selector) {
    if (!root) return;
    root.querySelectorAll(selector).forEach(function (card) {
      var id = card.dataset.id;
      if (!id) return;
      if (card.dataset.pkBound === '1') return;
      card.dataset.pkBound = '1';
      card.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        logFeedClick(id);
        goDetail(id);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          logFeedClick(id);
          goDetail(id);
        }
      });
    });
  }

  function renderEmptyState(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="feed-empty">' +
      '<p class="feed-empty-title">아직 지펴진 불판이 없습니다.<br>첫 불판의 주인이 되어보세요! 🔥</p>' +
      '<button type="button" class="btn-create-feed" onclick="location.href=\'create.html\'">불판 생성하기</button>' +
      '</div>';
  }

  function renderKingCards(posts) {
    var container = document.getElementById('aiCurationContainer');
    if (!container) return;

    var safePosts = (posts || []).filter(Boolean);
    if (!safePosts.length) {
      renderEmptyState(container);
      return;
    }

    var htmlParts = [];
    safePosts.forEach(function (post, index) {
      try {
        var html = buildKingCardHtml(post, index);
        if (html) htmlParts.push(html);
      } catch (err) {
        console.warn('[P!CKLE Feed] 킹 카드 렌더 스킵', post && post.id, err);
      }
    });

    if (!htmlParts.length) {
      renderEmptyState(container);
      return;
    }

    container.innerHTML = htmlParts.join('');
    bindCardNavigation(container, '.king-card');
    startFeedTimerRefresh();
  }

  function renderFeedList(posts) {
    var container = document.getElementById('hotFeedList');
    if (!container) return;

    renderListToContainer(container, posts, {
      emptyHtml:
        '<div class="feed-empty"><p class="feed-empty-title" style="margin:0;font-size:0.85rem;">더 많은 불판이 곧 올라옵니다 🔥</p></div>',
    });
  }

  function renderListToContainer(container, posts, options) {
    if (!container) return;

    options = options || {};
    var safePosts = (posts || []).filter(Boolean);

    if (!safePosts.length) {
      container.innerHTML =
        options.emptyHtml ||
        '<div class="feed-empty"><p class="feed-empty-title" style="margin:0;font-size:0.85rem;">표시할 불판이 없습니다.</p></div>';
      return;
    }

    var htmlParts = [];
    safePosts.forEach(function (post) {
      try {
        var html = buildListCardHtml(post);
        if (html) htmlParts.push(html);
      } catch (err) {
        console.warn('[P!CKLE Feed] 리스트 카드 렌더 스킵', post && post.id, err);
      }
    });

    container.innerHTML = htmlParts.length
      ? htmlParts.join('')
      : options.emptyHtml ||
        '<div class="feed-empty"><p class="feed-empty-title" style="margin:0;font-size:0.85rem;">표시할 불판이 없습니다.</p></div>';

    bindCardNavigation(container, '.list-card');
    startFeedTimerRefresh();
  }

  function showFeedError(message, detail) {
    var king = document.getElementById('aiCurationContainer');
    var list = document.getElementById('hotFeedList');
    var full = message + (detail ? '\n' + detail : '');
    var html =
      '<div class="feed-empty feed-error">' +
      escapeHtml(message) +
      (detail && /[?&]debug=1/.test(location.search)
        ? '<p style="font-size:0.75rem;margin-top:8px;opacity:0.85;word-break:break-all;">' +
          escapeHtml(detail) +
          '</p>'
        : '') +
      '</div>';
    if (king) king.innerHTML = html;
    if (list) list.innerHTML = '';
    console.error('[P!CKLE Feed]', full);
  }

  function formatErrorDetail(err) {
    if (!err) return '알 수 없는 오류';
    if (typeof err === 'string') return err;
    var parts = [];
    if (err.message) parts.push(err.message);
    if (err.code) parts.push('code: ' + err.code);
    if (err.details) parts.push(String(err.details));
    if (err.hint) parts.push('hint: ' + err.hint);
    return parts.length ? parts.join(' | ') : String(err);
  }

  function renderFeedFromPosts(all, king, list) {
    if (!all || !all.length) {
      renderEmptyState(king);
      if (list) {
        list.innerHTML =
          '<div class="feed-empty"><p class="feed-empty-title" style="margin:0;font-size:0.85rem;">더 많은 불판이 곧 올라옵니다 🔥</p></div>';
      }
      return;
    }

    var kingPosts;
    var listPosts;
    if (rankedState.active) {
      kingPosts = all.filter(function (p) {
        return p.feedSlot === 'king_score' || p.feedSlot === 'king_new';
      });
      listPosts = all.filter(function (p) {
        return !(p.feedSlot === 'king_score' || p.feedSlot === 'king_new');
      });
      if (!kingPosts.length) {
        kingPosts = all.slice(0, 3);
        listPosts = all.slice(3);
      }
    } else {
      kingPosts = all.slice(0, 3);
      listPosts = all.slice(3);
    }

    try {
      renderKingCards(kingPosts);
    } catch (kingErr) {
      console.error('[P!CKLE Feed] 킹왕짱 렌더 실패', kingErr);
      if (king) {
        king.innerHTML =
          '<div class="feed-empty feed-error">킹왕짱 영역을 그리지 못했습니다.<p style="font-size:0.75rem;margin-top:8px;">' +
          escapeHtml(formatErrorDetail(kingErr)) +
          '</p></div>';
      }
    }

    try {
      renderFeedList(listPosts);
    } catch (listErr) {
      console.error('[P!CKLE Feed] 리스트 렌더 실패', listErr);
      if (list) {
        list.innerHTML =
          '<div class="feed-empty feed-error">리스트를 그리지 못했습니다.<p style="font-size:0.75rem;margin-top:8px;">' +
          escapeHtml(formatErrorDetail(listErr)) +
          '</p></div>';
      }
    }
  }

  function afterFeedRendered(king, list) {
    try {
      impressionSeen = new Set();
      if (impressionObserver) {
        impressionObserver.disconnect();
        impressionObserver = null;
      }
      bindFeedFlushOnHide();
      observeImpressions(king);
      observeImpressions(list);
      updateLoadMoreButton();
    } catch (e) {
      console.warn('[P!CKLE Feed] 후처리 실패(무시)', e);
    }
  }

  async function loadPickleFeed() {
    if (window.PickleCategories && window.PickleCategories.load) {
      try {
        await window.PickleCategories.load();
      } catch (catErr) {
        console.warn('[P!CKLE Feed] categories load failed', catErr);
      }
    }

    var king = document.getElementById('aiCurationContainer');
    var list = document.getElementById('hotFeedList');

    stopFeedTimerRefresh();
    setFeedLoading(true);
    showLoading(king);
    showLoading(list);

    try {
      flushFeedQueue(); // 지난번에 못 보낸 클릭 기록이 있으면 전송
      var all = await fetchFeedPosts();
      renderFeedFromPosts(all, king, list);
      afterFeedRendered(king, list);
    } catch (err) {
      var detail = formatErrorDetail(err);
      console.error('[P!CKLE Feed] loadPickleFeed 실패', err);

      if (isAuthRelatedError(err)) {
        await clearStaleSession();
        try {
          var allRetry = await fetchFeedPosts();
          renderFeedFromPosts(allRetry, king, list);
          afterFeedRendered(king, list);
          return;
        } catch (retryErr) {
          console.error('[P!CKLE Feed] auth recovery retry failed', retryErr);
          renderGuestSafeEmptyFeed(king, list);
        }
      } else {
        showFeedError('불판을 잠깐 불러오지 못했어요. 화면을 새로고침해 주세요 🔄', detail);
      }
    } finally {
      setFeedLoading(false);
      ensureFeedLoadingStopped(king, list);
    }
  }

  window.PickleFeed = {
    load: loadPickleFeed,
    fetchPicklePosts: fetchPicklePosts,
    fetchFeedPosts: fetchFeedPosts,
    loadMore: loadMoreFeed,
    applyActivePostsFilter: applyActivePostsFilter,
    getActivePostsNowIso: getActivePostsNowIso,
    fetchPostRows: fetchPostRows,
    enrichRowsToPosts: enrichRowsToPosts,
    renderListToContainer: renderListToContainer,
    showLoading: showLoading,
    setFeedLoading: setFeedLoading,
    isAuthRelatedError: isAuthRelatedError,
    clearStaleSession: clearStaleSession,
    hasActiveSession: hasActiveSession,
    redirectToLoginForFeed: redirectToLoginForFeed,
    FEED_LOGIN_PROMPT: FEED_LOGIN_PROMPT,
    goDetail: goDetail,
    categoryLabel: categoryLabel,
    resolvePostCategoryLabel: resolvePostCategoryLabel,
    renderCardThumbTop: renderCardThumbTop,
    LOADING_HTML: LOADING_HTML,
  };

  function startMainFeedWhenReady() {
    var bootstrap = window.PickleSupabaseBootstrap;
    var attempts = 0;
    var maxAttempts = 40;

    function tryLoad() {
      if (
        (bootstrap && bootstrap.isReady()) ||
        (window.PickleSupabase && window.PickleSupabase.getClient) ||
        attempts >= maxAttempts
      ) {
        loadPickleFeed();
        return;
      }
      attempts += 1;
      setTimeout(tryLoad, 100);
    }

    tryLoad();
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (
      document.getElementById('hotFeedList') ||
      document.getElementById('aiCurationContainer')
    ) {
      startMainFeedWhenReady();

      if (window.PickleAuth && window.PickleAuth.ensureAuthenticated) {
        window.PickleAuth.ensureAuthenticated({ skipProfile: true }).catch(function (authErr) {
          if (window.PickleFeed.isAuthRelatedError(authErr)) {
            window.PickleFeed.clearStaleSession();
          }
        });
      }
    }
  });
})();
