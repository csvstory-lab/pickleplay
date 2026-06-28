/**
 * P!CKLE — 공유 이미지 URL 해석 (카카오 · OG 공통)
 */
(function () {
  'use strict';

  function resolveAbsoluteImageUrl(url) {
    if (!url) return '';
    var u = String(url).trim();
    if (!u) return '';
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (/^http:\/\//i.test(u)) return 'https://' + u.slice(7);
    if (/^https:\/\//i.test(u)) return u;
    if (u.indexOf('/') === 0) {
      return (window.location && window.location.origin
        ? window.location.origin
        : '') + u;
    }
    return u;
  }

  function getDefaultOgImageUrl() {
    if (window.PickleSystemSettings && window.PickleSystemSettings.getGeneralConfig) {
      var cfg = window.PickleSystemSettings.getGeneralConfig();
      var fromDb = resolveAbsoluteImageUrl(cfg && cfg.og_image_url);
      if (fromDb) return fromDb;
    }
    if (window.PICKLE_OG_DEFAULTS && window.PICKLE_OG_DEFAULTS.imageUrl) {
      return String(window.PICKLE_OG_DEFAULTS.imageUrl);
    }
    return '';
  }

  function resolvePostShareImageUrl(post) {
    var candidates = [
      post && post.thumbnail_url,
      post && post.media_url_1,
      post && post.media_url_2,
      post && post.option_a_image_url,
      post && post.option_b_image_url,
    ];
    var i;
    for (i = 0; i < candidates.length; i++) {
      var abs = resolveAbsoluteImageUrl(candidates[i]);
      if (abs) return abs;
    }
    return getDefaultOgImageUrl();
  }

  function buildPostSharePayload(post) {
    var title = post && post.title ? 'P!CKLE - ' + post.title : 'P!CKLE - 불판';
    var text =
      post && (post.option_a || post.option_b)
        ? (post.option_a || '') + ' vs ' + (post.option_b || '') + '. 지금 투표하세요!'
        : '지금 투표하세요!';
    return {
      title: title,
      text: text,
      imageUrl: resolvePostShareImageUrl(post),
    };
  }

  window.PickleShare = {
    resolveAbsoluteImageUrl: resolveAbsoluteImageUrl,
    getDefaultOgImageUrl: getDefaultOgImageUrl,
    resolvePostShareImageUrl: resolvePostShareImageUrl,
    buildPostSharePayload: buildPostSharePayload,
  };
})();
