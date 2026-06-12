/**
 * P!CKLE — 카테고리 리스트 페이지 (category.html)
 */
(function () {
  'use strict';

  var SORT_OPTIONS = [
    { id: 'today_popular', label: '오늘인기순' },
    { id: 'deadline', label: '마감임박순' },
    { id: 'participants', label: '참여자순' },
    { id: 'latest', label: '최신순' },
  ];

  var state = {
    category: 'all',
    sort: 'today_popular',
    unseenOnly: false,
    loading: false,
    votedPostIds: new Set(),
  };

  function getFeedApi() {
    if (!window.PickleFeed) {
      throw new Error('PickleFeed 모듈을 불러오지 못했습니다.');
    }
    return window.PickleFeed;
  }

  function getCategoriesApi() {
    if (!window.PickleCategories) {
      throw new Error('PickleCategories 모듈을 불러오지 못했습니다.');
    }
    return window.PickleCategories;
  }

  function getClient() {
    if (!window.PickleSupabase || !window.PickleSupabase.getClient) {
      throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
    }
    return window.PickleSupabase.getClient();
  }

  function parseUrlState() {
    var params = new URLSearchParams(window.location.search);
    var rawCategory = params.get('category') || params.get('cat') || 'all';
    var rawSort = params.get('sort') || 'today_popular';

    state.category = getCategoriesApi().normalizeSlug(rawCategory);
    state.sort = SORT_OPTIONS.some(function (opt) {
      return opt.id === rawSort;
    })
      ? rawSort
      : 'today_popular';
  }

  function updateUrl() {
    var url = getCategoriesApi().buildCategoryUrl(state.category, state.sort);
    window.history.replaceState(
      { category: state.category, sort: state.sort },
      '',
      url
    );
  }

  function renderCategoryNav() {
    var nav = document.getElementById('categoryNav');
    if (!nav) return;

    getCategoriesApi().renderCategoryNavBar(nav, {
      activeCategory: state.category,
      useButtons: true,
      page: 'category',
    });
  }

  function syncNavActive() {
    document.querySelectorAll('.category-nav-tab[data-category]').forEach(function (btn) {
      var slug = getCategoriesApi().normalizeSlug(btn.dataset.category || 'all');
      btn.classList.toggle('active', slug === state.category);
    });
    document.querySelectorAll('.category-nav-tab[data-nav="hall"]').forEach(function (link) {
      link.classList.remove('active');
    });
  }

  function getSortLabel(sortId) {
    var label = '오늘인기순';
    SORT_OPTIONS.forEach(function (opt) {
      if (opt.id === sortId) label = opt.label;
    });
    return label;
  }

  function syncSortDropdown() {
    var labelEl = document.getElementById('sortDropdownLabel');
    if (labelEl) labelEl.textContent = getSortLabel(state.sort);

    document.querySelectorAll('.dropdown-item[data-sort]').forEach(function (item) {
      var isActive = item.getAttribute('data-sort') === state.sort;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function closeSortDropdown() {
    var root = document.getElementById('sortDropdown');
    var trigger = document.getElementById('sortDropdownTrigger');
    if (!root) return;
    root.classList.remove('is-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function openSortDropdown() {
    var root = document.getElementById('sortDropdown');
    var trigger = document.getElementById('sortDropdownTrigger');
    if (!root) return;
    root.classList.add('is-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
  }

  function toggleSortDropdown() {
    var root = document.getElementById('sortDropdown');
    if (!root) return;
    if (root.classList.contains('is-open')) closeSortDropdown();
    else openSortDropdown();
  }

  function syncUnseenToggle() {
    var toggle = document.getElementById('unseenToggle');
    if (toggle) toggle.checked = state.unseenOnly;
  }

  function updatePageTitle() {
    var titleEl = document.getElementById('categoryPageTitle');
    if (!titleEl) return;
    titleEl.textContent = getCategoriesApi().labelFromSlug(state.category);
  }

  function buildQueryFilters(sort, urlCategorySlug) {
    var nowIso = new Date().toISOString();
    var dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    var dbCategory = getCategoriesApi().slugToDbCategory(urlCategorySlug);

    return function (q) {
      q = q.eq('visibility_status', 'visible');

      if (window.PickleFeed && window.PickleFeed.applyActivePostsFilter) {
        q = window.PickleFeed.applyActivePostsFilter(q, nowIso);
      } else {
        q = q.gt('expires_at', nowIso);
      }

      if (dbCategory) {
        q = q.eq('category', dbCategory);
      }

      switch (sort) {
        case 'today_popular':
          q = q
            .gte('created_at', dayAgoIso)
            .order('created_at', { ascending: false })
            .limit(80);
          break;
        case 'deadline':
          q = q.order('expires_at', { ascending: true }).limit(80);
          break;
        case 'participants':
          q = q.order('created_at', { ascending: false }).limit(120);
          break;
        case 'latest':
        default:
          q = q.order('created_at', { ascending: false }).limit(80);
          break;
      }

      return q;
    };
  }

  function sortPostsClient(posts, sort) {
    var list = (posts || []).slice();

    if (sort === 'today_popular') {
      list.sort(function (a, b) {
        var scoreA =
          Number(a && a.participationScore) ||
          (Number(a && a.totalVotes) || 0) + (Number(a && a.commentCount) || 0);
        var scoreB =
          Number(b && b.participationScore) ||
          (Number(b && b.totalVotes) || 0) + (Number(b && b.commentCount) || 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        var createdA = a && a.created_at ? new Date(a.created_at).getTime() : 0;
        var createdB = b && b.created_at ? new Date(b.created_at).getTime() : 0;
        return createdB - createdA;
      });
      return list;
    }

    if (sort === 'participants') {
      list.sort(function (a, b) {
        var votesA = Number(a && a.totalVotes) || 0;
        var votesB = Number(b && b.totalVotes) || 0;
        if (votesB !== votesA) return votesB - votesA;
        var createdA = a && a.created_at ? new Date(a.created_at).getTime() : 0;
        var createdB = b && b.created_at ? new Date(b.created_at).getTime() : 0;
        return createdB - createdA;
      });
      return list;
    }

    return list;
  }

  async function ensureAuthReady() {
    if (window.PickleAuth && window.PickleAuth.init) {
      await window.PickleAuth.init();
    }
  }

  async function refreshUserVotedPostIds() {
    state.votedPostIds = new Set();

    await ensureAuthReady();
    var user = window.PickleAuth && window.PickleAuth.getUser();
    if (!user || !user.id) return state.votedPostIds;

    try {
      var sb = getClient();
      var res = await sb.from('votes').select('post_id').eq('user_id', user.id);

      if (res.error) {
        console.warn('[P!CKLE Category] 투표 이력 조회 실패', res.error);
        return state.votedPostIds;
      }

      (res.data || []).forEach(function (row) {
        if (row && row.post_id) state.votedPostIds.add(row.post_id);
      });
    } catch (err) {
      console.warn('[P!CKLE Category] 투표 이력 조회 예외', err);
    }

    return state.votedPostIds;
  }

  function filterUnseenPosts(posts) {
    if (!state.unseenOnly) return posts || [];

    var voted = state.votedPostIds;
    return (posts || []).filter(function (post) {
      return post && post.id && !voted.has(post.id);
    });
  }

  async function fetchCategoryPosts(category, sort) {
    var feed = getFeedApi();
    var result = await feed.fetchPostRows(buildQueryFilters(sort, category));

    if (result.error) {
      throw new Error(result.error.message || String(result.error));
    }

    var posts = await feed.enrichRowsToPosts(result.rows, result.source);
    return sortPostsClient(posts, sort);
  }

  function emptyMessageHtml() {
    var catLabel = getCategoriesApi().labelFromSlug(state.category);
    var msg;

    if (state.unseenOnly) {
      msg =
        state.category === 'all'
          ? '아직 참여하지 않은 불판이 없습니다.<br>모든 불판에 참전하셨네요! 🔥'
          : catLabel + '에서 참여하지 않은 불판이 없습니다.';
    } else if (state.category === 'all') {
      msg = '아직 지펴진 불판이 없습니다.';
    } else {
      msg = catLabel + ' 카테고리에 불판이 없습니다.';
    }

    return (
      '<div class="feed-empty">' +
      '<p class="feed-empty-title">' +
      msg +
      (state.unseenOnly
        ? ''
        : '<br>첫 불판의 주인이 되어보세요! 🔥') +
      '</p>' +
      (state.unseenOnly
        ? ''
        : '<button type="button" class="btn-create-feed" onclick="location.href=\'create.html\'">불판 생성하기</button>') +
      '</div>'
    );
  }

  function scrollActiveNavIntoView() {
    getCategoriesApi().scrollCategoryNavIntoView(document);
  }

  async function renderList() {
    var container = document.getElementById('categoryFeedList');
    if (!container || state.loading) return;

    state.loading = true;
    var feed = getFeedApi();
    container.style.transition = 'opacity 0.25s ease';
    container.style.opacity = '0.35';
    feed.showLoading(container);

    try {
      if (state.unseenOnly) {
        await refreshUserVotedPostIds();
      }

      var posts = await fetchCategoryPosts(state.category, state.sort);
      posts = filterUnseenPosts(posts);

      feed.renderListToContainer(container, posts, {
        emptyHtml: emptyMessageHtml(),
      });
      container.style.opacity = '1';
    } catch (err) {
      console.error('[P!CKLE Category]', err);
      container.innerHTML =
        '<div class="feed-empty feed-error">불판을 불러오지 못했습니다.<p style="font-size:0.75rem;margin-top:8px;word-break:break-all;">' +
        String(err && err.message ? err.message : err) +
        '</p></div>';
      container.style.opacity = '1';
    } finally {
      state.loading = false;
    }
  }

  function setCategory(slug) {
    state.category = getCategoriesApi().normalizeSlug(slug);
    updateUrl();
    syncNavActive();
    scrollActiveNavIntoView();
    updatePageTitle();
    renderList();
  }

  function setSort(sortId) {
    if (
      !SORT_OPTIONS.some(function (opt) {
        return opt.id === sortId;
      })
    ) {
      return;
    }
    state.sort = sortId;
    updateUrl();
    syncSortDropdown();
    closeSortDropdown();
    renderList();
  }

  function setUnseenOnly(enabled) {
    state.unseenOnly = !!enabled;
    syncUnseenToggle();
    renderList();
  }

  function bindCategoryNav() {
    document.querySelectorAll('.category-nav-tab[data-category]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setCategory(btn.dataset.category || 'all');
      });
    });
  }

  function bindSortDropdown() {
    var root = document.getElementById('sortDropdown');
    var trigger = document.getElementById('sortDropdownTrigger');
    var list = document.getElementById('sortDropdownList');
    if (!root || !trigger || !list) return;

    list.innerHTML = SORT_OPTIONS.map(function (opt) {
      return (
        '<li class="dropdown-item" role="option" data-sort="' +
        opt.id +
        '" tabindex="-1" aria-selected="false">' +
        opt.label +
        '</li>'
      );
    }).join('');

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleSortDropdown();
    });

    list.querySelectorAll('.dropdown-item[data-sort]').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        setSort(item.getAttribute('data-sort'));
      });
    });

    window.addEventListener('click', function () {
      closeSortDropdown();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSortDropdown();
    });
  }

  function bindUnseenToggle() {
    var toggle = document.getElementById('unseenToggle');
    if (!toggle) return;

    toggle.addEventListener('change', function () {
      setUnseenOnly(toggle.checked);
    });
  }

  function init() {
    renderCategoryNav();
    parseUrlState();
    updateUrl();
    bindCategoryNav();
    bindSortDropdown();
    bindUnseenToggle();
    syncNavActive();
    syncSortDropdown();
    syncUnseenToggle();
    updatePageTitle();
    scrollActiveNavIntoView();
    renderList();

    window.addEventListener('popstate', function () {
      parseUrlState();
      syncNavActive();
      syncSortDropdown();
      updatePageTitle();
      renderList();
    });
  }

  window.PickleCategoryPage = {
    init: init,
    setCategory: setCategory,
    setSort: setSort,
    setUnseenOnly: setUnseenOnly,
    fetchCategoryPosts: fetchCategoryPosts,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
