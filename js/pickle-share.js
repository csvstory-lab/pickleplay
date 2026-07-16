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

  function getSupabaseProjectUrl() {
    if (window.PickleSupabase && window.PickleSupabase.getProjectUrl) {
      var projectUrl =
        typeof window.PickleSupabase.getProjectUrl === 'function'
          ? window.PickleSupabase.getProjectUrl()
          : window.PickleSupabase.getProjectUrl;
      return String(projectUrl || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
    }
    if (window.PICKLE_SUPABASE_CONFIG && window.PICKLE_SUPABASE_CONFIG.url) {
      return String(window.PICKLE_SUPABASE_CONFIG.url).replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
    }
    return 'https://jszgznanptutwxcsnrep.supabase.co';
  }

  function buildDynamicPostOgImageUrl(postOrId) {
    var postId = typeof postOrId === 'string' ? postOrId : postOrId && postOrId.id;
    if (!postId) return '';
    return (
      getSupabaseProjectUrl() +
      '/functions/v1/generate-og?postId=' +
      encodeURIComponent(String(postId))
    );
  }

  function resolvePostShareImageUrl(post) {
    var dynamicOgUrl = buildDynamicPostOgImageUrl(post);
    if (dynamicOgUrl) return dynamicOgUrl;

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

  var SITE_ORIGIN = 'https://pickleplay.kr';

  // 유저에게 보여주고 복사/공유되는 링크는 항상 이 "실제 웹 브라우저 주소"여야 한다.
  // (Edge Function 주소는 카톡/SNS 크롤러 봇 전용이라 그대로 노출되면 안 된다.)
  function buildCanonicalPostUrl(postId) {
    if (postId) {
      return SITE_ORIGIN + '/user_app/detail.html?id=' + encodeURIComponent(String(postId));
    }
    return (window.location && window.location.href) || SITE_ORIGIN;
  }

  function fetchShareImageFile(imageUrl) {
    if (!imageUrl) return Promise.resolve(null);
    return fetch(imageUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('image_fetch_failed');
        return res.blob();
      })
      .then(function (blob) {
        return new File([blob], 'pickle_share.png', { type: blob.type || 'image/png' });
      })
      .catch(function (err) {
        console.warn('[P!CKLE] 공유 이미지 준비 실패, 텍스트/링크만 공유합니다.', err);
        return null;
      });
  }

  // OS Web Share API 공유. 이미지를 파일로 첨부할 수 있으면 title+text(제목+URL 결합)로,
  // 없거나 지원하지 않으면 title+text(제목만)+url로 안전하게 폴백한다.
  function shareNative(payload) {
    var title = (payload && payload.title) || 'P!CKLE - 불판';
    var url = (payload && payload.url) || buildCanonicalPostUrl();
    var imageUrl = payload && payload.imageUrl;
    var text = title + '\n\n' + url;

    if (!navigator.share) {
      return Promise.reject(new Error('web_share_unsupported'));
    }

    return fetchShareImageFile(imageUrl).then(function (imageFile) {
      if (imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
        return navigator.share({
          files: [imageFile], // 썸네일 이미지 첨부
          title: title,
          text: text, // 텍스트 안에 URL을 합쳐서 전송 (파일 첨부 시 url 무시하는 앱 방어)
        });
      }
      return navigator.share({
        title: title,
        text: title,
        url: url,
      });
    });
  }

  window.PickleShare = {
    resolveAbsoluteImageUrl: resolveAbsoluteImageUrl,
    getDefaultOgImageUrl: getDefaultOgImageUrl,
    buildDynamicPostOgImageUrl: buildDynamicPostOgImageUrl,
    resolvePostShareImageUrl: resolvePostShareImageUrl,
    buildPostSharePayload: buildPostSharePayload,
    buildCanonicalPostUrl: buildCanonicalPostUrl,
    shareNative: shareNative,
  };
})();
