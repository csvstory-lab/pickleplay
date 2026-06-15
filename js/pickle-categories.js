/**
 * P!CKLE — 카테고리 (Supabase categories 테이블 연동)
 * posts.category = slug ↔ 화면 라벨(icon + name)
 */
(function () {
  'use strict';

  var HALL_NAV_ITEM = {
    slug: 'hall',
    label: '🏅 전당 후보작',
    href: 'hall_of_fame.html',
  };

  /** DB categories.slug — 전당 후보작 전용(칩 바 HALL_NAV_ITEM과 중복 방지) */
  var HALL_DB_SLUGS = { c_hall: true, hall: true };

  function isHallDbSlug(raw) {
    var slug = String(raw || '').trim().toLowerCase();
    return !!HALL_DB_SLUGS[slug];
  }

  var SLUG_META = { all: { label: '🔥 모든 불판' } };

  /** DB 장애 시 폴백 (오프라인·RLS 미적용) */
  var FALLBACK_ROWS = [
    { slug: 'worldcup', name: '북중미 월드컵', icon: '⚽', sort_order: 10 },
    { slug: 'food', name: '먹잘알/푸파', icon: '🍕', sort_order: 20 },
    { slug: 'love', name: '연애/과몰입', icon: '💖', sort_order: 30 },
    { slug: 'balance', name: '뇌정지 밸런스', icon: '⚖️', sort_order: 40 },
    { slug: 'fashion', name: 'OOTD/스타일', icon: '👗', sort_order: 50 },
    { slug: 'drama', name: '빌런/썰', icon: '🤬', sort_order: 60 },
    { slug: 'fandom', name: '덕질/서브컬처', icon: '🍿', sort_order: 70 },
    { slug: 'games', name: '겜심/이스포츠', icon: '🎮', sort_order: 80 },
    { slug: 'pets', name: '힐링/동물', icon: '🐾', sort_order: 90 },
    { slug: 'sports', name: '스포츠/매치업', icon: '🏟️', sort_order: 100 },
    { slug: 'spending', name: '텅장/소비', icon: '💸', sort_order: 110 },
    { slug: 'mind', name: 'MBTI/심리', icon: '🧠', sort_order: 120 },
    { slug: 'kpop', name: '돌판/K-POP', icon: '🎤', sort_order: 130 },
    { slug: 'mystery', name: '미스터리', icon: '👻', sort_order: 140 },
    { slug: 'driving', name: '블박/과실', icon: '🚗', sort_order: 150 },
  ];

  var cache = {
    list: [],
    loaded: false,
    loadPromise: null,
  };

  var LABEL_BY_SLUG = Object.create(null);
  var SLUG_BY_LABEL = Object.create(null);
  var VALID_SLUG_SET = Object.create(null);

  function getClient() {
    if (!window.PickleSupabase || !window.PickleSupabase.getClient) {
      return null;
    }
    return window.PickleSupabase.getClient();
  }

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

  function buildLabel(icon, name) {
    var ic = String(icon || '').trim();
    var nm = String(name || '').trim();
    if (ic && nm) return ic + ' ' + nm;
    return ic || nm || '';
  }

  function normalizeCategoryRow(row) {
    if (!row || !row.slug) return null;
    var slug = String(row.slug).trim().toLowerCase();
    var icon = String(row.icon || '').trim();
    var name = String(row.name || '').trim();
    return {
      slug: slug,
      name: name,
      icon: icon,
      label: buildLabel(icon, name),
      sort_order: Number(row.sort_order) || 0,
      is_active: row.is_active !== false,
      seasonal: slug === 'worldcup',
    };
  }

  function rebuildIndexes(list) {
    LABEL_BY_SLUG = Object.create(null);
    SLUG_BY_LABEL = Object.create(null);
    VALID_SLUG_SET = Object.create(null);

    (list || []).forEach(function (c) {
      if (!c || !c.slug) return;
      LABEL_BY_SLUG[c.slug] = c.label;
      if (c.label) SLUG_BY_LABEL[c.label] = c.slug;
      VALID_SLUG_SET[c.slug] = true;
      SLUG_META[c.slug] = { label: c.label, name: c.name, icon: c.icon };
    });
  }

  function applyCategoryList(list) {
    cache.list = (list || []).filter(function (c) {
      return c && c.slug && !isHallDbSlug(c.slug);
    });
    rebuildIndexes(cache.list);
    cache.loaded = true;
    return cache.list;
  }

  async function fetchCategoriesFromDb() {
    var sb = getClient();
    if (!sb) {
      throw new Error('Supabase 클라이언트 없음');
    }

    var res = await sb
      .from('categories')
      .select('slug, name, icon, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (res.error) {
      throw res.error;
    }

    var list = (res.data || [])
      .map(normalizeCategoryRow)
      .filter(Boolean);

    if (!list.length) {
      throw new Error('categories 테이블에 활성 카테고리가 없습니다.');
    }

    return list;
  }

  function loadCategories(forceRefresh) {
    if (cache.loadPromise && !forceRefresh) {
      return cache.loadPromise;
    }

    cache.loadPromise = fetchCategoriesFromDb()
      .then(function (rows) {
        return applyCategoryList(rows);
      })
      .catch(function (err) {
        console.warn('[P!CKLE Categories] DB 조회 실패 — 폴백 사용', err);
        var fallback = FALLBACK_ROWS.map(function (r) {
          return normalizeCategoryRow(
            Object.assign({}, r, { is_active: true })
          );
        }).filter(Boolean);
        return applyCategoryList(fallback);
      });

    return cache.loadPromise;
  }

  function getCategories() {
    return cache.list.slice();
  }

  function getNavItems() {
    return [{ slug: 'all', label: '📋 전체' }, HALL_NAV_ITEM].concat(
      cache.list.map(function (c) {
        return {
          slug: c.slug,
          label: c.label,
          name: c.name,
          icon: c.icon,
          seasonal: c.seasonal,
        };
      })
    );
  }

  function normalizeCategorySlug(raw) {
    if (raw == null || raw === '') return '';
    var slug = String(raw).trim().toLowerCase();
    return VALID_SLUG_SET[slug] ? slug : '';
  }

  function isValidCategorySlug(raw) {
    return !!normalizeCategorySlug(raw);
  }

  function resolveCategoryLabel(raw) {
    var slug = normalizeCategorySlug(raw);
    if (!slug) return null;
    return LABEL_BY_SLUG[slug] || null;
  }

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
    return resolveCategorySlugFromLabel(label);
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
    if (isHallDbSlug(slug)) {
      window.location.href = HALL_NAV_ITEM.href;
      return;
    }
    window.location.href = buildCategoryUrl(slug, sort);
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

    navEl.innerHTML = getNavItems()
      .map(function (item) {
        var isHall = isHallNavItem(item);
        var isActive = isHall
          ? isHallPage
          : !isHallPage && normalizeSlug(item.slug) === activeCategory;
        var activeClass = isActive ? ' active' : '';
        var seasonalClass = item.seasonal ? ' category-nav-tab--seasonal' : '';

        if (isHall) {
          return (
            '<a href="hall_of_fame.html" class="category-nav-tab' +
            activeClass +
            '" data-nav="hall">' +
            escapeHtml(item.label) +
            '</a>'
          );
        }

        if (useButtons) {
          return (
            '<button type="button" class="category-nav-tab' +
            activeClass +
            seasonalClass +
            '" data-category="' +
            escapeAttr(item.slug) +
            '">' +
            escapeHtml(item.label) +
            '</button>'
          );
        }

        var href = buildCategoryUrl(item.slug);
        return (
          '<a href="' +
          href +
          '" class="category-nav-tab' +
          activeClass +
          seasonalClass +
          '" data-category="' +
          escapeAttr(item.slug) +
          '">' +
          escapeHtml(item.label) +
          '</a>'
        );
      })
      .join('');
  }

  function renderCategoryGrids(root, options) {
    var scope = root || document;
    options = options || {};
    var list = options.categories || cache.list;
    scope.querySelectorAll('#categoryGrid').forEach(function (grid) {
      grid.innerHTML = list
        .map(function (c) {
          var hl = c.seasonal ? ' highlight' : '';
          return (
            '<div class="grid-item' +
            hl +
            '" data-cat-slug="' +
            escapeAttr(c.slug) +
            '" data-cat-label="' +
            escapeAttr(c.label) +
            '">' +
            escapeHtml(c.label) +
            '</div>'
          );
        })
        .join('');
    });
    bindCategoryGridItems(scope);
  }

  function renderCreateChips(container, options) {
    var el = container || document.getElementById('chipSlider');
    if (!el) return;

    options = options || {};
    var onSelect = options.onSelect;
    var list = options.categories || cache.list;

    el.innerHTML = list
      .map(function (c) {
        var seasonalClass = c.seasonal ? ' cat-chip--seasonal' : '';
        return (
          '<button type="button" class="cat-chip' +
          seasonalClass +
          '" data-category-slug="' +
          escapeAttr(c.slug) +
          '" data-category-label="' +
          escapeAttr(c.label) +
          '">' +
          escapeHtml(c.label) +
          '</button>'
        );
      })
      .join('');

    el.querySelectorAll('.cat-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        if (options.isDragged && options.isDragged()) return;
        el.querySelectorAll('.cat-chip').forEach(function (node) {
          node.classList.remove('selected');
        });
        chip.classList.add('selected');
        if (typeof onSelect === 'function') onSelect(chip);
      });
    });
  }

  function bindCategoryGridItems(root) {
    var scope = root || document;
    var isCreatePage = document.body.getAttribute('data-page') === 'create';
    var selector =
      '.category-grid .grid-item, .category-grid > div, #categoryGrid .grid-item, #categoryGrid > div';

    scope.querySelectorAll(selector).forEach(function (item) {
      if (item.dataset.catNavBound === '1') return;
      item.dataset.catNavBound = '1';
      item.style.cursor = 'pointer';

      item.addEventListener('click', function () {
        var slugAttr = item.getAttribute('data-cat-slug');
        var label = item.getAttribute('data-cat-label') || item.textContent.trim();

        if (isCreatePage) {
          selectCreateCategoryFromSheet(slugAttr, label);
          var sheet = document.getElementById('categorySheet');
          if (sheet && sheet.classList.contains('open') && typeof window.toggleCategorySheet === 'function') {
            window.toggleCategorySheet();
          }
          return;
        }

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

  function selectCreateCategoryFromSheet(slug, label) {
    var normalized = slug ? String(slug).trim().toLowerCase() : '';
    if (!normalized) return;

    var resolvedLabel = String(label || LABEL_BY_SLUG[normalized] || '').trim();

    window.__pickleSelectedCategorySlug = normalized;
    window.__pickleSelectedCategoryLabel = resolvedLabel;

    var hidden = document.getElementById('selectedCategorySlug');
    if (hidden) hidden.value = normalized;

    var btn = document.getElementById('btnOpenCategory');
    if (btn) {
      btn.textContent = resolvedLabel || '📂 카테고리 선택';
      btn.classList.add('selected');
    }
  }

  async function resolveIsSuperAdmin() {
    try {
      var currentUser = null;
      if (window.PickleAuth && window.PickleAuth.ensureAuthenticated) {
        var auth = await window.PickleAuth.ensureAuthenticated({ timeoutMs: 5000 });
        currentUser = (auth && auth.user) || null;
      } else if (window.PickleAuth && window.PickleAuth.init) {
        await window.PickleAuth.init();
        currentUser = (window.PickleAuth.getUser && window.PickleAuth.getUser()) || null;
      }
      if (!currentUser || !currentUser.email || !window.PickleSupabase || !window.PickleSupabase.getClient) {
        return false;
      }

      var sb = window.PickleSupabase.getClient();
      var res = await sb
        .from('user_roles')
        .select('role')
        .eq('email', String(currentUser.email).trim().toLowerCase())
        .single();

      if (res.error || !res.data) return false;
      return res.data.role === 'super';
    } catch (err) {
      console.warn('[P!CKLE Categories] user_roles 조회 실패 — 픽클 오피셜 숨김', err);
      return false;
    }
  }

  function bindAllBoardButtons(root) {
    var scope = root || document;

    scope.querySelectorAll('[data-category][data-board-nav]').forEach(function (btn) {
      if (btn.dataset.catNavBound === '1') return;
      btn.dataset.catNavBound = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        goCategory(btn.getAttribute('data-category') || 'all');
      });
    });
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

  function syncIndexHeaderTopHeight() {
    var row = document.getElementById('headerTopRow');
    if (!row) return;
    document.documentElement.style.setProperty('--header-top-h', row.offsetHeight + 'px');
  }

  function placeIndexCategoryNav(nav) {
    if (!nav || document.getElementById('categoryFeedList')) return;

    var wrap = document.getElementById('categoryNavSticky');
    if (!wrap) return;

    if (nav.parentElement !== wrap) {
      wrap.appendChild(nav);
    }

    syncIndexHeaderTopHeight();
    if (!window.__pickleHeaderTopResizeBound) {
      window.__pickleHeaderTopResizeBound = true;
      window.addEventListener('resize', syncIndexHeaderTopHeight);
    }
  }

  function initStandaloneCategoryNav() {
    var nav = document.getElementById('categoryNav');
    if (!nav || document.getElementById('categoryFeedList')) return;

    removeLegacyAppNav(document);
    placeIndexCategoryNav(nav);

    var isHallPage = document.body.getAttribute('data-nav-page') === 'hall';
    renderCategoryNavBar(nav, {
      page: isHallPage ? 'hall' : 'other',
      useButtons: false,
    });
    scrollCategoryNavIntoView(document);
    syncIndexHeaderTopHeight();
  }

  function removeLegacyAppNav(root) {
    if (window.PickleHeaderLegacyCleanup && window.PickleHeaderLegacyCleanup.remove) {
      window.PickleHeaderLegacyCleanup.remove(root || document);
      return;
    }
    var scope = root || document;
    scope.querySelectorAll('#appTopNav, .app-nav-scroll, nav.app-nav-scroll').forEach(function (el) {
      if (el.id !== 'categoryNav') el.remove();
    });
  }

  function filterCategoriesForCreate(rawCategories, isSuperAdmin) {
    return (rawCategories || []).filter(function (cat) {
      if (!cat || !cat.slug) return false;
      if (cat.slug === 'c_hall') return false;
      if (cat.slug === 'c_official') return isSuperAdmin === true;
      return true;
    });
  }

  function applyCreateCategoryList(list, root) {
    cache.list = (list || []).slice();
    rebuildIndexes(cache.list);
    cache.loaded = true;

    var scope = root || document;
    renderCategoryGrids(scope, { categories: cache.list });
  }

  async function loadCategoriesForCreate(isSuperAdmin) {
    await loadCategories(true);
    var filteredCategories = filterCategoriesForCreate(getCategories(), isSuperAdmin);
    applyCreateCategoryList(filteredCategories, document);
    return filteredCategories;
  }

  function mountAllCategoryUi(root, options) {
    var scope = root || document;
    options = options || {};
    removeLegacyAppNav(scope);
    renderCategoryGrids(scope, options.sheetCategories ? { categories: options.sheetCategories } : undefined);
    bindAllBoardButtons(scope);
    bindCategoryNavTabs(scope);
  }

  function bindAppCategoryNav(root) {
    bindAllBoardButtons(root);
  }

  function notifyReady() {
    document.dispatchEvent(
      new CustomEvent('pickle:categories-ready', {
        detail: { categories: getCategories() },
      })
    );
  }

  window.PickleCategories = {
    load: loadCategories,
    ready: function () {
      return loadCategories();
    },
    isLoaded: function () {
      return cache.loaded;
    },
    getCategories: getCategories,
    getNavItems: getNavItems,
    HALL_NAV_ITEM: HALL_NAV_ITEM,
    HALL_PAGE_URL: HALL_NAV_ITEM.href,
    isHallDbSlug: isHallDbSlug,
    SLUG_META: SLUG_META,
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
    renderCategoryGrids: renderCategoryGrids,
    renderCreateChips: renderCreateChips,
    scrollCategoryNavIntoView: scrollCategoryNavIntoView,
    filterCategoriesForCreate: filterCategoriesForCreate,
    resolveIsSuperAdmin: resolveIsSuperAdmin,
    selectCreateCategoryFromSheet: selectCreateCategoryFromSheet,
    applyCreateCategoryList: applyCreateCategoryList,
    loadCategoriesForCreate: loadCategoriesForCreate,
    mountAllCategoryUi: mountAllCategoryUi,
    bindAppCategoryNav: bindAppCategoryNav,
    buildLabel: buildLabel,
  };

  Object.defineProperty(window.PickleCategories, 'PICKLE_CATEGORIES', {
    get: function () {
      return cache.list.slice();
    },
  });

  Object.defineProperty(window.PickleCategories, 'NAV_ITEMS', {
    get: function () {
      return getNavItems();
    },
  });

  Object.defineProperty(window.PickleCategories, 'GRID_LABELS', {
    get: function () {
      return cache.list.map(function (c) {
        return c.label;
      });
    },
  });

  Object.defineProperty(window.PickleCategories, 'VALID_URL_SLUGS', {
    get: function () {
      return cache.list.map(function (c) {
        return c.slug;
      });
    },
  });

  Object.defineProperty(window.PickleCategories, 'LABEL_BY_SLUG', {
    get: function () {
      return Object.assign({}, LABEL_BY_SLUG);
    },
  });

  document.addEventListener('DOMContentLoaded', function () {
    loadCategories().then(function () {
      if (document.body.getAttribute('data-page') === 'create') {
        notifyReady();
        return;
      }
      return resolveIsSuperAdmin().then(function (isSuperAdmin) {
        var sheetCategories = filterCategoriesForCreate(getCategories(), isSuperAdmin);
        mountAllCategoryUi(document, { sheetCategories: sheetCategories });
        notifyReady();
      });
    });
  });
})();
