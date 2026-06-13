/**
 * P!CKLE — 랭킹 페이지 (hall_of_fame.html UI 클래스 재사용)
 */
(function () {
  'use strict';

  var LIMIT = 50;
  var currentTab = 'grill';
  var grillRows = [];
  var picklerRows = [];

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getClient() {
    if (!window.PickleSupabase || !window.PickleSupabase.getClient) {
      throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
    }
    return window.PickleSupabase.getClient();
  }

  function formatScore(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    if (Number.isInteger(n)) return n.toLocaleString('ko-KR');
    return n.toFixed(1);
  }

  function postTitle(post) {
    return (
      post.title?.trim() ||
      (post.option_a_name || '') + ' VS ' + (post.option_b_name || '')
    );
  }

  function postStatusLabel(post) {
    if (!post.expires_at) return '진행 중';
    var exp = new Date(post.expires_at);
    if (Number.isNaN(exp.getTime())) return '진행 중';
    return exp.getTime() <= Date.now() ? '마감 완료' : '진행 중';
  }

  function rankBadgeHtml(rank) {
    if (rank === 1) {
      return (
        '<div class="hof-badge-row">' +
        '<span class="hof-badge hof-badge--landslide">👑 1위</span>' +
        '</div>'
      );
    }
    if (rank === 2) {
      return (
        '<div class="hof-badge-row">' +
        '<span class="hof-badge hof-badge--scale">🥈 2위</span>' +
        '</div>'
      );
    }
    if (rank === 3) {
      return (
        '<div class="hof-badge-row">' +
        '<span class="hof-badge hof-badge--debate">🥉 3위</span>' +
        '</div>'
      );
    }
    return '';
  }

  function buildGrillCardHtml(post, rank) {
    var feed = window.PickleFeed;
    var thumbHtml = '';
    if (feed && typeof feed.renderCardThumbTop === 'function') {
      thumbHtml = feed.renderCardThumbTop(post);
    } else if (post.thumbnail_url) {
      thumbHtml =
        '<div class="card-thumb-top">' +
        '<img class="card-thumb-img" src="' +
        escapeHtml(post.thumbnail_url) +
        '" alt="">' +
        '</div>';
    } else {
      thumbHtml =
        '<div class="card-thumb-top card-thumb-top--fallback">' +
        '<span class="card-thumb-fallback-label">' +
        escapeHtml(String(rank) + '위') +
        '</span></div>';
    }

    return (
      '<article class="hof-card list-card" data-id="' +
      escapeHtml(post.id) +
      '" role="button" tabindex="0">' +
      rankBadgeHtml(rank) +
      thumbHtml +
      '<div class="card-body">' +
      '<h3 class="title">' +
      escapeHtml(postTitle(post)) +
      '</h3>' +
      '<div class="hof-result-meta">' +
      '<span class="hof-result-pct hof-result-pct--b">🔥 ' +
      formatScore(post.fire_score) +
      '</span>' +
      '<span class="hof-result-votes">작성자: ' +
      escapeHtml(post.author_nickname || '픽클러') +
      ' · ' +
      escapeHtml(postStatusLabel(post)) +
      '</span>' +
      '</div></div></article>'
    );
  }

  function buildPicklerCardHtml(user, rank) {
    var initial = String(user.nickname || '픽').trim().charAt(0) || '픽';

    return (
      '<article class="hof-card list-card" role="button" tabindex="0">' +
      rankBadgeHtml(rank) +
      '<div class="card-thumb-top card-thumb-top--fallback">' +
      '<span class="card-thumb-fallback-label">' +
      escapeHtml(initial) +
      '</span></div>' +
      '<div class="card-body">' +
      '<h3 class="title">' +
      escapeHtml(user.nickname || '픽클러') +
      '</h3>' +
      '<div class="hof-result-meta">' +
      '<span class="hof-result-pct hof-result-pct--a">⭐ ' +
      formatScore(user.star_score) +
      '</span>' +
      '<span class="hof-result-votes">' +
      rank +
      '위 · star_score 기준</span>' +
      '</div></div></article>'
    );
  }

  function bindGrillNavigation(container) {
    if (!container || !window.PickleFeed) return;
    container.querySelectorAll('.hof-card[data-id]').forEach(function (card) {
      var id = card.dataset.id;
      if (!id) return;
      card.addEventListener('click', function () {
        window.PickleFeed.goDetail(id);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.PickleFeed.goDetail(id);
        }
      });
    });
  }

  function showLoading(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="feed-loading">' +
      '<div class="feed-spinner" aria-hidden="true"></div>' +
      '<p>🏆 랭킹을 집계하는 중…</p></div>';
  }

  function emptyHtml(tab) {
    var msg =
      tab === 'grill'
        ? '아직 핫 불판 랭킹 데이터가 없습니다.'
        : '아직 최고의 픽클러 랭킹 데이터가 없습니다.';
    return (
      '<div class="feed-empty">' +
      '<p class="feed-empty-title">' +
      escapeHtml(msg) +
      '</p></div>'
    );
  }

  function updateMeta(tab) {
    var el = document.getElementById('rankingMeta');
    if (!el) return;
    if (tab === 'grill') {
      el.textContent = 'fire_score 기준 · 투표 +1 · 조회 +0.1 · 댓글 +3 · 공유 +5';
    } else {
      el.textContent = 'star_score 기준 · 팔로우 +10 · 참여 +0.1 · 전당 +500 · 베스트댓글 +50';
    }
  }

  function renderList(tab) {
    var container = document.getElementById('rankingFeedList');
    if (!container) return;

    var rows = tab === 'grill' ? grillRows : picklerRows;
    updateMeta(tab);

    if (!rows.length) {
      container.innerHTML = emptyHtml(tab);
      return;
    }

    var htmlParts = [];
    rows.forEach(function (row, i) {
      var rank = i + 1;
      if (tab === 'grill') {
        htmlParts.push(buildGrillCardHtml(row, rank));
      } else {
        htmlParts.push(buildPicklerCardHtml(row, rank));
      }
    });

    container.style.opacity = '0';
    container.innerHTML = htmlParts.join('');
    if (tab === 'grill') bindGrillNavigation(container);
    requestAnimationFrame(function () {
      container.style.transition = 'opacity 0.3s ease';
      container.style.opacity = '1';
    });
  }

  async function fetchGrillRanking(sb) {
    var selectVariants = [
      'id, title, option_a_name, option_b_name, fire_score, thumbnail_url, expires_at, author_nickname, is_sponsor',
      'id, title, option_a_name, option_b_name, fire_score, thumbnail_url, expires_at, author_nickname',
      'id, option_a_name, option_b_name, fire_score, expires_at, author_nickname',
    ];
    var lastError = null;
    for (var i = 0; i < selectVariants.length; i++) {
      var result = await sb
        .from('posts')
        .select(selectVariants[i])
        .eq('visibility_status', 'visible')
        .order('fire_score', { ascending: false })
        .limit(LIMIT);
      if (!result.error) return result.data || [];
      lastError = result.error;
    }
    throw lastError || new Error('핫 불판 랭킹을 불러오지 못했습니다.');
  }

  async function fetchPicklerRanking(sb) {
    var result = await sb
      .from('users')
      .select('id, nickname, star_score')
      .eq('account_status', 'active')
      .order('star_score', { ascending: false })
      .limit(LIMIT);
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function loadAll() {
    var container = document.getElementById('rankingFeedList');
    showLoading(container);

    try {
      if (window.PickleCategories && window.PickleCategories.load) {
        await window.PickleCategories.load();
      }

      var sb = getClient();
      var results = await Promise.all([
        fetchGrillRanking(sb),
        fetchPicklerRanking(sb),
      ]);
      grillRows = results[0];
      picklerRows = results[1];
      renderList(currentTab);
    } catch (err) {
      console.error('[P!CKLE Ranking]', err);
      if (container) {
        container.innerHTML =
          '<div class="feed-empty feed-error">랭킹을 불러오지 못했습니다.<p style="font-size:0.75rem;margin-top:8px;word-break:break-all;">' +
          escapeHtml(err.message || String(err)) +
          '</p></div>';
      }
    }
  }

  function switchTab(tabName) {
    currentTab = tabName;
    var tabGrill = document.getElementById('tabGrill');
    var tabPickler = document.getElementById('tabPickler');
    if (tabGrill) tabGrill.classList.toggle('active', tabName === 'grill');
    if (tabPickler) tabPickler.classList.toggle('active', tabName === 'pickler');
    renderList(tabName);
  }

  function bindTabs() {
    var tabs = document.getElementById('rankingTabs');
    if (!tabs) return;
    tabs.querySelectorAll('.category-nav-tab[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-tab') || 'grill');
      });
    });
  }

  function init() {
    bindTabs();
    loadAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PickleRanking = {
    reload: loadAll,
    switchTab: switchTab,
  };
})();
