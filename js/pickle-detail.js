/**
 * P!CKLE — 불판 상세 (?id=UUID) · posts / pickle_posts
 */
(function () {
  'use strict';

  var currentPost = null;
  var timerInterval = null;

  var CATEGORY_LABELS = {
    hot: '🔥 HOT',
    brand: '🤝 브랜드',
    love: '💖 연애',
    brain: '⚖️ 밸런스',
    ugc: '✨ UGC',
    other: '📌 기타',
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return window.PickleMediaView
      ? window.PickleMediaView.escapeHtml(str)
      : String(str ?? '');
  }

  function getPostIdFromUrl() {
    return new URLSearchParams(window.location.search).get('id');
  }

  function categoryDisplay(category) {
    if (!category) return '🔥 불판';
    return CATEGORY_LABELS[category] || category;
  }

  function mapMediaTypeToMode(mediaType) {
    if (!mediaType || mediaType === 'none') return 'text';
    if (mediaType === 'dual' || mediaType === 'video_dual') return 'vs';
    if (mediaType === 'single' || mediaType === 'video') return 'single';
    return 'text';
  }

  function normalizePicklePostsRow(row) {
    return {
      id: row.id,
      title: row.title || '',
      category: row.category,
      option_a: row.option_a || '',
      option_b: row.option_b || '',
      description: row.description || null,
      media_url_1: row.media_url_1,
      media_url_2: row.media_url_2,
      media_mode: row.media_mode || 'text',
      media_type: row.media_mode,
      layout_style: row.media_orientation || row.layout_style,
      hashtags: row.hashtags || row.tags,
      created_at: row.created_at,
      duration: row.duration,
      start_at: row.start_at,
      end_at: row.end_at,
      authorNickname: null,
    };
  }

  function normalizePostsRow(row) {
    return {
      id: row.id,
      title: row.title || '',
      category: row.category,
      option_a: row.option_a_name || '',
      option_b: row.option_b_name || '',
      description: row.description || null,
      media_url_1: row.media_url_1 || row.option_a_image_url,
      media_url_2: row.media_url_2 || row.option_b_image_url,
      media_mode: mapMediaTypeToMode(row.media_type),
      media_type: row.media_type,
      layout_style: row.layout_style,
      hashtags: row.hashtags || row.tags,
      created_at: row.created_at,
      duration: row.duration,
      start_at: row.start_at,
      end_at: row.end_at,
      authorNickname:
        row.users && row.users.nickname ? row.users.nickname : null,
    };
  }

  function formatHashtags(raw) {
    if (!raw) return [];
    return raw
      .split(/\s+/)
      .map(function (tag) {
        return tag.startsWith('#') ? tag : '#' + tag;
      })
      .filter(Boolean)
      .slice(0, 3);
  }

  function firstEmoji(text) {
    var m = String(text || '').match(/(\p{Extended_Pictographic})/u);
    return m ? m[1] : '🔥';
  }

  function computeEndsAt(post) {
    if (post.end_at) return new Date(post.end_at);
    if (!post.created_at) return null;

    var start = post.start_at
      ? new Date(post.start_at)
      : new Date(post.created_at);
    var duration = post.duration || '24h';

    if (duration === '24h') {
      return new Date(start.getTime() + 24 * 60 * 60 * 1000);
    }
    if (duration === '3') {
      return new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);
    }
    if (duration === '7') {
      return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    if (duration === 'custom' && post.end_at) {
      return new Date(post.end_at);
    }
    return null;
  }

  function formatCountdown(endsAt) {
    if (!endsAt) return '⏱ 진행 중';
    var ms = endsAt.getTime() - Date.now();
    if (ms <= 0) return '⏱ 마감됨';

    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;

    function pad(n) {
      return String(n).padStart(2, '0');
    }

    if (h >= 24) {
      var days = Math.floor(h / 24);
      h = h % 24;
      return '⏱ D-' + days + ' ' + pad(h) + ':' + pad(m) + ':' + pad(s);
    }

    return '⏱ ' + pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function startTimer(post) {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    var endsAt = computeEndsAt(post);
    var timerEl = $('detailTimer');
    if (!timerEl) return;

    function tick() {
      timerEl.textContent = formatCountdown(endsAt);
    }

    tick();
    if (endsAt) {
      timerInterval = setInterval(tick, 1000);
    }
  }

  async function fetchVoteStats(sb, postId) {
    var empty = { votesA: 0, votesB: 0, total: 0 };

    var rpc = await sb.rpc('get_post_vote_stats', { post_ids: [postId] });
    if (!rpc.error && rpc.data && rpc.data.length) {
      var st = rpc.data[0];
      return {
        votesA: Number(st.votes_a) || 0,
        votesB: Number(st.votes_b) || 0,
        total: Number(st.total) || 0,
      };
    }

    var fallback = await sb
      .from('votes')
      .select('choice')
      .eq('post_id', postId);

    if (fallback.error) {
      console.warn('[P!CKLE Detail] 투표 집계 실패', fallback.error);
      return empty;
    }

    var stats = { votesA: 0, votesB: 0, total: 0 };
    (fallback.data || []).forEach(function (row) {
      if (row.choice === 'A') stats.votesA += 1;
      if (row.choice === 'B') stats.votesB += 1;
      stats.total += 1;
    });
    return stats;
  }

  async function fetchCommentCount(sb, postId) {
    var result = await sb
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId)
      .eq('visibility_status', 'visible');

    if (result.error) {
      console.warn('[P!CKLE Detail] 댓글 수 조회 실패', result.error);
      return 0;
    }
    return result.count || 0;
  }

  async function fetchPostById(postId) {
    var sb = window.PickleSupabase.getClient();

    var postsResult = await sb
      .from('posts')
      .select('*, users:author_id ( nickname )')
      .eq('id', postId)
      .maybeSingle();

    if (postsResult.error) {
      throw postsResult.error;
    }
    if (postsResult.data) {
      return normalizePostsRow(postsResult.data);
    }

    var legacy = await sb
      .from('pickle_posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle();

    if (legacy.error) {
      throw legacy.error;
    }
    if (legacy.data) {
      return normalizePicklePostsRow(legacy.data);
    }

    return null;
  }

  function renderMeta(post) {
    var metaEl = $('detailMetaTags');
    if (!metaEl) return;

    var html = [];
    var catLabel = categoryDisplay(post.category);

    if (post.category) {
      html.push(
        '<span class="meta-tag meta-tag-cat">' + escapeHtml(catLabel) + '</span>'
      );
    }

    formatHashtags(post.hashtags).forEach(function (tag) {
      html.push('<span class="meta-tag">' + escapeHtml(tag) + '</span>');
    });

    html.push('<span class="timer-badge" id="detailTimer">⏱ --:--:--</span>');

    metaEl.innerHTML = html.join('');
    startTimer(post);
  }

  function renderAuthor(post) {
    var picEl = $('detailAuthorPic');
    var nameEl = $('detailAuthorName');
    var badgeEl = $('detailCategoryBadge');
    var commentInput = $('detailCommentInput');

    if (picEl) picEl.textContent = firstEmoji(categoryDisplay(post.category));
    if (nameEl) {
      nameEl.textContent = post.authorNickname || '픽클러';
    }

    if (badgeEl && post.category) {
      badgeEl.textContent = categoryDisplay(post.category)
        .replace(/^(\p{Extended_Pictographic}\s*)/u, '')
        .trim() || catLabelFallback(post.category);
      badgeEl.hidden = false;
    } else if (badgeEl) {
      badgeEl.hidden = true;
    }

    if (commentInput) {
      var shortCat = categoryDisplay(post.category)
        .replace(/^(\p{Extended_Pictographic}\s*)/u, '')
        .trim() || '불판';
      commentInput.placeholder = shortCat + ' 훈수를 자유롭게 남겨보세요.';
    }
  }

  function catLabelFallback(category) {
    return String(category || '불판');
  }

  function renderStats(voteStats, commentCount) {
    var statsEl = $('detailStats');
    if (!statsEl) return;

    var total = voteStats.total || 0;
    var label = total > 0 ? '🔥 ' + total.toLocaleString() + '명 참전' : '🔥 NEW';

    statsEl.innerHTML =
      '<span>' +
      escapeHtml(label) +
      '</span><span>💬 ' +
      Number(commentCount || 0).toLocaleString() +
      ' 댓글</span>';
  }

  function renderDetail(post, voteStats, commentCount) {
    currentPost = post;
    document.title = 'P!CKLE - ' + (post.title || '불판 상세');

    renderAuthor(post);
    renderMeta(post);

    var titleEl = $('detailTitle');
    if (titleEl) titleEl.textContent = post.title || '';

    var optA = $('optBtnA');
    var optB = $('optBtnB');
    if (optA) {
      optA.innerHTML =
        '<span class="opt-label-a">A</span> ' + escapeHtml(post.option_a || '');
    }
    if (optB) {
      optB.innerHTML =
        '<span class="opt-label-b">B</span> ' + escapeHtml(post.option_b || '');
    }

    var descEl = $('detailDescription');
    if (descEl) {
      if (post.description) {
        descEl.textContent = post.description;
        descEl.hidden = false;
      } else {
        descEl.hidden = true;
      }
    }

    var mediaEl = $('videoContainer');
    if (mediaEl && window.PickleMediaView) {
      mediaEl.innerHTML = window.PickleMediaView.buildDetailMediaHtml(post);
    }

    renderStats(voteStats, commentCount);
  }

  function showError(message) {
    if (timerInterval) clearInterval(timerInterval);
    var main = document.querySelector('main');
    if (!main) return;
    main.innerHTML =
      '<div style="padding:40px 20px;text-align:center;">' +
      '<p style="color:#ff007f;font-weight:800;margin-bottom:12px;">' +
      escapeHtml(message) +
      '</p>' +
      '<button onclick="location.href=\'index.html\'" style="background:#39ff14;color:#000;border:none;padding:12px 20px;border-radius:12px;font-weight:800;cursor:pointer;">피드로 돌아가기</button>' +
      '</div>';
  }

  async function loadDetail() {
    var postId = getPostIdFromUrl();
    if (!postId) {
      showError('불판 ID가 없습니다. 메인 피드에서 카드를 선택해 주세요.');
      return;
    }

    try {
      var sb = window.PickleSupabase.getClient();
      var post = await fetchPostById(postId);

      if (!post) {
        showError('해당 불판을 찾을 수 없습니다.');
        return;
      }

      var voteStats = await fetchVoteStats(sb, postId);
      var commentCount = await fetchCommentCount(sb, postId);

      renderDetail(post, voteStats, commentCount);
    } catch (err) {
      console.error('[P!CKLE Detail]', err);
      showError('불판을 불러오지 못했습니다. ' + (err.message || String(err)));
    }
  }

  window.PickleDetail = {
    load: loadDetail,
    getCurrentPost: function () {
      return currentPost;
    },
  };

  document.addEventListener('DOMContentLoaded', loadDetail);
})();
