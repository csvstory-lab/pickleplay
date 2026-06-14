/**
 * P!CKLE — 검색 페이지 (search.html) Supabase 연동
 * UI/HTML/CSS 변경 없이 데이터만 주입
 * @build 20260613_search1
 */
(function () {
  'use strict';

  var FALLBACK_TRENDING_SLUGS = ['drama', 'driving', 'food', 'fashion', 'balance'];

  var TREND_BADGES = [
    { cls: 'badge-up', text: '▲ 급상승' },
    { cls: 'badge-stay', text: '- 유지' },
    { cls: 'badge-new', text: 'N NEW' },
    { cls: 'badge-up', text: '▲ 2' },
    { cls: 'badge-stay', text: '- 유지' },
  ];

  var POST_SELECT_VARIANTS = [
    [
      'id',
      'title',
      'category',
      'option_a_name',
      'option_b_name',
      'tags',
      'vote_count',
      'comment_count',
      'expires_at',
      'visibility_status',
      'status',
      'created_at',
      'author_id',
      'author_nickname',
    ].join(', '),
    [
      'id',
      'title',
      'category',
      'option_a_name',
      'option_b_name',
      'tags',
      'expires_at',
      'visibility_status',
      'created_at',
      'author_id',
      'author_nickname',
    ].join(', '),
    [
      'id',
      'title',
      'category',
      'option_a_name',
      'option_b_name',
      'expires_at',
      'visibility_status',
      'created_at',
      'author_id',
    ].join(', '),
  ];

  var TRENDING_SELECT_VARIANTS = [
    'category, vote_count, comment_count, created_at',
    'category, created_at',
  ];

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  function getClient() {
    if (!window.PickleSupabase || !window.PickleSupabase.getClient) {
      return null;
    }
    return window.PickleSupabase.getClient();
  }

  function getCategoriesApi() {
    return window.PickleCategories || null;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function sevenDaysAgoIso() {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  function isSchemaColumnError(err) {
    if (!err) return false;
    var msg = String(err.message || err.details || '').toLowerCase();
    return (
      err.code === '42703' ||
      err.code === 'PGRST204' ||
      /column/.test(msg) ||
      /does not exist/.test(msg)
    );
  }

  async function queryWithColumnFallback(sb, table, variants, applyFilters) {
    var lastError = null;

    for (var i = 0; i < variants.length; i++) {
      var query = sb.from(table).select(variants[i]);
      query = applyFilters(query);
      var result = await query;

      if (!result.error) {
        return result;
      }

      lastError = result.error;
      if (!isSchemaColumnError(result.error)) {
        return result;
      }
    }

    return { data: null, error: lastError };
  }

  function applyVisiblePostsFilter(q) {
    return q.eq('visibility_status', 'visible');
  }

  function applyActivePostsFilter(q) {
    return applyVisiblePostsFilter(q).gt('expires_at', nowIso());
  }

  function sanitizeIlikePattern(keyword) {
    var term = String(keyword || '').trim();
    if (!term) return '';
    return '%' + term.replace(/[%_\\]/g, '') + '%';
  }

  function formatVoteCount(n) {
    var num = Number(n);
    if (!Number.isFinite(num) || num < 0) num = 0;
    return num.toLocaleString('ko-KR');
  }

  function formatPollTime(expiresAt) {
    if (expiresAt == null || expiresAt === '') return '진행 중';

    var end = new Date(expiresAt);
    if (Number.isNaN(end.getTime())) return '진행 중';

    var diffMs = end.getTime() - Date.now();
    if (diffMs <= 0) return '마감 완료';

    var diffMins = Math.floor(diffMs / (1000 * 60));
    var diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 60) return diffMins + '분 후 종료';
    if (diffHours < 24) return diffHours + '시간 후 종료';
    return '진행 중';
  }

  function optionA(post) {
    return post.option_a_name || post.option_a || 'A';
  }

  function optionB(post) {
    return post.option_b_name || post.option_b || 'B';
  }

  function detailUrl(id) {
    return 'detail.html?id=' + encodeURIComponent(id);
  }

  function getCategoryRow(slug) {
    var api = getCategoriesApi();
    if (!api || !api.getCategories) return null;
    var list = api.getCategories();
    var key = String(slug || '').trim().toLowerCase();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].slug === key) return list[i];
    }
    return null;
  }

  function categoryKeyword(slug) {
    var row = getCategoryRow(slug);
    if (row && row.name) return row.name;
    if (getCategoriesApi() && getCategoriesApi().labelFromSlug) {
      var label = getCategoriesApi().labelFromSlug(slug);
      if (label) {
        return label.replace(/^[^\s]+\s*/, '').trim() || label;
      }
    }
    return slug;
  }

  function categoryExploreParts(slug) {
    var row = getCategoryRow(slug);
    if (row) {
      return {
        icon: row.icon || '📂',
        text: row.name || slug,
      };
    }
    return { icon: '📂', text: categoryKeyword(slug) };
  }

  function aggregateCategoryScores(rows) {
    var map = Object.create(null);

    (rows || []).forEach(function (row) {
      var slug = String(row.category || '').trim().toLowerCase();
      if (!slug) return;

      var votes = Number(row.vote_count);
      var comments = Number(row.comment_count);
      if (!Number.isFinite(votes)) votes = 0;
      if (!Number.isFinite(comments)) comments = 0;

      if (!map[slug]) {
        map[slug] = { slug: slug, score: 0, count: 0 };
      }
      map[slug].score += votes + comments;
      map[slug].count += 1;
    });

    return Object.keys(map)
      .map(function (key) {
        return map[key];
      })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return b.count - a.count;
      });
  }

  async function fetchRecentPostsForCategories() {
    var sb = getClient();
    if (!sb) return [];

    var since = sevenDaysAgoIso();
    var lastError = null;

    for (var i = 0; i < TRENDING_SELECT_VARIANTS.length; i++) {
      var cols = TRENDING_SELECT_VARIANTS[i];
      var result = await applyVisiblePostsFilter(sb.from('posts').select(cols))
        .gte('created_at', since)
        .limit(500);

      if (!result.error) {
        return result.data || [];
      }

      lastError = result.error;
      if (!isSchemaColumnError(result.error)) break;
    }

    if (lastError) {
      console.warn('[P!CKLE Search] 최근 카테고리 집계 실패', lastError);
    }
    return [];
  }

  function buildTrendingItems(scoredCategories) {
    var items = (scoredCategories || []).slice(0, 5).map(function (entry, idx) {
      var badge = TREND_BADGES[idx] || TREND_BADGES[TREND_BADGES.length - 1];
      return {
        slug: entry.slug,
        keyword: categoryKeyword(entry.slug),
        rank: idx + 1,
        badgeCls: badge.cls,
        badgeText: badge.text,
      };
    });

    if (items.length >= 5) return items;

    var used = Object.create(null);
    items.forEach(function (it) {
      used[it.slug] = true;
    });

    FALLBACK_TRENDING_SLUGS.forEach(function (slug) {
      if (items.length >= 5) return;
      if (used[slug]) return;
      used[slug] = true;
      var idx = items.length;
      var badge = TREND_BADGES[idx] || TREND_BADGES[TREND_BADGES.length - 1];
      items.push({
        slug: slug,
        keyword: categoryKeyword(slug),
        rank: idx + 1,
        badgeCls: badge.cls,
        badgeText: badge.text,
      });
    });

    return items.slice(0, 5);
  }

  function renderTrendingHtml(items) {
    return (items || [])
      .map(function (item) {
        var rankCls = item.rank <= 3 ? ' top' : '';
        return (
          '<div class="trending-item" data-trend-slug="' +
          escapeAttr(item.slug) +
          '" role="button" tabindex="0">' +
          '<div class="trend-left">' +
          '<span class="trend-rank' +
          rankCls +
          '">' +
          item.rank +
          '</span>' +
          '<span class="trend-keyword">' +
          escapeHtml(item.keyword) +
          '</span>' +
          '</div>' +
          '<span class="trend-badge ' +
          escapeAttr(item.badgeCls) +
          '">' +
          escapeHtml(item.badgeText) +
          '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  function renderExploreHtml(topSlugs) {
    var html =
      '<div class="explore-card" data-explore-hall="1" role="button" tabindex="0">' +
      '<div class="explore-icon">🏅</div>' +
      '<div class="explore-text">전당 후보작</div>' +
      '</div>';

    (topSlugs || []).slice(0, 3).forEach(function (slug) {
      var parts = categoryExploreParts(slug);
      html +=
        '<div class="explore-card" data-explore-slug="' +
        escapeAttr(slug) +
        '" role="button" tabindex="0">' +
        '<div class="explore-icon">' +
        escapeHtml(parts.icon) +
        '</div>' +
        '<div class="explore-text">' +
        escapeHtml(parts.text) +
        '</div>' +
        '</div>';
    });

    return html;
  }

  function renderPollCardHtml(post) {
    var votes = formatVoteCount(post.vote_count);
    var timeLabel = formatPollTime(post.expires_at);
    var href = detailUrl(post.id);

    return (
      '<div class="poll-card" data-post-id="' +
      escapeAttr(post.id) +
      '" role="button" tabindex="0">' +
      '<div class="poll-header">' +
      '<span class="poll-fire">🔥 ' +
      votes +
      '명 참전 중</span>' +
      '<span class="poll-time">' +
      escapeHtml(timeLabel) +
      '</span>' +
      '</div>' +
      '<div class="poll-title">' +
      escapeHtml(post.title || '제목 없음') +
      '</div>' +
      '<div class="vs-preview">' +
      '<div class="vs-item">' +
      escapeHtml(optionA(post)) +
      '</div>' +
      '<span class="vs-center">VS</span>' +
      '<div class="vs-item">' +
      escapeHtml(optionB(post)) +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function bindTrendingClicks(container) {
    if (!container) return;
    container.querySelectorAll('[data-trend-slug]').forEach(function (el) {
      var slug = el.getAttribute('data-trend-slug');
      function go() {
        goCategory(slug);
      }
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
    });
  }

  function bindExploreClicks(container) {
    if (!container) return;
    container.querySelectorAll('[data-explore-hall]').forEach(function (el) {
      function go() {
        window.location.href = 'hall_of_fame.html';
      }
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
    });

    container.querySelectorAll('[data-explore-slug]').forEach(function (el) {
      var slug = el.getAttribute('data-explore-slug');
      function go() {
        goCategory(slug);
      }
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
    });
  }

  function bindPollCardClicks(container) {
    if (!container) return;
    container.querySelectorAll('.poll-card[data-post-id]').forEach(function (el) {
      var id = el.getAttribute('data-post-id');
      function go() {
        if (id) window.location.href = detailUrl(id);
      }
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
    });
  }

  function goCategory(slug) {
    var api = getCategoriesApi();
    if (api && api.buildCategoryUrl) {
      window.location.href = api.buildCategoryUrl(slug);
      return;
    }
    window.location.href = 'category.html?category=' + encodeURIComponent(slug);
  }

  async function renderTrending() {
    var box = document.getElementById('trendingBox');
    if (!box) return;

    var rows = await fetchRecentPostsForCategories();
    var scored = aggregateCategoryScores(rows);
    var items = buildTrendingItems(scored);

    box.innerHTML = renderTrendingHtml(items);
    bindTrendingClicks(box);
  }

  async function renderExplore() {
    var grid = document.getElementById('exploreGrid');
    if (!grid) return;

    var rows = await fetchRecentPostsForCategories();
    var scored = aggregateCategoryScores(rows);
    var topSlugs = scored.map(function (s) {
      return s.slug;
    });

    if (topSlugs.length < 3) {
      FALLBACK_TRENDING_SLUGS.forEach(function (slug) {
        if (topSlugs.length >= 3) return;
        if (topSlugs.indexOf(slug) === -1) topSlugs.push(slug);
      });
    }

    grid.innerHTML = renderExploreHtml(topSlugs);
    bindExploreClicks(grid);
  }

  async function fetchHotActivePosts() {
    var sb = getClient();
    if (!sb) return [];

    var orders = ['vote_count', null];

    for (var o = 0; o < orders.length; o++) {
      var orderCol = orders[o];

      for (var i = 0; i < POST_SELECT_VARIANTS.length; i++) {
        var cols = POST_SELECT_VARIANTS[i];

        var result = await queryWithColumnFallback(sb, 'posts', [cols], function (q) {
          q = applyActivePostsFilter(q);
          if (orderCol) {
            return q.order(orderCol, { ascending: false }).limit(2);
          }
          return q.order('created_at', { ascending: false }).limit(2);
        });

        if (!result.error && result.data) {
          return result.data;
        }

        if (result.error && !isSchemaColumnError(result.error)) {
          console.warn('[P!CKLE Search] 핫 불판 조회 실패', result.error);
          break;
        }
      }
    }

    return [];
  }

  async function renderHotPolls() {
    var list = document.getElementById('hotPollList');
    if (!list) return;

    var posts = await fetchHotActivePosts();
    if (!posts.length) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = posts.map(renderPollCardHtml).join('');
    bindPollCardClicks(list);
  }

  async function searchPosts(keyword) {
    var sb = getClient();
    if (!sb) return [];

    var pattern = sanitizeIlikePattern(keyword);
    if (!pattern) return [];

    var seen = Object.create(null);
    var merged = [];

    function addRows(rows) {
      (rows || []).forEach(function (post) {
        if (!post || !post.id || seen[post.id]) return;
        seen[post.id] = true;
        merged.push(post);
      });
    }

    var orFilter =
      'title.ilike.' +
      pattern +
      ',tags.ilike.' +
      pattern +
      ',author_nickname.ilike.' +
      pattern;

    for (var i = 0; i < POST_SELECT_VARIANTS.length; i++) {
      var cols = POST_SELECT_VARIANTS[i];
      var textResult = await applyVisiblePostsFilter(sb.from('posts').select(cols))
        .or(orFilter)
        .order('created_at', { ascending: false })
        .limit(40);

      if (!textResult.error) {
        addRows(textResult.data);
        break;
      }

      if (!isSchemaColumnError(textResult.error)) {
        console.warn('[P!CKLE Search] 텍스트 검색 실패', textResult.error);
        break;
      }
    }

    var userResult = await sb
      .from('users')
      .select('id')
      .ilike('nickname', pattern)
      .limit(30);

    if (!userResult.error && userResult.data && userResult.data.length) {
      var authorIds = userResult.data.map(function (u) {
        return u.id;
      });

      for (var j = 0; j < POST_SELECT_VARIANTS.length; j++) {
        var cols2 = POST_SELECT_VARIANTS[j];
        var byAuthor = await applyVisiblePostsFilter(sb.from('posts').select(cols2))
          .in('author_id', authorIds)
          .order('created_at', { ascending: false })
          .limit(40);

        if (!byAuthor.error) {
          addRows(byAuthor.data);
          break;
        }

        if (!isSchemaColumnError(byAuthor.error)) {
          console.warn('[P!CKLE Search] 닉네임 검색 실패', byAuthor.error);
          break;
        }
      }
    } else if (userResult.error) {
      console.warn('[P!CKLE Search] users 닉네임 조회 실패', userResult.error);
    }

    merged.sort(function (a, b) {
      var va = Number(a.vote_count) || 0;
      var vb = Number(b.vote_count) || 0;
      if (vb !== va) return vb - va;
      var ca = a.created_at ? new Date(a.created_at).getTime() : 0;
      var cb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return cb - ca;
    });

    return merged;
  }

  function setSearchUrl(keyword) {
    var url = new URL(window.location.href);
    var trimmed = String(keyword || '').trim();
    if (trimmed) {
      url.searchParams.set('q', trimmed);
    } else {
      url.searchParams.delete('q');
    }
    window.history.pushState({ q: trimmed || null }, '', url);
  }

  function clearSearchUrl() {
    var url = new URL(window.location.href);
    if (!url.searchParams.has('q')) return;
    url.searchParams.delete('q');
    window.history.replaceState({}, '', url);
  }

  function renderSearchResults(keyword, posts) {
    var list = document.getElementById('searchResultsList');
    var countEl = document.getElementById('searchResultCount');
    var keywordEl = document.getElementById('searchKeywordDisplay');

    if (keywordEl) keywordEl.textContent = "'" + keyword + "'";
    if (countEl) {
      countEl.textContent = '검색 결과 ' + (posts ? posts.length : 0) + '건';
    }

    if (!list) return;

    if (!posts || !posts.length) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = posts.map(renderPollCardHtml).join('');
    bindPollCardClicks(list);
  }

  async function executeSearch(keyword) {
    var term = String(keyword || '').trim();
    if (!term) return;

    if (navigator.vibrate) navigator.vibrate(20);

    var input = document.getElementById('searchInput');
    if (input) {
      input.value = term;
      input.blur();
      var clearBtn = document.getElementById('clearBtn');
      if (clearBtn) clearBtn.style.display = 'block';
    }

    document.getElementById('defaultExploreUI').classList.add('hidden');
    document.getElementById('searchResultsUI').classList.remove('hidden');

    setSearchUrl(term);
    window.scrollTo(0, 0);

    var posts = await searchPosts(term);
    renderSearchResults(term, posts);
  }

  function showExploreUI() {
    document.getElementById('searchResultsUI').classList.add('hidden');
    document.getElementById('defaultExploreUI').classList.remove('hidden');
    clearSearchUrl();
    window.scrollTo(0, 0);
  }

  async function initPage() {
    var api = getCategoriesApi();
    if (api && api.ready) {
      try {
        await api.ready();
      } catch (err) {
        console.warn('[P!CKLE Search] 카테고리 로드 실패 — 폴백 사용', err);
      }
    }

    await Promise.all([renderTrending(), renderExplore(), renderHotPolls()]);

    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q && String(q).trim()) {
      executeSearch(String(q).trim());
    }
  }

  window.addEventListener('popstate', function () {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q && String(q).trim()) {
      executeSearch(String(q).trim());
    } else {
      var input = document.getElementById('searchInput');
      if (input) input.value = '';
      var clearBtn = document.getElementById('clearBtn');
      if (clearBtn) clearBtn.style.display = 'none';
      showExploreUI();
    }
  });

  window.PickleSearch = {
    executeSearch: executeSearch,
    showExploreUI: showExploreUI,
    searchPosts: searchPosts,
    refreshDiscovery: function () {
      return Promise.all([renderTrending(), renderExplore(), renderHotPolls()]);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
})();
