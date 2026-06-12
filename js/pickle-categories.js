/**
 * P!CKLE — 카테고리 네비 공통 설정
 * URL ?category= 슬러그(직관적 영단어) ↔ Supabase posts.category(DB) 분리
 */
(function () {
  'use strict';

  /**
   * URL 슬러그 메타 — label: UI 표시, db: Supabase posts.category (null = 필터 없음)
   */
  var SLUG_META = {
    all: { label: '📋 전체 불판', db: null },
    hot: { label: '🔥 HOT', db: 'hot' },
    brand: { label: '🤝 브랜드', db: 'brand' },
    love: { label: '💖 연애', db: 'love' },
    balance: { label: '⚖️ 밸런스', db: 'brain' },
    mind: { label: '🧠 MBTI·심리', db: 'brain' },
    daily: { label: '✨ 일상', db: 'ugc' },
    food: { label: '🍕 푸드', db: 'ugc' },
    fashion: { label: '👗 패션', db: 'ugc' },
    fandom: { label: '🍿 덕질', db: 'ugc' },
    games: { label: '🎮 게임', db: 'ugc' },
    pets: { label: '🐾 힐링·동물', db: 'ugc' },
    sports: { label: '🏟️ 스포츠', db: 'ugc' },
    spending: { label: '💸 소비', db: 'ugc' },
    driving: { label: '🚗 블박·운전', db: 'ugc' },
    kpop: { label: '🎤 K-POP', db: 'ugc' },
    mystery: { label: '👻 미스터리', db: 'ugc' },
    drama: { label: '🤬 빌런·썰', db: 'ugc' },
    other: { label: '📌 기타', db: 'other' },
  };

  /** category.html 상단 가로 탭 */
  var NAV_ITEMS = [
    { slug: 'all', label: '📋 전체' },
    { slug: 'hot', label: '🔥 HOT' },
    { slug: 'love', label: '💖 연애' },
    { slug: 'balance', label: '⚖️ 밸런스' },
    { slug: 'brand', label: '🤝 브랜드' },
    { slug: 'daily', label: '✨ 일상' },
    { slug: 'sports', label: '🏟️ 스포츠' },
    { slug: 'food', label: '🍕 푸드' },
    { slug: 'other', label: '📌 기타' },
  ];

  /** 바텀시트 그리드 라벨 → URL 슬러그 */
  var GRID_LABEL_TO_SLUG = {
    '🔥 HOT 랭킹': 'hot',
    '🎁 꿀템 드랍': 'brand',
    '💖 연애/과몰입': 'love',
    '⚖️ 뇌정지 밸런스': 'balance',
    '🤬 빌런/썰': 'drama',
    '🍕 먹잘알/푸파': 'food',
    '👗 OOTD/스타일': 'fashion',
    '🍿 덕질/서브컬처': 'fandom',
    '🎮 겜심/이스포츠': 'games',
    '🐾 힐링/동물': 'pets',
    '🏟️ 스포츠/매치업': 'sports',
    '💸 텅장/소비': 'spending',
    '🚗 블박/과실': 'driving',
    '🧠 MBTI/심리': 'mind',
    '🎤 돌판/K-POP': 'kpop',
    '👻 미스터리': 'mystery',
    '🤝 브랜드': 'brand',
    '🔥 HOT': 'hot',
    '💖 연애': 'love',
    '⚖️ 밸런스': 'balance',
  };

  /** 구 DB/URL 슬러그 → 직관적 URL 슬러그 */
  var LEGACY_TO_SLUG = {
    brain: 'balance',
    ugc: 'daily',
    romance: 'love',
  };

  var VALID_URL_SLUGS = Object.keys(SLUG_META).filter(function (key) {
    return key !== 'all';
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
    return 'daily';
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

  var GRID_LABELS = [
    '🔥 HOT 랭킹',
    '🎁 꿀템 드랍',
    '💖 연애/과몰입',
    '⚖️ 뇌정지 밸런스',
    '🤬 빌런/썰',
    '🍕 먹잘알/푸파',
    '👗 OOTD/스타일',
    '🍿 덕질/서브컬처',
    '🎮 겜심/이스포츠',
    '🐾 힐링/동물',
    '🏟️ 스포츠/매치업',
    '💸 텅장/소비',
    '🚗 블박/과실',
    '🧠 MBTI/심리',
    '🎤 돌판/K-POP',
    '👻 미스터리',
  ];

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
