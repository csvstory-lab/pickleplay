/**
 * P!CKLE 메인 피드 — posts / pickle_posts Supabase 연동
 * 상단 3개: 킹왕짱 · 하단: 실시간 리스트
 */
(function () {
  'use strict';

  var CATEGORY_LABELS = {
    hot: '🔥 HOT',
    brand: '🤝 브랜드',
    love: '💖 연애',
    brain: '⚖️ 밸런스',
    ugc: '✨ UGC',
    other: '📌 기타',
  };

  var LOADING_HTML =
    '<div class="feed-loading">' +
    '<div class="feed-spinner" aria-hidden="true"></div>' +
    '<p>🔥 불판을 뜨겁게 달구는 중입니다...</p>' +
    '</div>';

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

  function getClient() {
    if (!window.PickleSupabase || !window.PickleSupabase.getClient) {
      throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
    }
    return window.PickleSupabase.getClient();
  }

  function showLoading(container) {
    if (container) container.innerHTML = LOADING_HTML;
  }

  function calcPercent(votesA, votesB) {
    var total = votesA + votesB;
    if (total === 0) return { a: 50, b: 50, total: 0 };
    var a = Math.round((votesA / total) * 100);
    return { a: a, b: 100 - a, total: total };
  }

  function categoryLabel(category) {
    if (!category) return '🔥 불판';
    return CATEGORY_LABELS[category] || escapeHtml(category);
  }

  function normalizePostRow(row, source) {
    if (source === 'pickle_posts') {
    return {
      id: row.id,
      title: row.title || '',
      category: row.category,
      categoryLabel: categoryLabel(row.category),
      option_a: row.option_a || '',
      option_b: row.option_b || '',
      media_url_1: row.media_url_1,
      media_url_2: row.media_url_2,
      media_mode: row.media_mode,
      media_type: row.media_mode,
      thumbnail_url: row.thumbnail_url || null,
      tags: row.tags || row.hashtags || '',
      is_sponsor: false,
      created_at: row.created_at,
      authorNickname: null,
    };
    }

    return {
      id: row.id,
      title: row.title || '',
      category: row.category,
      categoryLabel: categoryLabel(row.category),
      option_a: row.option_a_name || '',
      option_b: row.option_b_name || '',
      media_url_1: row.media_url_1 || row.option_a_image_url,
      media_url_2: row.media_url_2 || row.option_b_image_url,
      media_mode: row.media_type,
      media_type: row.media_type,
      thumbnail_url: row.thumbnail_url || null,
      tags: row.tags || row.hashtags || '',
      is_sponsor: !!row.is_sponsor,
      created_at: row.created_at,
      authorNickname: row.users && row.users.nickname ? row.users.nickname : null,
    };
  }

  function formatHashtags(raw) {
    if (!raw) return [];
    return String(raw)
      .split(/\s+/)
      .map(function (tag) {
        tag = tag.trim();
        if (!tag) return '';
        return tag.startsWith('#') ? tag : '#' + tag;
      })
      .filter(Boolean)
      .slice(0, 5);
  }

  async function fetchVoteStatsMap(sb, postIds) {
    var map = new Map();
    if (!postIds.length) return map;

    var rpc = await sb.rpc('get_post_vote_stats', { post_ids: postIds });
    if (!rpc.error && rpc.data) {
      rpc.data.forEach(function (st) {
        map.set(st.post_id, {
          votesA: Number(st.votes_a) || 0,
          votesB: Number(st.votes_b) || 0,
          total: Number(st.total) || 0,
        });
      });
      return map;
    }

    var fallback = await sb
      .from('votes')
      .select('post_id, choice')
      .in('post_id', postIds);

    if (fallback.error) {
      console.warn('[P!CKLE Feed] 투표 집계 실패', fallback.error);
      return map;
    }

    postIds.forEach(function (id) {
      map.set(id, { votesA: 0, votesB: 0, total: 0 });
    });

    (fallback.data || []).forEach(function (row) {
      var st = map.get(row.post_id) || { votesA: 0, votesB: 0, total: 0 };
      if (row.choice === 'A') st.votesA += 1;
      if (row.choice === 'B') st.votesB += 1;
      st.total += 1;
      map.set(row.post_id, st);
    });

    return map;
  }

  async function fetchCommentCountMap(sb, postIds) {
    var map = new Map();
    if (!postIds.length) return map;

    var result = await sb
      .from('comments')
      .select('post_id')
      .in('post_id', postIds)
      .eq('visibility_status', 'visible');

    if (result.error) {
      console.warn('[P!CKLE Feed] 댓글 수 조회 실패', result.error);
      return map;
    }

    (result.data || []).forEach(function (row) {
      map.set(row.post_id, (map.get(row.post_id) || 0) + 1);
    });

    return map;
  }

  async function fetchFromPostsTable(sb) {
    return sb
      .from('posts')
      .select(
        [
          'id',
          'title',
          'category',
          'option_a_name',
          'option_b_name',
          'option_a_image_url',
          'option_b_image_url',
          'media_type',
          'media_url_1',
          'media_url_2',
          'layout_style',
          'thumbnail_url',
          'tags',
          'is_sponsor',
          'visibility_status',
          'created_at',
          'users:author_id ( nickname )',
        ].join(', ')
      )
      .eq('visibility_status', 'visible')
      .order('created_at', { ascending: false });
  }

  async function fetchFromPicklePostsTable(sb) {
    return sb
      .from('pickle_posts')
      .select(
        'id, category, title, option_a, option_b, media_mode, media_url_1, media_url_2, thumbnail_url, hashtags, created_at'
      )
      .order('created_at', { ascending: false });
  }

  /**
   * Supabase posts 테이블에서 최신 불판 + 투표·댓글 집계
   * @returns {Promise<Array>}
   */
  async function fetchPicklePosts() {
    var sb = getClient();
    var source = 'posts';
    var result = await fetchFromPostsTable(sb);

    if (result.error) {
      console.warn('[P!CKLE Feed] posts 조회 실패, pickle_posts 폴백', result.error);
      source = 'pickle_posts';
      result = await fetchFromPicklePostsTable(sb);
      if (result.error) throw result.error;
    }

    var rows = result.data || [];
    if (!rows.length) return [];

    var postIds = rows.map(function (r) {
      return r.id;
    });

    var voteStatsMap = await fetchVoteStatsMap(sb, postIds);
    var commentCountMap = await fetchCommentCountMap(sb, postIds);

    return rows.map(function (row) {
      var post = normalizePostRow(row, source);
      var st = voteStatsMap.get(post.id) || { votesA: 0, votesB: 0, total: 0 };
      var pct = calcPercent(st.votesA, st.votesB);
      post.votesA = st.votesA;
      post.votesB = st.votesB;
      post.totalVotes = pct.total;
      post.pctA = pct.a;
      post.pctB = pct.b;
      post.commentCount = commentCountMap.get(post.id) || 0;
      return post;
    });
  }

  function formatTimeAgo(iso) {
    if (!iso) return '방금 전';
    var diff = Date.now() - new Date(iso).getTime();
    var min = Math.floor(diff / 60000);
    if (min < 1) return '방금 전';
    if (min < 60) return min + '분 전';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + '시간 전';
    var day = Math.floor(hr / 24);
    if (day < 7) return day + '일 전';
    return new Date(iso).toLocaleDateString('ko-KR');
  }

  function renderKingThumb(post) {
    if (post.thumbnail_url) {
      return (
        '<div class="king-thumb">' +
        '<img src="' +
        escapeHtml(post.thumbnail_url) +
        '" alt="" loading="lazy">' +
        '</div>'
      );
    }

    var cat = escapeHtml(post.categoryLabel || '불판');
    return (
      '<div class="king-thumb king-thumb-fallback">' +
      '<span class="king-fallback-cat">' +
      cat +
      '</span>' +
      '</div>'
    );
  }

  function renderKingMetaRow(post) {
    var tagSpans = formatHashtags(post.tags)
      .map(function (tag) {
        return '<span class="king-hashtag">' + escapeHtml(tag) + '</span>';
      })
      .join('');

    return (
      '<div class="king-meta-row">' +
      '<span class="king-category">' +
      escapeHtml(post.categoryLabel) +
      '</span>' +
      tagSpans +
      '</div>'
    );
  }

  function renderKingAbBox(post) {
    return (
      '<div class="king-ab-box">' +
      '<span class="king-ab-a">[A: ' +
      escapeHtml(post.option_a) +
      ']</span>' +
      '<span class="king-ab-vs">vs</span>' +
      '<span class="king-ab-b">[B: ' +
      escapeHtml(post.option_b) +
      ']</span>' +
      '</div>'
    );
  }

  function bindCardNavigation(root, selector) {
    root.querySelectorAll(selector).forEach(function (card) {
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

  function renderEmptyState(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="feed-empty">' +
      '<p class="feed-empty-title">아직 지펴진 불판이 없습니다.<br>첫 불판의 주인이 되어보세요! 🔥</p>' +
      '<button type="button" class="btn-create-feed" onclick="location.href=\'create.html\'">불판 생성하기</button>' +
      '</div>';
  }

  function renderKingCards(posts) {
    var container = document.getElementById('aiCurationContainer');
    if (!container) return;

    if (!posts.length) {
      renderEmptyState(container);
      return;
    }

    container.innerHTML = posts
      .map(function (post) {
        return (
          '<article class="king-card" data-id="' +
          escapeHtml(post.id) +
          '" role="button" tabindex="0" aria-label="' +
          escapeHtml(post.title) +
          '">' +
          renderKingThumb(post) +
          renderKingMetaRow(post) +
          '<h2 class="title">' +
          escapeHtml(post.title) +
          '</h2>' +
          renderKingAbBox(post) +
          '<button type="button" class="btn-pick">🔥 참전하기</button>' +
          '</article>'
        );
      })
      .join('');

    bindCardNavigation(container, '.king-card');
  }

  function renderFeedList(posts) {
    var container = document.getElementById('hotFeedList');
    if (!container) return;

    if (!posts.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = posts
      .map(function (post) {
        var sponsorClass = post.is_sponsor ? ' sponsor-card' : '';
        var catClass = post.is_sponsor ? ' sponsor-badge' : '';
        return (
          '<article class="list-card' +
          sponsorClass +
          '" data-id="' +
          escapeHtml(post.id) +
          '" role="button" tabindex="0">' +
          '<div class="list-header"><span class="list-cat' +
          catClass +
          '">' +
          escapeHtml(post.categoryLabel) +
          '</span></div>' +
          '<h3 class="title">' +
          escapeHtml(post.title) +
          '</h3>' +
          '<div class="list-ab-compact">' +
          '<span class="list-ab-a">[A: ' +
          escapeHtml(post.option_a) +
          ']</span>' +
          '<span class="list-ab-vs">vs</span>' +
          '<span class="list-ab-b">[B: ' +
          escapeHtml(post.option_b) +
          ']</span>' +
          '</div>' +
          '<div class="list-participants">🔥 ' +
          post.totalVotes.toLocaleString() +
          '명 참전</div>' +
          '</article>'
        );
      })
      .join('');

    bindCardNavigation(container, '.list-card');
  }

  function showFeedError(message) {
    var king = document.getElementById('aiCurationContainer');
    var list = document.getElementById('hotFeedList');
    var html =
      '<div class="feed-empty feed-error">' + escapeHtml(message) + '</div>';
    if (king) king.innerHTML = html;
    if (list) list.innerHTML = '';
  }

  async function loadPickleFeed() {
    var king = document.getElementById('aiCurationContainer');
    var list = document.getElementById('hotFeedList');

    showLoading(king);
    showLoading(list);

    try {
      var all = await fetchPicklePosts();

      if (!all.length) {
        renderEmptyState(king);
        renderEmptyState(list);
        return;
      }

      renderKingCards(all.slice(0, 3));
      renderFeedList(all.slice(3));
    } catch (err) {
      console.error('[P!CKLE Feed]', err);
      showFeedError(
        '불판을 불러오지 못했습니다. ' + (err.message || String(err))
      );
    }
  }

  window.PickleFeed = {
    load: loadPickleFeed,
    fetchPicklePosts: fetchPicklePosts,
    goDetail: goDetail,
  };

  document.addEventListener('DOMContentLoaded', loadPickleFeed);
})();
