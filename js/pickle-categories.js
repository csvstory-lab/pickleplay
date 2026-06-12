/**
 * P!CKLE — 카테고리 네비 공통 설정 (create.html 칩 14개 기준)
 * URL ?category= 슬러그 ↔ Supabase posts.category(DB)
 */
(function () {
  'use strict';

  /** create.html #chipSlider 와 1:1 동기화 */
  var PICKLE_CATEGORIES = [
    { slug: 'driving', label: '🚗 블박/과실', db: 'ugc' },
    { slug: 'food', label: '🍕 먹잘알/푸파', db: 'ugc' },
    { slug: 'love', label: '💖 연애/과몰입', db: 'love' },
    { slug: 'balance', label: '⚖️ 뇌정지 밸런스', db: 'brain' },
    { slug: 'fashion', label: '👗 OOTD/스타일', db: 'ugc' },
    { slug: 'drama', label: '🤬 빌런/썰', db: 'ugc' },
    { slug: 'fandom', label: '🍿 덕질/서브컬처', db: 'ugc' },
    { slug: 'games', label: '🎮 겜심/이스포츠', db: 'ugc' },
    { slug: 'pets', label: '🐾 힐링/동물', db: 'ugc' },
    { slug: 'sports', label: '🏟️ 스포츠/매치업', db: 'ugc' },
    { slug: 'spending', label: '💸 텅장/소비', db: 'ugc' },
    { slug: 'mind', label: '🧠 MBTI/심리', db: 'brain' },
    { slug: 'kpop', label: '🎤 돌판/K-POP', db: 'ugc' },
    { slug: 'mystery', label: '👻 미스터리', db: 'ugc' },
  ];

  var NAV_ITEMS = [{ slug: 'all', label: '📋 전체' }].concat(
    PICKLE_CATEGORIES.map(function (c) {
      return { slug: c.slug, label: c.label };
    })
  );

  var SLUG_META = { all: { label: '🔥 모든 불판', db: null } };
  PICKLE_CATEGORIES.forEach(function (c) {
    SLUG_META[c.slug] = { label: c.label, db: c.db };
  });

  var GRID_LABEL_TO_SLUG = {};
  PICKLE_CATEGORIES.forEach(function (c) {
    GRID_LABEL_TO_SLUG[c.label] = c.slug;
  });

  /** 구 URL 슬러그 → create 기준 슬러그 */
  var LEGACY_TO_SLUG = {
    brain: 'balance',
    ugc: 'food',
    daily: 'drama',
    hot: 'sports',
    brand: 'spending',
    other: 'mystery',
    romance: 'love',
  };

  var VALID_URL_SLUGS = PICKLE_CATEGORIES.map(function (c) {
    return c.slug;
  });

  var GRID_LABELS = PICKLE_CATEGORIES.map(function (c) {
    return c.label;
  });

  function normalizeSlug(raw) {
    if (raw == null || raw === '') return 'all';
    var slug = String(raw).trim().toLowerCase();
    if (slug === 'all') return 'all';
    if (LEGACY_TO_SLUG[slug]) return LEGACY_TO_SLUG[slug];
    if (SLUG_META[slug]) return slug;
    return 'all';
  }

  function slugToDbCategory(urlSlug) {
    var slug = normalizeSlug(urlSlug);
    if (slug === 'all') return null;
    var meta = SLUG_META[slug];
    return meta && meta.db != null ? meta.db : null;
  }

  function labelFromSlug(slug) {
    var key = normalizeSlug(slug);
    if (key === 'all') return SLUG_META.all.label;
    return (SLUG_META[key] && SLUG_META[key].label) || key;
  }

  function slugFromGridLabel(label) {
    var text = String(label || '').trim();
    if (GRID_LABEL_TO_SLUG[text]) return GRID_LABEL_TO_SLUG[text];
    return 'food';
  }

  function buildCategoryUrl(slug, sort) {
    var params = new URLSearchParams();
    var normalized = normalizeSlug(slug);
    if (normalized && normalized !== 'all') {
      params.set('category', normalized);
    }
    if (sort && sort !== 'today_popular') {
      params.set('sort', sort);
    }
    var qs = params.toString();
    return 'category.html' + (qs ? '?' + qs : '');
  }

  function goCategory(slug, sort) {
    window.location.href = buildCategoryUrl(slug, sort);
  }

  function bindCategoryGridItems(root) {
    var scope = root || document;
    var selector =
      '.category-grid .grid-item, .category-grid > div, #categoryGrid .grid-item, #categoryGrid > div';

    scope.querySelectorAll(selector).forEach(function (item) {
      if (item.dataset.catNavBound === '1') return;
      item.dataset.catNavBound = '1';
      item.style.cursor = 'pointer';

      item.addEventListener('click', function () {
        var slugAttr = item.getAttribute('data-cat-slug');
        var label = item.getAttribute('data-cat-label') || item.textContent.trim();
        if (typeof window.closeAllDrawers === 'function') window.closeAllDrawers();
        if (typeof window.closeAllSheets === 'function') window.closeAllSheets();
        if (typeof window.closeAllModals === 'function') window.closeAllModals();
        goCategory(slugAttr || slugFromGridLabel(label));
      });
    });
  }

  function bindAllBoardButtons(root) {
    var scope = root || document;

    scope.querySelectorAll('.btn-category, a.btn-category').forEach(function (btn) {
      if (btn.dataset.catNavBound === '1') return;

      var href = btn.getAttribute('href');
      if (href && href.indexOf('category.html') !== -1) {
        btn.dataset.catNavBound = '1';
        return;
      }

      btn.dataset.catNavBound = '1';
      btn.removeAttribute('onclick');

      btn.addEventListener('click', function (e) {
        if (btn.tagName === 'A' && btn.getAttribute('href')) return;
        e.preventDefault();
        var slug = btn.getAttribute('data-category') || 'all';
        goCategory(slug);
      });
    });
  }

  function bindCategoryNavTabs(root) {
    if (document.getElementById('categoryFeedList')) return;

    var scope = root || document;
    scope.querySelectorAll('.category-nav-tab[data-category]').forEach(function (tab) {
      if (tab.dataset.catNavBound === '1') return;
      tab.dataset.catNavBound = '1';

      tab.addEventListener('click', function () {
        goCategory(tab.getAttribute('data-category') || 'all');
      });
    });
  }

  function bindAppCategoryNav(root) {
    bindAllBoardButtons(root);
    bindCategoryGridItems(root);
    bindCategoryNavTabs(root);
  }

  window.PickleCategories = {
    PICKLE_CATEGORIES: PICKLE_CATEGORIES,
    NAV_ITEMS: NAV_ITEMS,
    SLUG_META: SLUG_META,
    GRID_LABELS: GRID_LABELS,
    VALID_URL_SLUGS: VALID_URL_SLUGS,
    normalizeSlug: normalizeSlug,
    slugToDbCategory: slugToDbCategory,
    labelFromSlug: labelFromSlug,
    slugFromGridLabel: slugFromGridLabel,
    buildCategoryUrl: buildCategoryUrl,
    goCategory: goCategory,
    bindAppCategoryNav: bindAppCategoryNav,
  };

  document.addEventListener('DOMContentLoaded', function () {
    bindAppCategoryNav();
  });
})();
