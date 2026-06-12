/**
 * P!CKLE — 카테고리 리스트 페이지 (category.html)
 */
(function () {
  'use strict';

  var SORT_OPTIONS = [
    { id: 'today_popular', label: '🔥 오늘 인기순' },
    { id: 'deadline', label: '⏰ 마감 임박순' },
    { id: 'participants', label: '👥 참여자순' },
    { id: 'latest', label: '🆕 최신순' },
  ];

  var state = {
    category: 'all',
    sort: 'today_popular',
    loading: false,
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

  function syncNavActive() {
    document.querySelectorAll('.category-nav-tab[data-category]').forEach(function (btn) {
      var slug = getCategoriesApi().normalizeSlug(btn.dataset.category || 'all');
      btn.classList.toggle('active', slug === state.category);
    });
  }

  function syncSortActive() {
    document.querySelectorAll('.sort-filter-btn[data-sort]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.sort === state.sort);
    });
  }

  function updatePageTitle() {
    var titleEl = document.getElementById('categoryPageTitle');
    if (!titleEl) return;

    var label = getCategoriesApi().labelFromSlug(state.category);
    titleEl.textContent =
      state.category === 'all' ? '🔥 모든 불판' : label + ' 불판';
  }

  function buildQueryFilters(sort, urlCategorySlug) {
    var nowIso = new Date().toISOString();
    var dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    var dbCategory = getCategoriesApi().slugToDbCategory(urlCategorySlug);

    return function (q) {
      q = q.eq('visibility_status', 'visible');

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
          q = q
            .gt('expires_at', nowIso)
            .order('expires_at', { ascending: true })
            .limit(80);
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
    var msg =
      state.category === 'all'
        ? '아직 지펴진 불판이 없습니다.'
        : catLabel + ' 카테고리에 불판이 없습니다.';

    return (
      '<div class="feed-empty">' +
      '<p class="feed-empty-title">' +
      msg +
      '<br>첫 불판의 주인이 되어보세요! 🔥</p>' +
      '<button type="button" class="btn-create-feed" onclick="location.href=\'create.html\'">불판 생성하기</button>' +
      '</div>'
    );
  }

  function scrollActiveNavIntoView() {
    var active = document.querySelector('.category-nav-tab.active');
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }

  async function renderList() {
    var container = document.getElementById('categoryFeedList');
    if (!container || state.loading) return;

    state.loading = true;
    var feed = getFeedApi();
    container.style.transition = 'opacity 0.2s ease';
    container.style.opacity = '0.45';
    feed.showLoading(container);

    try {
      var posts = await fetchCategoryPosts(state.category, state.sort);
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
    syncSortActive();
    renderList();
  }

  function bindCategoryNav() {
    document.querySelectorAll('.category-nav-tab[data-category]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setCategory(btn.dataset.category || 'all');
      });
    });
  }

  function bindSortFilters() {
    document.querySelectorAll('.sort-filter-btn[data-sort]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setSort(btn.dataset.sort);
      });
    });
  }

  function init() {
    parseUrlState();
    updateUrl();
    syncNavActive();
    syncSortActive();
    updatePageTitle();
    bindCategoryNav();
    bindSortFilters();
    scrollActiveNavIntoView();
    renderList();

    window.addEventListener('popstate', function () {
      parseUrlState();
      syncNavActive();
      syncSortActive();
      updatePageTitle();
      renderList();
    });
  }

  window.PickleCategoryPage = {
    init: init,
    setCategory: setCategory,
    setSort: setSort,
    fetchCategoryPosts: fetchCategoryPosts,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
