/**
 * P!CKLE 메인 피드 — posts / pickle_posts Supabase 연동
 * 상단 3개: 킹왕짱 · 하단: 실시간 리스트
 */
(function () {
  'use strict';

  var CATEGORY_LABELS = {
    hot: '🔥 HOT',
    brand: '🤝 브랜드',
    love: '💖 연애',
    brain: '⚖️ 밸런스',
    ugc: '✨ UGC',
    other: '📌 기타',
  };

  var LOADING_HTML =
    '<div class="feed-loading">' +
    '<div class="feed-spinner" aria-hidden="true"></div>' +
    '<p>🔥 불판을 뜨겁게 달구는 중입니다...</p>' +
    '</div>';

  var feedTimerInterval = null;

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

  /** 피드 썸네일 — posts.thumbnail_url 만 허용 (본문 미디어 스포일러 차단) */
  function resolveFeedThumbnailUrl(thumbnailUrl) {
    try {
      if (thumbnailUrl == null || thumbnailUrl === '') return null;
      var url = String(thumbnailUrl).trim();
      if (!url || isVideoUrl(url)) return null;
      return url;
    } catch (_) {
      return null;
    }
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

  function goDetail(id) {
    if (!id) return;
    window.location.href = detailUrl(id);
  }

  function getClient() {
    if (!window.PickleSupabase || !window.PickleSupabase.getClient) {
      throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
    }
    return window.PickleSupabase.getClient();
  }

  function showLoading(container) {
    if (container) container.innerHTML = LOADING_HTML;
  }

  function calcPercent(votesA, votesB) {
    var a = Number(votesA) || 0;
    var b = Number(votesB) || 0;
    var total = a + b;
    if (total === 0) return { a: 50, b: 50, total: 0 };
    var pctA = Math.round((a / total) * 100);
    return { a: pctA, b: 100 - pctA, total: total };
  }

  function categoryLabel(category) {
    if (!category) return '🔥 불판';
    return CATEGORY_LABELS[category] || safeStr(category, '🔥 불판');
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

  function renderFeedCategoryBadge(post) {
    var categoryText = safeStr(post && post.categoryLabel, '🔥 불판');
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
      '명 참전</span>' +
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
    var thumbUrl = resolveFeedThumbnailUrl((post && post.thumbnail_url) || null);

    if (thumbUrl) {
      return (
        '<div class="card-thumb-top">' +
        '<img class="card-thumb-img" src="' +
        escapeHtml(thumbUrl) +
        '" alt="' +
        escapeHtml(safeStr(post && post.title, '불판 썸네일')) +
        '" loading="lazy" decoding="async">' +
        '</div>'
      );
    }

    var fallbackCat = escapeHtml(safeStr(post && post.categoryLabel, '불판'));
    return (
      '<div class="card-thumb-top card-thumb-top--fallback">' +
      '<span class="card-thumb-fallback-label">' +
      fallbackCat +
      '</span></div>'
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
        .eq('visibility_status', 'visible');

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

  async function fetchFromPostsTable(sb, applyFilters) {
    var filterFn =
      applyFilters ||
      function (q) {
        return q
          .eq('visibility_status', 'visible')
          .order('created_at', { ascending: false });
      };
    return queryWithColumnFallback(sb, 'posts', POSTS_SELECT_VARIANTS, filterFn);
  }

  async function fetchFromPicklePostsTable(sb, applyFilters) {
    var filterFn =
      applyFilters ||
      function (q) {
        return q.order('created_at', { ascending: false });
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

  /**
   * Supabase posts 테이블에서 최신 불판 + 투표·댓글 집계
   * @returns {Promise<Array>}
   */
  async function fetchPicklePosts() {
    var result = await fetchPostRows();
    if (result.error) {
      throw new Error(result.error.message || String(result.error));
    }
    return enrichRowsToPosts(result.rows, result.source);
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

  function buildKingCardHtml(post) {
    if (!post || post.id == null) return '';

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
      '<button type="button" class="btn-pick">결과가 궁금하다면? 참전하기 🔥</button>' +
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
      card.addEventListener('click', function () {
        goDetail(id);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
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
    safePosts.forEach(function (post) {
      try {
        var html = buildKingCardHtml(post);
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
      (detail
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

  async function loadPickleFeed() {
    var king = document.getElementById('aiCurationContainer');
    var list = document.getElementById('hotFeedList');

    stopFeedTimerRefresh();
    showLoading(king);
    showLoading(list);

    try {
      var all = await fetchPicklePosts();

      if (!all.length) {
        renderEmptyState(king);
        renderEmptyState(list);
        return;
      }

      var kingPosts = all.slice(0, 3);
      var listPosts = all.slice(3);

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
    } catch (err) {
      var detail = formatErrorDetail(err);
      console.error('[P!CKLE Feed] loadPickleFeed 실패', err);
      alert('불판을 불러오지 못했습니다.\n\n' + detail);
      showFeedError('불판을 불러오지 못했습니다.', detail);
    }
  }

  window.PickleFeed = {
    load: loadPickleFeed,
    fetchPicklePosts: fetchPicklePosts,
    fetchPostRows: fetchPostRows,
    enrichRowsToPosts: enrichRowsToPosts,
    renderListToContainer: renderListToContainer,
    showLoading: showLoading,
    goDetail: goDetail,
    categoryLabel: categoryLabel,
    LOADING_HTML: LOADING_HTML,
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (
      document.getElementById('hotFeedList') ||
      document.getElementById('aiCurationContainer')
    ) {
      loadPickleFeed();
    }
  });
})();
