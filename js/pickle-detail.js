/**
 * P!CKLE — pickle_posts 상세 페이지 (?id=UUID)
 */
(function () {
  'use strict';

  var currentPost = null;
  var timerInterval = null;

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

    var start = post.start_at ? new Date(post.start_at) : new Date(post.created_at);
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

  function renderMeta(post) {
    var metaEl = $('detailMetaTags');
    if (!metaEl) return;

    var html = [];

    if (post.category) {
      html.push(
        '<span class="meta-tag meta-tag-cat">' + escapeHtml(post.category) + '</span>'
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

    if (picEl) picEl.textContent = firstEmoji(post.category);
    if (nameEl) nameEl.textContent = '픽클러';

    if (badgeEl && post.category) {
      badgeEl.textContent = post.category.replace(/^(\p{Extended_Pictographic}\s*)/u, '').trim() || post.category;
      badgeEl.hidden = false;
    } else if (badgeEl) {
      badgeEl.hidden = true;
    }

    if (commentInput && post.category) {
      var shortCat = post.category.replace(/^(\p{Extended_Pictographic}\s*)/u, '').trim() || '불판';
      commentInput.placeholder = shortCat + ' 훈수를 자유롭게 남겨보세요.';
    }
  }

  function renderDetail(post) {
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
      bindSplitTap(mediaEl);
    }

    var statsEl = $('detailStats');
    if (statsEl) {
      statsEl.innerHTML = '<span>🔥 NEW</span><span>💬 0 댓글</span>';
    }
  }

  function bindSplitTap(container) {
    container.querySelectorAll('.split-half[data-side]').forEach(function (half) {
      half.addEventListener('click', function (e) {
        var side = half.dataset.side;
        if (typeof window.handleTap === 'function') {
          window.handleTap(side, e, half);
        }
      });
    });
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
      var result = await sb
        .from('pickle_posts')
        .select('*')
        .eq('id', postId)
        .maybeSingle();

      if (result.error) throw result.error;
      if (!result.data) {
        showError('해당 불판을 찾을 수 없습니다.');
        return;
      }

      renderDetail(result.data);
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
