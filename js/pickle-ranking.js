/**
 * P!CKLE — 랭킹 페이지 (핫 불판 · 최고의 픽클러)
 */
(function () {
  'use strict';

  var LIMIT = 50;
  var currentTab = 'grill';
  var picklerRows = [];
  var grillRows = [];

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

  function formatScore(value, emoji) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) n = 0;
    var prefix = emoji ? emoji + ' ' : '';
    if (n >= 1000000) return prefix + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return prefix + (n / 1000).toFixed(1) + 'K';
    if (Number.isInteger(n)) return prefix + n.toLocaleString('ko-KR');
    return prefix + n.toFixed(1);
  }

  function nicknameInitial(nickname) {
    var n = String(nickname || '').trim();
    if (!n) return '🥒';
    return escapeHtml(n.charAt(0));
  }

  function postThumbHtml(post) {
    if (post.thumbnail_url) {
      return (
        '<img src="' +
        escapeHtml(post.thumbnail_url) +
        '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">'
      );
    }
    var title = post.title || post.option_a_name || '🔥';
    return escapeHtml(String(title).trim().charAt(0) || '🔥');
  }

  function postTitle(post) {
    return (
      post.title?.trim() ||
      post.option_a_name + ' VS ' + post.option_b_name
    );
  }

  function postStatusLabel(post) {
    if (!post.expires_at) return '진행 중';
    var exp = new Date(post.expires_at);
    if (Number.isNaN(exp.getTime())) return '진행 중';
    return exp.getTime() <= Date.now() ? '마감 완료' : '진행 중';
  }

  function renderPodiumItem(item, rank, type) {
    var isTop = rank <= 3;
    var crown = isTop ? '<span class="podium-crown" aria-hidden="true">👑</span>' : '';
    var rankClass = 'podium-' + rank;
    var scoreEmoji = type === 'grill' ? '🔥' : '⭐';
    var avatarClass = type === 'grill' ? 'podium-avatar podium-avatar--post' : 'podium-avatar';
    var href =
      type === 'grill'
        ? "location.href='detail.html?id=" + encodeURIComponent(item.id) + "'"
        : "location.href='mypage.html'";

    return (
      '<div class="podium-item ' +
      rankClass +
      ' neo-top" onclick="' +
      href +
      '">' +
      crown +
      '<div class="' +
      avatarClass +
      '">' +
      (type === 'grill' ? postThumbHtml(item) : nicknameInitial(item.nickname)) +
      '</div>' +
      '<div class="podium-name">' +
      escapeHtml(type === 'grill' ? postTitle(item) : item.nickname) +
      '</div>' +
      '<div class="podium-score">' +
      formatScore(type === 'grill' ? item.fire_score : item.star_score, scoreEmoji) +
      '</div>' +
      '<div class="podium-rank">' +
      rank +
      '</div>' +
      '</div>'
    );
  }

  function renderPodium(rows, containerId, type) {
    var el = document.getElementById(containerId);
    if (!el) return;

    if (!rows.length) {
      el.innerHTML =
        '<p class="rank-empty">아직 랭킹 데이터가 없습니다. 첫 번째 주인공이 되어 보세요!</p>';
      return;
    }

    var order = [1, 0, 2];
    var html = '';
    order.forEach(function (idx) {
      if (rows[idx]) {
        html += renderPodiumItem(rows[idx], idx + 1, type);
      }
    });
    el.innerHTML = html;
  }

  function renderPicklerList(rows) {
    var el = document.getElementById('picklerList');
    if (!el) return;

    var rest = rows.slice(3);
    if (!rest.length) {
      el.innerHTML = rows.length <= 3 ? '' : '';
      if (rows.length && rows.length <= 3) {
        el.innerHTML =
          '<p class="rank-empty rank-empty--list">Top 3까지만 등록되어 있습니다.</p>';
      }
      return;
    }

    el.innerHTML = rest
      .map(function (row, i) {
        var rank = i + 4;
        var levelBadge = '';
        if (window.PickleProfile && window.PickleProfile.buildLevelBadgeFromPoints) {
          levelBadge = window.PickleProfile.buildLevelBadgeFromPoints(row.star_score);
        }
        return (
          '<div class="rank-item neo-card" onclick="location.href=\'mypage.html\'">' +
          '<div class="rank-num">' +
          rank +
          '</div>' +
          '<div class="rank-pic">' +
          nicknameInitial(row.nickname) +
          '</div>' +
          '<div class="rank-info">' +
          '<div class="rank-title">' +
          escapeHtml(row.nickname) +
          ' ' +
          levelBadge +
          '</div>' +
          '<div class="rank-sub"><span>⭐ ' +
          formatScore(row.star_score) +
          '점</span></div>' +
          '</div>' +
          '<div class="rank-score">' +
          formatScore(row.star_score, '⭐') +
          '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  function renderGrillList(rows) {
    var el = document.getElementById('grillList');
    if (!el) return;

    var rest = rows.slice(3);
    if (!rest.length) {
      if (rows.length && rows.length <= 3) {
        el.innerHTML =
          '<p class="rank-empty rank-empty--list">Top 3까지만 등록되어 있습니다.</p>';
      } else {
        el.innerHTML = '';
      }
      return;
    }

    el.innerHTML = rest
      .map(function (row, i) {
        var rank = i + 4;
        var author = row.author_nickname || '픽클러';
        return (
          '<div class="rank-item grill neo-card" onclick="location.href=\'detail.html?id=' +
          encodeURIComponent(row.id) +
          "'\">" +
          '<div class="rank-num">' +
          rank +
          '</div>' +
          '<div class="rank-pic">' +
          postThumbHtml(row) +
          '</div>' +
          '<div class="rank-info">' +
          '<div class="rank-title">' +
          escapeHtml(postTitle(row)) +
          '</div>' +
          '<div class="rank-sub"><span>작성자: ' +
          escapeHtml(author) +
          '</span> <span>|</span> <span>' +
          escapeHtml(postStatusLabel(row)) +
          '</span></div>' +
          '</div>' +
          '<div class="rank-score">' +
          formatScore(row.fire_score, '🔥') +
          '</div>' +
          '</div>'
        );
      })
      .join('');
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

  async function fetchGrillRanking(sb) {
    var selectVariants = [
      'id, title, option_a_name, option_b_name, fire_score, thumbnail_url, expires_at, author_nickname, author_avatar_html',
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

  async function resolveSelfPicklerRank(sb, userId, myScore) {
    var higher = await sb
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('account_status', 'active')
      .gt('star_score', myScore);

    if (higher.error) throw higher.error;
    return (higher.count || 0) + 1;
  }

  async function resolveSelfGrillRank(sb, postId, myScore) {
    if (!postId) return null;
    var higher = await sb
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('visibility_status', 'visible')
      .gt('fire_score', myScore);

    if (higher.error) throw higher.error;
    return (higher.count || 0) + 1;
  }

  async function updateSelfRankBar(sb) {
    var bar = document.getElementById('selfRankBar');
    if (!bar) return;

    var session = await sb.auth.getSession();
    var user = session.data.session?.user;

    if (!user) {
      bar.innerHTML =
        '<div class="self-rank-inner neo-card">' +
        '<span class="self-rank-label">내 순위</span>' +
        '<span class="self-rank-msg"><a href="../login.html">로그인</a>하면 내 순위를 확인할 수 있어요</span>' +
        '</div>';
      bar.classList.remove('hidden');
      return;
    }

    try {
      if (currentTab === 'pickler') {
        var userRow = await sb
          .from('users')
          .select('id, nickname, star_score')
          .eq('id', user.id)
          .maybeSingle();

        if (userRow.error) throw userRow.error;
        var score = Number(userRow.data?.star_score) || 0;
        var rank = await resolveSelfPicklerRank(sb, user.id, score);
        var idx = picklerRows.findIndex(function (r) {
          return r.id === user.id;
        });
        if (idx >= 0) rank = idx + 1;

        bar.innerHTML =
          '<div class="self-rank-inner neo-card theme-pickler">' +
          '<div class="self-rank-left">' +
          '<span class="self-rank-label">내 순위</span>' +
          '<span class="self-rank-num">' +
          rank +
          '위</span>' +
          '</div>' +
          '<div class="self-rank-right">' +
          '<span class="self-rank-name">' +
          escapeHtml(userRow.data?.nickname || '나') +
          '</span>' +
          '<span class="self-rank-score">' +
          formatScore(score, '⭐') +
          '</span>' +
          '</div>' +
          '</div>';
      } else {
        var myPosts = await sb
          .from('posts')
          .select('id, title, option_a_name, option_b_name, fire_score')
          .eq('author_id', user.id)
          .eq('visibility_status', 'visible')
          .order('fire_score', { ascending: false })
          .limit(1);

        if (myPosts.error) throw myPosts.error;
        var best = myPosts.data && myPosts.data[0];
        if (!best) {
          bar.innerHTML =
            '<div class="self-rank-inner neo-card theme-grill">' +
            '<span class="self-rank-label">내 불판</span>' +
            '<span class="self-rank-msg">아직 올린 불판이 없어요 · <a href="create.html">불판 만들기</a></span>' +
            '</div>';
        } else {
          var fireScore = Number(best.fire_score) || 0;
          var postRank = await resolveSelfGrillRank(sb, best.id, fireScore);
          var gIdx = grillRows.findIndex(function (r) {
            return r.id === best.id;
          });
          if (gIdx >= 0) postRank = gIdx + 1;

          bar.innerHTML =
            '<div class="self-rank-inner neo-card theme-grill">' +
            '<div class="self-rank-left">' +
            '<span class="self-rank-label">내 최고 불판</span>' +
            '<span class="self-rank-num">' +
            postRank +
            '위</span>' +
            '</div>' +
            '<div class="self-rank-right">' +
            '<span class="self-rank-name">' +
            escapeHtml(postTitle(best)) +
            '</span>' +
            '<span class="self-rank-score">' +
            formatScore(fireScore, '🔥') +
            '</span>' +
            '</div>' +
            '</div>';
        }
      }
      bar.classList.remove('hidden');
    } catch (err) {
      console.warn('[P!CKLE Ranking] self rank failed', err);
      bar.classList.add('hidden');
    }
  }

  function showLoading() {
    var areas = ['grillPodium', 'picklerPodium', 'grillList', 'picklerList'];
    areas.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.innerHTML =
          '<p class="rank-loading">🏆 랭킹 집계 중...</p>';
      }
    });
  }

  async function loadAll() {
    showLoading();
    var sb = getClient();

    try {
      var results = await Promise.all([
        fetchGrillRanking(sb),
        fetchPicklerRanking(sb),
      ]);
      grillRows = results[0];
      picklerRows = results[1];

      renderPodium(grillRows, 'grillPodium', 'grill');
      renderPodium(picklerRows, 'picklerPodium', 'pickler');
      renderGrillList(grillRows);
      renderPicklerList(picklerRows);
      await updateSelfRankBar(sb);
    } catch (err) {
      console.error('[P!CKLE Ranking] load failed', err);
      ['grillPodium', 'picklerPodium'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
          el.innerHTML =
            '<p class="rank-empty">랭킹을 불러오지 못했습니다. Supabase에 25_ranking_scores.sql을 실행했는지 확인해 주세요.</p>';
        }
      });
    }
  }

  function switchMainTab(tabName) {
    currentTab = tabName;
    var tabGrill = document.getElementById('tabGrill');
    var tabPickler = document.getElementById('tabPickler');
    var grillArea = document.getElementById('grillRankingArea');
    var picklerArea = document.getElementById('picklerRankingArea');
    var mainEl = document.querySelector('main');

    if (tabGrill) tabGrill.classList.remove('active');
    if (tabPickler) tabPickler.classList.remove('active');
    if (grillArea) grillArea.classList.add('hidden');
    if (picklerArea) picklerArea.classList.add('hidden');
    if (mainEl) mainEl.classList.remove('theme-grill', 'theme-pickler');

    if (tabName === 'grill') {
      if (tabGrill) tabGrill.classList.add('active');
      if (grillArea) grillArea.classList.remove('hidden');
      if (mainEl) mainEl.classList.add('theme-grill');
    } else {
      if (tabPickler) tabPickler.classList.add('active');
      if (picklerArea) picklerArea.classList.remove('hidden');
      if (mainEl) mainEl.classList.add('theme-pickler');
    }

    getClient()
      .auth.getSession()
      .then(function () {
        return updateSelfRankBar(getClient());
      })
      .catch(function () {});
  }

  function bindScrollHeader() {
    var header = document.getElementById('mainHeader');
    if (!header) return;
    var lastScrollTop = 0;
    window.addEventListener('scroll', function () {
      var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      if (scrollTop > lastScrollTop && scrollTop > 60) {
        header.style.top = '-80px';
      } else {
        header.style.top = '0';
      }
      lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
    });
  }

  function init() {
    window.switchMainTab = switchMainTab;
    bindScrollHeader();
    loadAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PickleRanking = {
    reload: loadAll,
    switchMainTab: switchMainTab,
  };
})();
