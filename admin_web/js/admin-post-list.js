/**
 * P!CKLE Admin — 일반 불판 관리 (Supabase posts)
 */
(function () {
  'use strict';

  var postsCache = [];
  /** @type {Record<string, string>} slug → 한글 카테고리명 */
  var categoryMap = {};
  /** @type {Array<{slug:string,name:string}>} */
  var categoriesList = [];
  var voteStatsCache = new Map();
  var categoriesReady = false;

  var POST_SELECT =
    'id, title, category, option_a_name, option_b_name, author_id, author_nickname, visibility_status, created_at, expires_at, vote_count, comment_count, share_count, users:author_id(nickname)';

  var FALLBACK_CATEGORIES = [
    ['worldcup', '북중미 월드컵'],
    ['food', '먹잘알/푸파'],
    ['love', '연애/과몰입'],
    ['balance', '뇌정지 밸런스'],
    ['fashion', 'OOTD/스타일'],
    ['drama', '빌런/썰'],
    ['fandom', '덕질/서브컬처'],
    ['games', '겜심/이스포츠'],
    ['pets', '힐링/동물'],
    ['sports', '스포츠/매치업'],
    ['spending', '텅장/소비'],
    ['mind', 'MBTI/심리'],
    ['kpop', '돌판/K-POP'],
    ['mystery', '미스터리'],
    ['driving', '블박/과실'],
  ];

  var CATEGORY_BADGE_COLORS = {
    worldcup: { bg: 'rgba(0, 240, 255, 0.12)', border: 'rgba(0, 240, 255, 0.4)', color: '#7dd3fc' },
    food: { bg: 'rgba(251, 146, 60, 0.14)', border: 'rgba(251, 146, 60, 0.45)', color: '#fdba74' },
    love: { bg: 'rgba(255, 0, 127, 0.12)', border: 'rgba(255, 0, 127, 0.38)', color: '#f472b6' },
    balance: { bg: 'rgba(161, 161, 170, 0.16)', border: 'rgba(161, 161, 170, 0.42)', color: '#d4d4d8' },
    fashion: { bg: 'rgba(255, 204, 0, 0.12)', border: 'rgba(255, 204, 0, 0.42)', color: '#fde047' },
    drama: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' },
    fandom: { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.4)', color: '#c4b5fd' },
    games: { bg: 'rgba(57, 255, 20, 0.1)', border: 'rgba(57, 255, 20, 0.35)', color: '#86efac' },
    pets: { bg: 'rgba(52, 211, 153, 0.12)', border: 'rgba(52, 211, 153, 0.4)', color: '#6ee7b7' },
    sports: { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.4)', color: '#86efac' },
    spending: { bg: 'rgba(250, 204, 21, 0.12)', border: 'rgba(250, 204, 21, 0.42)', color: '#fcd34d' },
    mind: { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.4)', color: '#93c5fd' },
    kpop: { bg: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.4)', color: '#f9a8d4' },
    mystery: { bg: 'rgba(100, 116, 139, 0.18)', border: 'rgba(100, 116, 139, 0.45)', color: '#cbd5e1' },
    driving: { bg: 'rgba(14, 165, 233, 0.12)', border: 'rgba(14, 165, 233, 0.4)', color: '#7dd3fc' },
  };

  var BADGE_COLOR_PALETTE = [
    { bg: 'rgba(0, 240, 255, 0.12)', border: 'rgba(0, 240, 255, 0.4)', color: '#7dd3fc' },
    { bg: 'rgba(255, 0, 127, 0.12)', border: 'rgba(255, 0, 127, 0.38)', color: '#f472b6' },
    { bg: 'rgba(57, 255, 20, 0.1)', border: 'rgba(57, 255, 20, 0.35)', color: '#86efac' },
    { bg: 'rgba(255, 204, 0, 0.12)', border: 'rgba(255, 204, 0, 0.42)', color: '#fde047' },
    { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.4)', color: '#c4b5fd' },
    { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.4)', color: '#93c5fd' },
  ];

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

  function resolveCategoryName(name, slug) {
    return name ? String(name).trim() : slug;
  }

  function hashSlug(slug) {
    var h = 0;
    for (var i = 0; i < slug.length; i++) {
      h = (h * 31 + slug.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  function getCategoryBadgeStyle(slug) {
    var key = slug ? String(slug).trim() : '';
    var c = key ? CATEGORY_BADGE_COLORS[key] : null;
    if (!c && key) {
      c = BADGE_COLOR_PALETTE[hashSlug(key) % BADGE_COLOR_PALETTE.length];
    }
    if (!c) {
      c = { bg: '#27272a', border: '#3f3f46', color: '#e4e4e7' };
    }
    return (
      'background-color:' +
      c.bg +
      ';border:1px solid ' +
      c.border +
      ';color:' +
      c.color +
      ';'
    );
  }

  function registerCategory(slug, name) {
    if (!slug) return;
    var s = String(slug).trim();
    var displayName = resolveCategoryName(name, s);
    categoryMap[s] = displayName;
    var exists = categoriesList.some(function (c) {
      return c.slug === s;
    });
    if (!exists) {
      categoriesList.push({ slug: s, name: displayName });
    }
  }

  function applyFallbackCategories() {
    FALLBACK_CATEGORIES.forEach(function (row) {
      registerCategory(row[0], row[1]);
    });
  }

  function normalizePostCategoryFields(post) {
    if (!post) return;
    var slug = String(post.category_slug || post.category || '').trim();
    post.category_slug = slug;
    post.category = slug;
  }

  async function loadCategories(sb) {
    categoryMap = {};
    categoriesList = [];
    categoriesReady = false;

    var rows = [];

    try {
      var rpc = await sb.rpc('admin_list_categories');
      if (!rpc.error && Array.isArray(rpc.data)) {
        rows = rpc.data;
      } else if (rpc.error) {
        console.warn('[Admin Posts] admin_list_categories RPC fallback', rpc.error);
      }
    } catch (err) {
      console.warn('[Admin Posts] admin_list_categories failed', err);
    }

    if (!rows.length) {
      try {
        var res = await sb
          .from('categories')
          .select('slug, name, icon, sort_order')
          .order('sort_order', { ascending: true });
        if (!res.error && Array.isArray(res.data)) {
          rows = res.data;
        } else if (res.error) {
          console.warn('[Admin Posts] categories table load error', res.error);
        }
      } catch (err2) {
        console.warn('[Admin Posts] categories table load failed', err2);
      }
    }

    rows.forEach(function (row) {
      if (!row || !row.slug) return;
      registerCategory(row.slug, row.name);
    });

    if (!Object.keys(categoryMap).length) {
      console.warn('[Admin Posts] categoryMap empty — using fallback seed');
      applyFallbackCategories();
    }

    categoriesReady = true;
    console.info('[Admin Posts] categoryMap ready:', Object.keys(categoryMap).length);
  }

  function renderCategoryFilterOptions() {
    var select = $('filterCategorySelect') || document.querySelector('.cat-filter');
    if (!select) return;

    var sorted = categoriesList.slice().sort(function (a, b) {
      return (a.name || a.slug).localeCompare(b.name || b.slug, 'ko');
    });

    var html = '<option value="all">전체 카테고리 보기</option>';
    sorted.forEach(function (cat) {
      html +=
        '<option value="' +
        escapeHtml(cat.slug) +
        '">' +
        escapeHtml(cat.name) +
        '</option>';
    });
    select.innerHTML = html;
  }

  function getTodayStartIso() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  function setKpiValue(id, value) {
    var el = $(id);
    if (el) el.textContent = formatNumber(value ?? 0);
  }

  async function loadKPIs(sb) {
    var todayStart = getTodayStartIso();
    var nowIso = new Date().toISOString();

    try {
      var results = await Promise.all([
        sb.from('posts').select('*', { count: 'exact', head: true }),
        sb
          .from('posts')
          .select('*', { count: 'exact', head: true })
          .eq('visibility_status', 'visible')
          .or('expires_at.is.null,expires_at.gt.' + JSON.stringify(nowIso)),
        sb.from('posts').select('*', { count: 'exact', head: true }).eq('visibility_status', 'blinded'),
        sb
          .from('comments')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', todayStart),
      ]);

      setKpiValue('kpiTotalPosts', results[0].count ?? 0);
      setKpiValue('kpiActivePosts', results[1].count ?? 0);
      setKpiValue('kpiBlindedPosts', results[2].count ?? 0);
      setKpiValue('kpiTodayComments', results[3].count ?? 0);
    } catch (err) {
      console.warn('[Admin Posts] loadKPIs failed', err);
      setKpiValue('kpiTotalPosts', 0);
      setKpiValue('kpiActivePosts', 0);
      setKpiValue('kpiBlindedPosts', 0);
      setKpiValue('kpiTodayComments', 0);
    }
  }

  function getFilterValues() {
    var searchEl = $('filterSearchInput');
    var catEl = $('filterCategorySelect') || document.querySelector('.cat-filter');
    var statusEl = $('filterStatusSelect');
    var sortEl = $('filterSortSelect');
    return {
      search: searchEl ? String(searchEl.value || '').trim().toLowerCase() : '',
      category: catEl ? String(catEl.value || 'all').trim() : 'all',
      status: statusEl ? statusEl.value || 'all' : 'all',
      sort: sortEl ? sortEl.value || 'newest' : 'newest',
    };
  }

  function sortPosts(list, sortKey) {
    var sorted = list.slice();
    sorted.sort(function (a, b) {
      if (sortKey === 'votes') {
        return (Number(b.vote_count) || 0) - (Number(a.vote_count) || 0);
      }
      if (sortKey === 'comments') {
        return (Number(b.comment_count) || 0) - (Number(a.comment_count) || 0);
      }
      var dateA = new Date(a.created_at || 0).getTime();
      var dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });
    return sorted;
  }

  function applyClientFilters(source, filters) {
    var f = filters || getFilterValues();
    var list = source.filter(function (post) {
      var status = resolvePostStatus(post);
      if (f.status !== 'all' && status !== f.status) return false;

      if (f.search) {
        var title = resolvePostTitle(post).toLowerCase();
        var author = resolveAuthorName(post).toLowerCase();
        if (title.indexOf(f.search) === -1 && author.indexOf(f.search) === -1) {
          return false;
        }
      }
      return true;
    });
    return sortPosts(list, f.sort);
  }

  async function fetchPostsFromSupabase(sb, queryFilters) {
    queryFilters = queryFilters || {};
    var categorySlug =
      queryFilters.category && queryFilters.category !== 'all'
        ? String(queryFilters.category).trim()
        : '';

    if (categorySlug) {
      var rpcCat = await sb.rpc('admin_list_posts', {
        p_limit: 200,
        p_offset: 0,
        p_category: categorySlug,
      });
      if (!rpcCat.error && rpcCat.data != null) {
        return { data: Array.isArray(rpcCat.data) ? rpcCat.data : [], error: null };
      }
      if (rpcCat.error) {
        console.warn('[Admin Posts] admin_list_posts category RPC fallback', rpcCat.error);
      }

      return sb
        .from('posts')
        .select(POST_SELECT)
        .eq('category', categorySlug)
        .order('created_at', { ascending: false })
        .limit(200);
    }

    var rpcArgs = { p_limit: 200, p_offset: 0, p_category: null };
    var rpc = await sb.rpc('admin_list_posts', rpcArgs);
    if (!rpc.error && rpc.data != null) {
      return { data: Array.isArray(rpc.data) ? rpc.data : [], error: null };
    }

    if (rpc.error) {
      console.warn('[Admin Posts] admin_list_posts(3) RPC fallback', rpc.error);
      var rpc2 = await sb.rpc('admin_list_posts', { p_limit: 200, p_offset: 0 });
      if (!rpc2.error && rpc2.data != null) {
        return { data: Array.isArray(rpc2.data) ? rpc2.data : [], error: null };
      }
    }

    return sb
      .from('posts')
      .select(POST_SELECT)
      .order('created_at', { ascending: false })
      .limit(200);
  }

  async function fetchAndRenderPosts(sb, queryFilters) {
    var filters = queryFilters || getFilterValues();
    var result = await fetchPostsFromSupabase(sb, filters);
    if (result.error) throw result.error;

    var posts = Array.isArray(result.data) ? result.data : [];
    posts.forEach(normalizePostCategoryFields);

    postsCache = posts;
    var filtered = applyClientFilters(posts, filters);

    var postIds = filtered.map(function (p) {
      return p.id;
    });
    var voteStatsMap = await fetchVoteStatsMap(sb, postIds);
    voteStatsCache = voteStatsMap;

    renderPostList(filtered, voteStatsMap);
    updateTableTotal(filtered.length);
  }

  async function applyFilters() {
    if (!categoriesReady) {
      alert('카테고리 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    showLoadingRow();
    try {
      var sb = getSupabaseClient();
      await fetchAndRenderPosts(sb, getFilterValues());
    } catch (err) {
      console.error('[Admin Posts] applyFilters failed', err);
      showErrorRow(err && err.message ? err.message : '조회에 실패했습니다.');
      updateTableTotal(0);
    }
  }

  async function resetFilters() {
    var searchEl = $('filterSearchInput');
    var catEl = $('filterCategorySelect') || document.querySelector('.cat-filter');
    var statusEl = $('filterStatusSelect');
    var sortEl = $('filterSortSelect');
    if (searchEl) searchEl.value = '';
    if (catEl) catEl.value = 'all';
    if (statusEl) statusEl.value = 'all';
    if (sortEl) sortEl.value = 'newest';

    showLoadingRow();
    try {
      var sb = getSupabaseClient();
      await fetchAndRenderPosts(sb, getFilterValues());
    } catch (err) {
      console.error('[Admin Posts] resetFilters failed', err);
      showErrorRow(err && err.message ? err.message : '목록을 불러오지 못했습니다.');
      updateTableTotal(0);
    }
  }

  function bindFilterEvents() {
    var searchBtn = $('btnSearchFilter');
    var resetBtn = $('btnResetFilter');
    var searchInput = $('filterSearchInput');

    if (searchBtn) searchBtn.addEventListener('click', applyFilters);
    if (resetBtn) resetBtn.addEventListener('click', resetFilters);
    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') applyFilters();
      });
    }
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
    normalizePostCategoryFields(post);
    var status = resolvePostStatus(post);
    var blinded = status === 'blinded';
    var ended = status === 'ended';
    var rowStyle = blinded
      ? ' style="opacity:0.6; background-color:rgba(255,0,127,0.02);"'
      : '';
    var titleStyle = blinded ? ' style="text-decoration:line-through;"' : '';
    var deadlineStyle = ended && !blinded ? ' style="color:var(--text-sub);"' : '';
    var categoryLabel = categoryMap[post.category_slug] || post.category_slug || '—';
    var categoryBadgeStyle = getCategoryBadgeStyle(post.category_slug);

    return (
      '<tr data-post-id="' +
      escapeHtml(post.id) +
      '" data-category-slug="' +
      escapeHtml(post.category_slug || '') +
      '"' +
      rowStyle +
      '>' +
      '<td class="post-id">' +
      escapeHtml(formatPostId(post.id)) +
      '</td>' +
      '<td><span class="cat-badge" style="' +
      categoryBadgeStyle +
      '">' +
      escapeHtml(categoryLabel) +
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
        '<tr><td colspan="7" style="text-align:center;padding:40px;color:#71717a;">조건에 맞는 불판이 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = posts
      .map(function (post) {
        normalizePostCategoryFields(post);
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

  async function loadPosts() {
    showLoadingRow();
    try {
      var sb = getSupabaseClient();

      await loadCategories(sb);
      renderCategoryFilterOptions();

      await Promise.all([fetchAndRenderPosts(sb, getFilterValues()), loadKPIs(sb)]);
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
    loadKPIs(getSupabaseClient());
  }

  async function unblindPost(btn, postId) {
    if (!confirm('해당 불판(' + formatPostId(postId) + ')의 블라인드 조치를 해제하시겠습니까?')) {
      return;
    }

    var result = await setPostVisibility(postId, 'visible');
    if (result.error) {
      alert('상태 변경에 실패했습니다: ' + (result.error.message || '알 수 없는 오류'));
      return;
    }

    applyRowVisibilityUI(btn, postId, 'visible');
    loadKPIs(getSupabaseClient());
  }

  window.applyFilters = applyFilters;
  window.resetFilters = resetFilters;
  window.blindPost = blindPost;
  window.unblindPost = unblindPost;
  window.loadPosts = loadPosts;

  document.addEventListener('DOMContentLoaded', function () {
    bindFilterEvents();
    loadPosts();
  });
})();
