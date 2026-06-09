/**
 * P!CKLE 메인 피드 — pickle_posts Cold Start 로딩
 * 상단 3개: 킹왕짱 (블라인드 훅 — 제목·이미지만)
 * 하단: 나머지 최신 글 리스트
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function detailUrl(id) {
    return 'detail.html?id=' + encodeURIComponent(id);
  }

  function goDetail(id) {
    window.location.href = detailUrl(id);
  }

  function getThumbUrl(post) {
    return post.media_url_1 || post.media_url_2 || null;
  }

  function formatTimeAgo(iso) {
    if (!iso) return '방금 전';
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return '방금 전';
    if (min < 60) return min + '분 전';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + '시간 전';
    const day = Math.floor(hr / 24);
    if (day < 7) return day + '일 전';
    return new Date(iso).toLocaleDateString('ko-KR');
  }

  function kingTagLabel(post) {
    return escapeHtml(post.category || '🔥 불판');
  }

  function renderThumb(post, className) {
    if (window.PickleMediaView) {
      return window.PickleMediaView.buildKingThumbHtml(post, className);
    }
    var url = getThumbUrl(post);
    if (url) {
      return (
        '<div class="' +
        className +
        '"><img src="' +
        escapeHtml(url) +
        '" alt="" loading="lazy"></div>'
      );
    }
    return (
      '<div class="' +
      className +
      ' king-thumb-placeholder"><span>🔥</span></div>'
    );
  }

  function renderKingCards(posts) {
    const container = document.getElementById('aiCurationContainer');
    if (!container) return;

    if (!posts.length) {
      container.innerHTML =
        '<div class="feed-empty king-empty">아직 킹왕짱 불판이 없어요. 첫 불판을 지져보세요!</div>';
      return;
    }

    container.innerHTML = posts
      .map(function (post, index) {
        return (
          '<article class="king-card" data-id="' +
          escapeHtml(post.id) +
          '" role="button" tabindex="0" aria-label="' +
          escapeHtml(post.title) +
          '">' +
          renderThumb(post, 'king-thumb') +
          '<div class="tags">' +
          kingTagLabel(post) +
          '</div>' +
          '<h2 class="title">' +
          escapeHtml(post.title) +
          '</h2>' +
          '<button type="button" class="btn-pick">결과가 궁금하다면? 참전하기 🔥</button>' +
          '</article>'
        );
      })
      .join('');

    container.querySelectorAll('.king-card').forEach(function (card) {
      var id = card.dataset.id;
      card.addEventListener('click', function () {
        goDetail(id);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goDetail(id);
        }
      });
    });
  }

  function renderFeedList(posts) {
    const container = document.getElementById('hotFeedList');
    if (!container) return;

    if (!posts.length) {
      container.innerHTML =
        '<div class="feed-empty">더 불러올 불판이 없어요. 새 불판을 만들어 피드를 채워보세요!</div>';
      return;
    }

    container.innerHTML = posts
      .map(function (post) {
        return (
          '<article class="list-card" data-id="' +
          escapeHtml(post.id) +
          '" role="button" tabindex="0">' +
          '<div class="list-header"><span class="list-cat">' +
          escapeHtml(post.category || '🔥 불판') +
          '</span></div>' +
          '<h3 class="title">' +
          escapeHtml(post.title) +
          '</h3>' +
          '<div class="text-vs-box">' +
          '<span class="opt-text opt-a">[A] ' +
          escapeHtml(post.option_a) +
          '</span>' +
          '<span class="vs-mark">VS</span>' +
          '<span class="opt-text opt-b">[B] ' +
          escapeHtml(post.option_b) +
          '</span>' +
          '</div>' +
          '<div class="list-meta"><span>🕐 ' +
          escapeHtml(formatTimeAgo(post.created_at)) +
          '</span></div>' +
          '</article>'
        );
      })
      .join('');

    container.querySelectorAll('.list-card').forEach(function (card) {
      var id = card.dataset.id;
      card.addEventListener('click', function () {
        goDetail(id);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goDetail(id);
        }
      });
    });
  }

  function showFeedError(message) {
    var king = document.getElementById('aiCurationContainer');
    var list = document.getElementById('hotFeedList');
    var html = '<div class="feed-empty feed-error">' + escapeHtml(message) + '</div>';
    if (king) king.innerHTML = html;
    if (list) list.innerHTML = '';
  }

  async function loadPickleFeed() {
    var king = document.getElementById('aiCurationContainer');
    var list = document.getElementById('hotFeedList');

    if (king) king.innerHTML = '<div class="feed-loading">불판 불러오는 중…</div>';
    if (list) list.innerHTML = '<div class="feed-loading">잠시만요…</div>';

    try {
      var sb = window.PickleSupabase.getClient();
      var result = await sb
        .from('pickle_posts')
        .select('id, category, title, option_a, option_b, media_mode, media_url_1, media_url_2, created_at')
        .order('created_at', { ascending: false });

      if (result.error) throw result.error;

      var all = result.data || [];
      renderKingCards(all.slice(0, 3));
      renderFeedList(all.slice(3));
    } catch (err) {
      console.error('[P!CKLE Feed]', err);
      showFeedError('불판을 불러오지 못했습니다. ' + (err.message || String(err)));
    }
  }

  window.PickleFeed = {
    load: loadPickleFeed,
    goDetail: goDetail,
  };

  document.addEventListener('DOMContentLoaded', loadPickleFeed);
})();
