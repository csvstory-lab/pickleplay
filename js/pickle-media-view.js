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
    if (!post || !post.thumbnail_url) return null;
    var url = String(post.thumbnail_url).trim();
    if (!url) return null;
    if (window.PickleMedia && window.PickleMedia.isValidVideoUrl && window.PickleMedia.isValidVideoUrl(url)) {
      return null;
    }
    if (/youtube|youtu\.be|tiktok|vimeo|\.mp4|\.webm/i.test(url)) return null;
    return url;
  }

  function buildKingThumbHtml(post, className) {
    var thumb = getPostThumbUrl(post);

    if (thumb) {
      return (
        '<div class="' +
        className +
        '">' +
        '<img src="' +
        escapeHtml(thumb) +
        '" alt="" loading="lazy">' +
        '</div>'
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

  function resolveMediaMode(post) {
    if (post.media_mode) return post.media_mode;
    var t = post.media_type;
    if (!t || t === 'none') return 'text';
    if (t === 'dual' || t === 'video_dual') return 'vs';
    if (t === 'single' || t === 'video') return 'single';
    return 'text';
  }

  function resolveMediaLayout(post) {
    var layout =
      (post && post.media_layout) ||
      (post && post.layout_style) ||
      (post && post.media_orientation) ||
      'horizontal';
    return String(layout).toLowerCase() === 'vertical' ? 'vertical' : 'horizontal';
  }

  function hashPostIdToAssetSet(postId) {
    var str = String(postId || '');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return (Math.abs(hash) % 7) + 1;
  }

  function getPickleVoteAssetPath(side, setIndex) {
    var idx = Math.max(1, Math.min(7, Number(setIndex) || 1));
    var suffix = side === 'B' ? 'B' : 'A';
    return 'asset/asset_' + suffix + '_' + idx + '.png';
  }

  function buildPickleCharImg(side, setIndex) {
    var src = getPickleVoteAssetPath(side, setIndex);
    return (
      '<img class="media-pickle-char" src="' +
      escapeHtml(src) +
      '" alt="" aria-hidden="true" loading="lazy" decoding="async">'
    );
  }

  function buildDetailMediaHtml(post) {
    var mode = resolveMediaMode(post);
    var title = post.title || '불판';
    var layout = resolveMediaLayout(post);
    var assetSet = hashPostIdToAssetSet(post.id);

    if (mode === 'text' || (!post.media_url_1 && !post.media_url_2)) {
      return (
        '<div class="detail-media-empty">' +
        '<span>📝</span><p>텍스트 불판</p></div>'
      );
    }

    if (mode === 'single') {
      var single = parseMedia(post.media_url_1);
      var singleClass =
        layout === 'vertical'
          ? 'single-media-wrap single-media-vertical'
          : 'single-media-wrap single-media-horizontal';
      if (single.kind === 'youtube') {
        return renderYouTubeMedia(single, title, singleClass);
      }
      if (single.kind === 'tiktok') {
        return (
          '<div class="' +
          singleClass +
          '">' +
          buildEmbedFrame(single.embedUrl, title) +
          '</div>'
        );
      }
      if (single.kind === 'image') {
        return (
          '<div class="' +
          singleClass +
          ' single-media-image">' +
          '<img src="' +
          escapeHtml(single.src) +
          '" alt="">' +
          buildPickleCharImg('A', assetSet) +
          '</div>'
        );
      }
    }

    if (mode === 'vs') {
      var mediaA = parseMedia(post.media_url_1);
      var mediaB = parseMedia(post.media_url_2);
      var layoutClass =
        layout === 'vertical'
          ? 'media-layout-vertical vertical'
          : 'media-layout-horizontal';
      return (
        '<div class="media-container ' +
        layoutClass +
        '">' +
        buildSplitHalf('A', mediaA, post.option_a, title, assetSet) +
        buildSplitHalf('B', mediaB, post.option_b, title, assetSet) +
        '<div class="vs-badge">VS</div>' +
        '</div>'
      );
    }

    return (
      '<div class="detail-media-empty">' +
      '<span>🔥</span><p>미디어 없음</p></div>'
    );
  }

  function buildSplitHalf(side, media, label, title, assetSet) {
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
      '<div class="split-half media-vote-tap ' +
      sideClass +
      '" data-side="' +
      side +
      '" role="button" tabindex="0" aria-label="' +
      escapeHtml(side + ' 선택 · ' + (label || '투표')) +
      '">' +
      inner +
      buildPickleCharImg(side, assetSet) +
      '</div>'
    );
  }

  window.PickleMediaView = {
    parseMedia: parseMedia,
    getPostThumbUrl: getPostThumbUrl,
    buildKingThumbHtml: buildKingThumbHtml,
    buildDetailMediaHtml: buildDetailMediaHtml,
    resolveMediaLayout: resolveMediaLayout,
    escapeHtml: escapeHtml,
  };
})();
