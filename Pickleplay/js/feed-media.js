/**
 * P!CKLE — 피드 카드 미디어 렌더링 (이미지 / 동영상 단일·A vs B 듀얼)
 */
(function () {
  'use strict';

  const IFRAME_ALLOW =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseVideo(raw) {
    if (!window.PickleMedia) return { provider: null, embedUrl: '' };
    return window.PickleMedia.parseVideoUrl(raw);
  }

  function isPortraitVideo(video) {
    return video?.format === 'portrait' || video?.isShortForm === true;
  }

  function embedWrapClassList(video) {
    const v = video || {};
    const list = ['video-embed-wrap'];
    if (v.provider === 'youtube') list.push('video-embed-wrap--youtube');
    if (v.provider === 'tiktok') list.push('video-embed-wrap--tiktok');
    list.push(isPortraitVideo(v) ? 'video-embed-wrap--portrait' : 'video-embed-wrap--landscape');
    return list.join(' ');
  }

  /** 렌더 직전 embed URL·숏폼 포맷 재계산 */
  function resolveVideoForEmbed(video) {
    if (!video?.provider) return video;
    if (video.rawUrl && window.PickleMedia?.parseVideoUrl) {
      const fresh = window.PickleMedia.parseVideoUrl(video.rawUrl);
      if (fresh.embedUrl) {
        if (fresh.provider === 'youtube' && fresh.videoId && window.PickleMedia.buildYouTubeEmbedUrl) {
          return { ...fresh, embedUrl: window.PickleMedia.buildYouTubeEmbedUrl(fresh.videoId) };
        }
        return fresh;
      }
    }
    if (video.provider === 'youtube' && video.videoId && window.PickleMedia?.buildYouTubeEmbedUrl) {
      return {
        ...video,
        embedUrl: window.PickleMedia.buildYouTubeEmbedUrl(video.videoId),
      };
    }
    return video;
  }

  function isVideoUrl(url) {
    return window.PickleMedia?.isEmbeddableVideoUrl(url);
  }

  function isImageUrl(url) {
    if (!url) return false;
    if (window.PickleMedia?.looksLikeImageUrl(url)) return true;
    return !isVideoUrl(url) && /^https?:\/\//i.test(url);
  }

  function normalizePostMedia(post) {
    let mediaType = post.media_type || 'none';
    let url1 = (post.media_url_1 || '').trim();
    let url2 = (post.media_url_2 || '').trim();
    let layout = post.layout_style || 'horizontal';

    if (mediaType === 'none') {
      if (url1 && url2) {
        mediaType = isVideoUrl(url1) && isVideoUrl(url2) ? 'video_dual' : 'dual';
      } else if (url1) {
        mediaType = isVideoUrl(url1) ? 'video' : 'single';
      } else if (post.option_a_image_url && post.option_b_image_url) {
        mediaType = 'dual';
        url1 = post.option_a_image_url;
        url2 = post.option_b_image_url;
      } else if (post.option_a_image_url) {
        mediaType = 'single';
        url1 = post.option_a_image_url;
      }
    }

    if (mediaType === 'dual' && url1 && url2 && isVideoUrl(url1) && isVideoUrl(url2)) {
      mediaType = 'video_dual';
    }

    if (mediaType === 'video' && url1) {
      return {
        mediaType: 'video',
        url1,
        url2: '',
        layout,
        videoA: resolveVideoForEmbed(parseVideo(url1)),
        videoB: null,
      };
    }

    if (mediaType === 'video_dual' && url1 && url2) {
      return {
        mediaType: 'video_dual',
        url1,
        url2,
        layout,
        videoA: resolveVideoForEmbed(parseVideo(url1)),
        videoB: resolveVideoForEmbed(parseVideo(url2)),
      };
    }

    return { mediaType, url1, url2, layout, videoA: null, videoB: null };
  }

  function renderVideoIframe(video, title) {
    const v = resolveVideoForEmbed(video);
    const wrapClass = embedWrapClassList(v);

    if (v?.provider === 'youtube' && v.videoId) {
      const embedSrc =
        window.PickleMedia?.buildYouTubeEmbedUrl(v.videoId) ||
        `https://www.youtube.com/embed/${v.videoId}`;
      return `
        <div class="${wrapClass}">
          <iframe
            class="video-iframe"
            src="${escapeHtml(embedSrc)}"
            title="${escapeHtml(title || 'YouTube 영상')}"
            allow="${IFRAME_ALLOW}"
            allowfullscreen
            frameborder="0"
            loading="lazy"
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>
        </div>
      `;
    }

    if (v?.provider === 'tiktok' && v.embedUrl) {
      return `
        <div class="${wrapClass}">
          <iframe
            class="video-iframe"
            src="${escapeHtml(v.embedUrl)}"
            title="${escapeHtml(title || 'TikTok 영상')}"
            allow="${IFRAME_ALLOW}"
            allowfullscreen
            frameborder="0"
            loading="lazy"
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>
        </div>
      `;
    }

    return `
      <div class="video-cell-fallback" role="status">
        <p class="video-fallback-msg">앱 내 재생을 지원하지 않는 링크입니다.</p>
        <span class="video-fallback-hint">URL을 youtube.com / youtu.be 형식으로 등록해 주세요.</span>
      </div>
    `;
  }

  /** 좌우/상하 + 숏폼·가로 조합에 따른 컨테이너 클래스 */
  function resolveDualVideoShellClass(m) {
    const va = resolveVideoForEmbed(m.videoA);
    const vb = resolveVideoForEmbed(m.videoB);
    const aP = isPortraitVideo(va);
    const bP = isPortraitVideo(vb);
    const vertical = m.layout === 'vertical';

    const base = 'poll-media poll-media--video-dual';

    if (!vertical && aP && bP) {
      return `${base} shorts-split-layout`;
    }
    if (!vertical && !aP && !bP) {
      return `${base} landscape-split-layout`;
    }
    if (vertical && aP && bP) {
      return `${base} shorts-stack-layout`;
    }
    if (vertical) {
      return `${base} landscape-stack-layout`;
    }
    return `${base} mixed-split-layout`;
  }

  function renderSingleVideo(video, title) {
    const v = resolveVideoForEmbed(video);
    const portrait = isPortraitVideo(v);
    return `
      <div class="poll-media poll-media--video poll-media--video-single${portrait ? ' is-portrait-single' : ' is-landscape-single'}" data-provider="${escapeHtml(v?.provider || 'unknown')}" data-format="${escapeHtml(v?.format || 'landscape')}">
        ${renderVideoIframe(v, title || '동영상')}
      </div>
    `;
  }

  function renderDualVideo(m, nameA, nameB) {
    const shellClass = resolveDualVideoShellClass(m);
    const labelA = nameA || 'A';
    const labelB = nameB || 'B';
    const va = resolveVideoForEmbed(m.videoA);
    const vb = resolveVideoForEmbed(m.videoB);

    return `
      <div class="${shellClass}" data-layout="${escapeHtml(m.layout === 'vertical' ? 'stack' : 'split')}">
        <div class="media-split media-split-a media-split--video${isPortraitVideo(va) ? ' is-short-form' : ' is-landscape'}">
          <span class="media-tag media-tag-a">A</span>
          <span class="media-name">${escapeHtml(labelA)}</span>
          ${renderVideoIframe(m.videoA, labelA + ' 동영상')}
        </div>
        <div class="media-vs-divider" aria-hidden="true">VS</div>
        <div class="media-split media-split-b media-split--video${isPortraitVideo(vb) ? ' is-short-form' : ' is-landscape'}">
          <span class="media-tag media-tag-b">B</span>
          <span class="media-name">${escapeHtml(labelB)}</span>
          ${renderVideoIframe(m.videoB, labelB + ' 동영상')}
        </div>
      </div>
    `;
  }

  function renderSingleMedia(url, alt) {
    return `
      <div class="poll-media poll-media--single">
        <img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">
      </div>
    `;
  }

  function renderDualMedia(url1, url2, layout, nameA, nameB) {
    const mod = layout === 'vertical' ? 'poll-media--dual-v' : 'poll-media--dual-h';
    return `
      <div class="poll-media ${mod}">
        <div class="media-split media-split-a">
          <img src="${escapeHtml(url1)}" alt="${escapeHtml(nameA)}" loading="lazy" decoding="async">
          <span class="media-tag media-tag-a">A</span>
          <span class="media-name">${escapeHtml(nameA)}</span>
        </div>
        <div class="media-split media-split-b">
          <img src="${escapeHtml(url2)}" alt="${escapeHtml(nameB)}" loading="lazy" decoding="async">
          <span class="media-tag media-tag-b">B</span>
          <span class="media-name">${escapeHtml(nameB)}</span>
        </div>
      </div>
    `;
  }

  function renderPostMediaBlock(post) {
    const m = normalizePostMedia(post);

    if (m.mediaType === 'video' && m.url1) {
      const video = m.videoA || resolveVideoForEmbed(parseVideo(m.url1));
      return renderSingleVideo(video, post.title);
    }

    if (m.mediaType === 'video_dual' && m.url1 && m.url2) {
      return renderDualVideo(m, post.option_a_name, post.option_b_name);
    }

    if (m.mediaType === 'single' && m.url1 && isImageUrl(m.url1)) {
      return renderSingleMedia(m.url1, post.title || '불판 이미지');
    }

    if (m.mediaType === 'dual' && m.url1 && m.url2) {
      return renderDualMedia(m.url1, m.url2, m.layout, post.option_a_name, post.option_b_name);
    }

    return '';
  }

  function hasPostMedia(post) {
    return Boolean(renderPostMediaBlock(post));
  }

  window.PickleFeedMedia = {
    normalizePostMedia,
    renderPostMediaBlock,
    hasPostMedia,
    resolveVideoForEmbed,
  };
})();
