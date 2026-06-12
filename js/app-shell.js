/**
 * P!CKLE — 앱 셸 (상단바 · 5탭 하단네비 · 카테고리 바텀시트)
 */
(function () {
  'use strict';

  let sheetMounted = false;
  let currentCategory = 'all';

  function getCurrentPage() {
    return document.body.dataset.page || 'home';
  }

  function getSheetCategories() {
    if (!window.PickleCategories) {
      return [{ id: 'all', label: '📋 전체 불판' }];
    }

    return [{ id: 'all', label: '📋 전체 불판' }].concat(
      window.PickleCategories.getCategories().map(function (c) {
        return { id: c.slug, label: c.label };
      })
    );
  }

  function renderSheetCategories() {
    const container = document.getElementById('sheetCategories');
    if (!container) return;

    container.innerHTML = '';
    getSheetCategories().forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sheet-cat-btn' + (cat.id === currentCategory ? ' active' : '');
      btn.dataset.category = cat.id;
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        selectCategory(btn.dataset.category);
        closeCategorySheet();
      });
      container.appendChild(btn);
    });
  }

  function ensureCategorySheet() {
    if (document.getElementById('categorySheet')) {
      renderSheetCategories();
      return;
    }

    const sheet = document.createElement('div');
    sheet.id = 'categorySheet';
    sheet.className = 'category-sheet';
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML = `
      <div class="category-sheet-backdrop" data-sheet-close></div>
      <div class="category-sheet-panel" role="dialog" aria-labelledby="sheetTitle">
        <div class="sheet-handle"></div>
        <h2 id="sheetTitle" class="sheet-title">전체 불판 카테고리</h2>
        <p class="sheet-desc">보고 싶은 밸런스 게임을 골라 보세요</p>
        <div class="sheet-categories" id="sheetCategories"></div>
      </div>
    `;

    document.body.appendChild(sheet);
    sheetMounted = true;

    sheet.querySelector('[data-sheet-close]').addEventListener('click', closeCategorySheet);
    renderSheetCategories();
  }

  function openCategorySheet() {
    ensureCategorySheet();
    const sheet = document.getElementById('categorySheet');
    const btnAll = document.getElementById('btnAllPosts');
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sheet-open');
    if (btnAll) btnAll.setAttribute('aria-expanded', 'true');
    syncSheetActiveButtons();
  }

  function closeCategorySheet() {
    const sheet = document.getElementById('categorySheet');
    const btnAll = document.getElementById('btnAllPosts');
    if (!sheet) return;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sheet-open');
    if (btnAll) btnAll.setAttribute('aria-expanded', 'false');
  }

  function syncSheetActiveButtons() {
    document.querySelectorAll('.sheet-cat-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.category === currentCategory);
    });
  }

  function resolveCategoryLabel(categoryId) {
    if (categoryId === 'all') return '전체';
    if (window.PickleCategories && window.PickleCategories.resolveCategoryLabel) {
      var label = window.PickleCategories.resolveCategoryLabel(categoryId);
      if (label) return label.replace(/^[^\s]+\s/, '');
    }
    return '전체';
  }

  function selectCategory(categoryId) {
    currentCategory = categoryId || 'all';
    syncSheetActiveButtons();

    if (window.PickleFeed?.setCategory) {
      window.PickleFeed.setCategory(currentCategory);
      showToast('카테고리: ' + resolveCategoryLabel(currentCategory));
      return;
    }

    if (getCurrentPage() !== 'home') {
      const url = window.PickleCategories
        ? window.PickleCategories.buildCategoryUrl(currentCategory)
        : 'category.html?category=' + encodeURIComponent(currentCategory);
      window.location.href = url;
      return;
    }

    showToast('카테고리를 선택했습니다');
  }

  function showToast(msg) {
    if (window.PickleFeed?.showToast) {
      window.PickleFeed.showToast(msg);
      return;
    }
    let t = document.getElementById('feedToast') || document.getElementById('appToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function setActiveNav() {
    const current = getCurrentPage();
    document.querySelectorAll('.bottom-nav-item[data-nav]').forEach((el) => {
      el.classList.toggle('active', el.dataset.nav === current);
    });
  }

  function bindTopbar() {
    const btnAll = document.getElementById('btnAllPosts');
    if (btnAll) {
      btnAll.addEventListener('click', () => {
        const sheet = document.getElementById('categorySheet');
        if (sheet?.classList.contains('open')) {
          closeCategorySheet();
        } else {
          openCategorySheet();
        }
      });
    }

    const btnNotify = document.getElementById('btnNotify');
    if (btnNotify) {
      btnNotify.addEventListener('click', () => {
        showToast('🔔 새 알림이 있습니다 (준비 중)');
      });
    }
  }

  function goCreate(e) {
    if (window.PickleAuth && !window.PickleAuth.isLoggedIn()) {
      e.preventDefault();
      alert('불판을 만들려면 로그인이 필요합니다');
      window.PickleAuth.goToLogin({ redirect: 'create.html', from: 'create' });
      return;
    }
    window.location.href = 'create.html';
  }

  function goMypage(e) {
    if (window.PickleAuth && !window.PickleAuth.isLoggedIn()) {
      e.preventDefault();
      window.PickleAuth.goToLogin({ redirect: 'mypage.html' });
      return;
    }
    window.location.href = 'mypage.html';
  }

  function bindBottomNav() {
    const fireBtn = document.getElementById('navFire');
    if (fireBtn) {
      fireBtn.addEventListener('click', (e) => {
        e.preventDefault();
        goCreate(e);
      });
    }

    const myBtn = document.getElementById('navMypage');
    if (myBtn) {
      myBtn.addEventListener('click', (e) => {
        if (!window.PickleAuth?.isLoggedIn()) {
          e.preventDefault();
          goMypage(e);
        }
      });
    }
  }

  function init() {
    setActiveNav();
    bindTopbar();
    bindBottomNav();

    var boot = function () {
      ensureCategorySheet();
    };

    if (window.PickleCategories && window.PickleCategories.load) {
      window.PickleCategories.load().then(boot);
    } else {
      boot();
    }

    document.addEventListener('pickle:categories-ready', boot);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeCategorySheet();
    });
  }

  function syncCategory(cat) {
    currentCategory = cat || 'all';
    syncSheetActiveButtons();
  }

  window.PickleAppShell = {
    init,
    getCurrentPage,
    openCategorySheet,
    closeCategorySheet,
    selectCategory,
    syncCategory,
    getCategory: () => currentCategory,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
