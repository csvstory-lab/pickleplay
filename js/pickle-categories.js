/**
 * P!CKLE — 카테고리 네비 공통 설정 (create.html 칩 14개 기준)
 * posts.category = 영문 슬러그 (driving, food, drama …) ↔ 화면 라벨 1:1
 */
(function () {
  'use strict';

  /** create.html #chipSlider 와 1:1 동기화 — slug가 DB 저장값 */
  var PICKLE_CATEGORIES = [
    { slug: 'driving', label: '🚗 블박/과실' },
    { slug: 'food', label: '🍕 먹잘알/푸파' },
    { slug: 'love', label: '💖 연애/과몰입' },
    { slug: 'balance', label: '⚖️ 뇌정지 밸런스' },
    { slug: 'fashion', label: '👗 OOTD/스타일' },
    { slug: 'drama', label: '🤬 빌런/썰' },
    { slug: 'fandom', label: '🍿 덕질/서브컬처' },
    { slug: 'games', label: '🎮 겜심/이스포츠' },
    { slug: 'pets', label: '🐾 힐링/동물' },
    { slug: 'sports', label: '🏟️ 스포츠/매치업' },
    { slug: 'spending', label: '💸 텅장/소비' },
    { slug: 'mind', label: '🧠 MBTI/심리' },
    { slug: 'kpop', label: '🎤 돌판/K-POP' },
    { slug: 'mystery', label: '👻 미스터리' },
  ];

  var LABEL_BY_SLUG = Object.create(null);
  var SLUG_BY_LABEL = Object.create(null);
  var VALID_SLUG_SET = Object.create(null);

  PICKLE_CATEGORIES.forEach(function (c) {
    LABEL_BY_SLUG[c.slug] = c.label;
    SLUG_BY_LABEL[c.label] = c.slug;
    VALID_SLUG_SET[c.slug] = true;
  });

  var HALL_NAV_ITEM = {
    slug: 'hall',
    label: '🏅 전당 후보작',
    href: 'hall_of_fame.html',
  };

  var NAV_ITEMS = [{ slug: 'all', label: '📋 전체' }, HALL_NAV_ITEM].concat(
    PICKLE_CATEGORIES.map(function (c) {
      return { slug: c.slug, label: c.label };
    })
  );

  var SLUG_META = { all: { label: '🔥 모든 불판' } };
  PICKLE_CATEGORIES.forEach(function (c) {
    SLUG_META[c.slug] = { label: c.label };
  });

  var GRID_LABEL_TO_SLUG = SLUG_BY_LABEL;

  var VALID_URL_SLUGS = PICKLE_CATEGORIES.map(function (c) {
    return c.slug;
  });

  var GRID_LABELS = PICKLE_CATEGORIES.map(function (c) {
    return c.label;
  });

  function normalizeCategorySlug(raw) {
    if (raw == null || raw === '') return '';
    var slug = String(raw).trim().toLowerCase();
    return VALID_SLUG_SET[slug] ? slug : '';
  }

  function isValidCategorySlug(raw) {
    return !!normalizeCategorySlug(raw);
  }

  /** DB posts.category → 화면 라벨 (없으면 null → 뱃지 미표시) */
  function resolveCategoryLabel(raw) {
    var slug = normalizeCategorySlug(raw);
    if (!slug) return null;
    return LABEL_BY_SLUG[slug] || null;
  }

  /** create.html 칩 라벨 → DB 슬러그 (없으면 null) */
  function resolveCategorySlugFromLabel(label) {
    var text = String(label || '').trim();
    return SLUG_BY_LABEL[text] || null;
  }

  function normalizeSlug(raw) {
    if (raw == null || raw === '') return 'all';
    var slug = String(raw).trim().toLowerCase();
    if (slug === 'all') return 'all';
    if (VALID_SLUG_SET[slug]) return slug;
    return 'all';
  }

  /** URL/필터 슬러그 → posts.category (전체는 null) */
  function slugToDbCategory(urlSlug) {
    var slug = normalizeSlug(urlSlug);
    if (slug === 'all') return null;
    return slug;
  }

  function labelFromSlug(slug) {
    var key = normalizeSlug(slug);
    if (key === 'all') return SLUG_META.all.label;
    return LABEL_BY_SLUG[key] || null;
  }

  function slugFromGridLabel(label) {
    var text = String(label || '').trim();
    return GRID_LABEL_TO_SLUG[text] || null;
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
        var slug = slugAttr ? normalizeSlug(slugAttr) : slugFromGridLabel(label);
        if (slug && slug !== 'all') {
          goCategory(slug);
        } else if (slugFromGridLabel(label)) {
          goCategory(slugFromGridLabel(label));
        }
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

  function isHallNavItem(item) {
    return item && item.slug === 'hall';
  }

  function renderCategoryNavBar(navEl, options) {
    if (!navEl) return;

    options = options || {};
    var isHallPage =
      options.page === 'hall' ||
      document.body.getAttribute('data-nav-page') === 'hall';
    var activeCategory =
      options.activeCategory != null ? normalizeSlug(options.activeCategory) : 'all';
    var useButtons =
      options.useButtons === true ||
      (options.useButtons !== false &&
        !!document.getElementById('categoryFeedList'));

    navEl.innerHTML = NAV_ITEMS.map(function (item) {
      var isHall = isHallNavItem(item);
      var isActive = isHall
        ? isHallPage
        : !isHallPage && normalizeSlug(item.slug) === activeCategory;
      var activeClass = isActive ? ' active' : '';

      if (isHall) {
        return (
          '<a href="hall_of_fame.html" class="category-nav-tab' +
          activeClass +
          '" data-nav="hall">' +
          item.label +
          '</a>'
        );
      }

      if (useButtons) {
        return (
          '<button type="button" class="category-nav-tab' +
          activeClass +
          '" data-category="' +
          item.slug +
          '">' +
          item.label +
          '</button>'
        );
      }

      var href = buildCategoryUrl(item.slug);
      return (
        '<a href="' +
        href +
        '" class="category-nav-tab' +
        activeClass +
        '" data-category="' +
        item.slug +
        '">' +
        item.label +
        '</a>'
      );
    }).join('');
  }

  function scrollCategoryNavIntoView(root) {
    var scope = root || document;
    var nav = scope.getElementById
      ? scope.getElementById('categoryNav')
      : null;
    if (!nav) nav = scope.querySelector ? scope.querySelector('#categoryNav') : null;
    if (!nav) return;

    var active = nav.querySelector('.category-nav-tab.active');
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }

  function bindCategoryNavTabs(root) {
    if (document.getElementById('categoryFeedList')) return;

    var scope = root || document;
    scope.querySelectorAll('.category-nav-tab[data-category]').forEach(function (tab) {
      if (tab.tagName === 'A') return;
      if (tab.dataset.catNavBound === '1') return;
      tab.dataset.catNavBound = '1';

      tab.addEventListener('click', function () {
        goCategory(tab.getAttribute('data-category') || 'all');
      });
    });
  }

  function initStandaloneCategoryNav() {
    var nav = document.getElementById('categoryNav');
    if (!nav || document.getElementById('categoryFeedList')) return;

    var isHallPage = document.body.getAttribute('data-nav-page') === 'hall';
    renderCategoryNavBar(nav, {
      page: isHallPage ? 'hall' : 'other',
      useButtons: false,
    });
    scrollCategoryNavIntoView(document);
  }

  function bindAppCategoryNav(root) {
    bindAllBoardButtons(root);
    bindCategoryGridItems(root);
    bindCategoryNavTabs(root);
  }

  window.PickleCategories = {
    PICKLE_CATEGORIES: PICKLE_CATEGORIES,
    LABEL_BY_SLUG: LABEL_BY_SLUG,
    NAV_ITEMS: NAV_ITEMS,
    HALL_NAV_ITEM: HALL_NAV_ITEM,
    SLUG_META: SLUG_META,
    GRID_LABELS: GRID_LABELS,
    VALID_URL_SLUGS: VALID_URL_SLUGS,
    normalizeSlug: normalizeSlug,
    normalizeCategorySlug: normalizeCategorySlug,
    isValidCategorySlug: isValidCategorySlug,
    resolveCategoryLabel: resolveCategoryLabel,
    resolveCategorySlugFromLabel: resolveCategorySlugFromLabel,
    slugToDbCategory: slugToDbCategory,
    labelFromSlug: labelFromSlug,
    slugFromGridLabel: slugFromGridLabel,
    buildCategoryUrl: buildCategoryUrl,
    goCategory: goCategory,
    renderCategoryNavBar: renderCategoryNavBar,
    scrollCategoryNavIntoView: scrollCategoryNavIntoView,
    bindAppCategoryNav: bindAppCategoryNav,
  };

  document.addEventListener('DOMContentLoaded', function () {
    bindAppCategoryNav();
    initStandaloneCategoryNav();
  });
})();
