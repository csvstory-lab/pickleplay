/**
 * P!CKLE — pickle_posts 미디어 URL → 썸네일 / embed HTML
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

  function isLocalFilePage() {
    try {
      return /^file:/i.test(window.location.href) || window.location.origin === 'null';
    } catch (_) {
      return false;
    }
  }

  function parseMedia(url) {
    if (!url) return { kind: 'none' };
    if (window.PickleMedia) {
      var parsed = window.PickleMedia.parseVideoUrl(url);
      if (parsed.provider === 'youtube') {
        return {
          kind: 'youtube',
          embedUrl: parsed.embedUrl,
          thumbnailUrl: parsed.thumbnailUrl,
          rawUrl: parsed.rawUrl,
          videoId: parsed.videoId,
        };
      }
      if (parsed.provider === 'tiktok') {
        return {
          kind: 'tiktok',
          embedUrl: parsed.embedUrl,
          rawUrl: parsed.rawUrl,
        };
      }
      if (window.PickleMedia.looksLikeImageUrl(url)) {
        return { kind: 'image', src: url };
      }
    }
    if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(url) || /post_media/i.test(url)) {
      return { kind: 'image', src: url };
    }
    return { kind: 'link', rawUrl: url };
  }

  function getPostThumbUrl(post) {
    var url = post.media_url_1 || post.media_url_2;
    if (!url) return null;
    var media = parseMedia(url);
    if (media.kind === 'youtube') return media.thumbnailUrl;
    if (media.kind === 'image') return media.src;
    return null;
  }

  function buildKingThumbHtml(post, className) {
    var thumb = getPostThumbUrl(post);
    var url = post.media_url_1 || post.media_url_2;
    var media = parseMedia(url);

    if (thumb) {
      var badge =
        media.kind === 'youtube'
          ? '<span class="media-badge media-badge-yt">▶ 유튜브</span>'
          : '';
      return (
        '<div class="' +
        className +
        '">' +
        badge +
        '<img src="' +
        escapeHtml(thumb) +
        '" alt="" loading="lazy">' +
        '</div>'
      );
    }

    if (media.kind === 'tiktok') {
      return (
        '<div class="' +
        className +
        ' king-thumb-placeholder king-thumb-video">' +
        '<span>▶</span><small>틱톡 영상</small></div>'
      );
    }

    return (
      '<div class="' +
      className +
      ' king-thumb-placeholder"><span>🔥</span></div>'
    );
  }

  function buildEmbedFrame(embedUrl, title) {
    return (
      '<iframe src="' +
      escapeHtml(embedUrl) +
      '" title="' +
      escapeHtml(title || '영상') +
      '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"' +
      ' allowfullscreen referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe>'
    );
  }

  function buildYouTubeWatchBlock(media, title) {
    var watchUrl =
      media.rawUrl ||
      (media.videoId ? 'https://www.youtube.com/watch?v=' + media.videoId : '');
    var thumb = media.thumbnailUrl || '';
    return (
      '<a class="youtube-watch-fallback" href="' +
      escapeHtml(watchUrl) +
      '" target="_blank" rel="noopener noreferrer">' +
      (thumb
        ? '<img src="' + escapeHtml(thumb) + '" alt="' + escapeHtml(title || '') + '">'
        : '<div class="youtube-watch-placeholder">▶</div>') +
      '<span class="youtube-watch-btn">YouTube에서 보기</span>' +
      '</a>' +
      '<p class="youtube-watch-hint">로컬 파일로 열면 영상 재생이 제한될 수 있어요. Live Server 사용을 권장합니다.</p>'
    );
  }

  function renderYouTubeMedia(media, title, wrapClass) {
    if (isLocalFilePage()) {
      return '<div class="' + wrapClass + '">' + buildYouTubeWatchBlock(media, title) + '</div>';
    }
    return (
      '<div class="' + wrapClass + '">' + buildEmbedFrame(media.embedUrl, title) + '</div>'
    );
  }

  function buildDetailMediaHtml(post) {
    var mode = post.media_mode || 'text';
    var title = post.title || '불판';

    if (mode === 'text' || (!post.media_url_1 && !post.media_url_2)) {
      return (
        '<div class="detail-media-empty">' +
        '<span>📝</span><p>텍스트 불판</p></div>'
      );
    }

    if (mode === 'single') {
      var single = parseMedia(post.media_url_1);
      if (single.kind === 'youtube') {
        return renderYouTubeMedia(single, title, 'single-media-wrap');
      }
      if (single.kind === 'tiktok') {
        return (
          '<div class="single-media-wrap">' +
          buildEmbedFrame(single.embedUrl, title) +
          '</div>'
        );
      }
      if (single.kind === 'image') {
        return (
          '<div class="single-media-wrap single-media-image">' +
          '<img src="' +
          escapeHtml(single.src) +
          '" alt="">' +
          '</div>'
        );
      }
    }

    if (mode === 'vs') {
      var mediaA = parseMedia(post.media_url_1);
      var mediaB = parseMedia(post.media_url_2);
      return (
        '<div class="vertical-split-container">' +
        buildSplitHalf('A', mediaA, post.option_a, title) +
        '<div class="vs-badge">VS</div>' +
        buildSplitHalf('B', mediaB, post.option_b, title) +
        '</div>'
      );
    }

    return (
      '<div class="detail-media-empty">' +
      '<span>🔥</span><p>미디어 없음</p></div>'
    );
  }

  function buildSplitHalf(side, media, label, title) {
    var sideClass = side === 'A' ? 'split-left' : 'split-right';
    var inner = '';

    if (media.kind === 'youtube') {
      if (isLocalFilePage()) {
        inner = buildYouTubeWatchBlock(media, title + ' ' + side);
      } else {
        inner =
          '<div class="split-embed">' +
          buildEmbedFrame(media.embedUrl, title + ' ' + side) +
          '</div>';
      }
    } else if (media.kind === 'tiktok') {
      inner =
        '<div class="split-embed">' +
        buildEmbedFrame(media.embedUrl, title + ' ' + side) +
        '</div>';
    } else if (media.kind === 'image') {
      inner =
        '<img class="split-image" src="' +
        escapeHtml(media.src) +
        '" alt="">';
    } else {
      inner =
        '<div class="media-placeholder">' +
        escapeHtml(side) +
        '. ' +
        escapeHtml(label || '') +
        '</div>';
    }

    return (
      '<div class="split-half ' +
      sideClass +
      '" data-side="' +
      side +
      '">' +
      inner +
      '</div>'
    );
  }

  window.PickleMediaView = {
    parseMedia: parseMedia,
    getPostThumbUrl: getPostThumbUrl,
    buildKingThumbHtml: buildKingThumbHtml,
    buildDetailMediaHtml: buildDetailMediaHtml,
    escapeHtml: escapeHtml,
  };
})();
