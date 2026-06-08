/**
 * P!CKLE — post_media Storage · 유튜브/틱톡 URL → embed 변환
 */
(function () {
  'use strict';

  const BUCKET = 'post_media';
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  /** YouTube 동영상 ID (11자) 추출용 정규식 */
  const YT_ID_PATTERNS = [
    /(?:youtube\.com\/watch\?(?:[^#]*&)*v=|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/i,
    /youtu\.be\/([a-zA-Z0-9_-]{11})(?:[?#]|$)/i,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:[?#]|\/|$)/i,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:[?#]|\/|$)/i,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})(?:[?#]|\/|$)/i,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})(?:[?#]|\/|$)/i,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  function isYouTubeHost(hostname) {
    const h = String(hostname || '').toLowerCase().replace(/^www\./, '');
    return h === 'youtu.be' || h.includes('youtube.com') || h.includes('youtube-nocookie.com');
  }

  function isTikTokHost(hostname) {
    const h = String(hostname || '').toLowerCase().replace(/^www\./, '');
    return h.includes('tiktok.com');
  }

  function sanitizeExt(filename) {
    const m = String(filename || '').match(/\.([a-zA-Z0-9]+)$/);
    const ext = (m && m[1] || 'jpg').toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  }

  function validateImageFile(file) {
    if (!file) throw new Error('파일이 없습니다.');
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error('JPG, PNG, WEBP, GIF 이미지만 업로드할 수 있습니다.');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error('이미지는 장당 5MB 이하만 가능합니다.');
    }
  }

  async function uploadPostImage(file, userId) {
    validateImageFile(file);
    const sb = window.PickleSupabase.getClient();
    const ext = sanitizeExt(file.name);
    const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { error } = await sb.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

    if (error) {
      if (error.message && /bucket/i.test(error.message)) {
        throw new Error(
          'post_media 버킷이 없습니다. Supabase 대시보드에서 버킷을 만든 뒤 09_storage SQL을 실행해 주세요.'
        );
      }
      throw error;
    }

    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  function normalizeRawUrl(raw) {
    let url = String(raw || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    return url;
  }

  /**
   * 일반 링크·짧은 URL·embed URL 모두에서 11자 ID만 추출
   */
  function extractYouTubeId(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;

    for (let i = 0; i < YT_ID_PATTERNS.length; i++) {
      const m = raw.match(YT_ID_PATTERNS[i]);
      if (m && m[1]) return m[1];
    }

    try {
      const u = new URL(normalizeRawUrl(raw));
      if (!isYouTubeHost(u.hostname)) return null;

      if (u.hostname.includes('youtu.be')) {
        const id = u.pathname.replace(/^\//, '').split(/[/?#]/)[0];
        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }

      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      const pathMatch = u.pathname.match(/\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})/i);
      if (pathMatch) return pathMatch[1];
    } catch (_) {
      /* ignore */
    }

    return null;
  }

  /**
   * 재생 전용 embed URL (항상 www.youtube.com/embed/ID)
   */
  function buildYouTubeEmbedUrl(videoId) {
    const id = extractYouTubeId(videoId) || (typeof videoId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null);
    if (!id) return '';

    const params = new URLSearchParams({
      rel: '0',
      playsinline: '1',
      modestbranding: '1',
      iv_load_policy: '3',
      enablejsapi: '1',
    });

    if (typeof window !== 'undefined' && window.location?.origin) {
      const origin = window.location.origin;
      if (origin && origin !== 'null' && !/^file:/i.test(origin)) {
        params.set('origin', origin);
      }
    }

    return `https://www.youtube.com/embed/${id}?${params.toString()}`;
  }

  function parseTikTokId(url) {
    try {
      const u = new URL(url);
      if (!isTikTokHost(u.hostname)) return null;

      const videoMatch = u.pathname.match(/\/video\/(\d+)/);
      if (videoMatch) return videoMatch[1];

      return null;
    } catch (_) {
      return null;
    }
  }

  function buildTikTokEmbedUrl(videoId) {
    if (!videoId) return '';
    return `https://www.tiktok.com/embed/v2/${videoId}`;
  }

  /** 유튜브 쇼츠·틱톡 등 세로 숏폼 URL 여부 */
  function detectVideoFormat(raw, provider) {
    const s = String(raw || '').toLowerCase();
    if (provider === 'tiktok') return 'portrait';
    if (provider === 'youtube') {
      if (/\/shorts\//i.test(s) || /[?&]shorts=1/i.test(s)) return 'portrait';
      return 'landscape';
    }
    return 'landscape';
  }

  /**
   * @returns {{ provider, embedUrl, thumbnailUrl, rawUrl, videoId?, format: 'portrait'|'landscape' }}
   */
  function parseVideoUrl(raw) {
    const rawUrl = normalizeRawUrl(raw);
    const source = rawUrl || String(raw || '').trim();
    if (!source) {
      return { provider: null, embedUrl: '', thumbnailUrl: '', rawUrl: '', format: 'landscape' };
    }

    const ytId = extractYouTubeId(source);
    if (ytId) {
      const embedUrl = buildYouTubeEmbedUrl(ytId);
      const format = detectVideoFormat(source, 'youtube');
      return {
        provider: 'youtube',
        embedUrl,
        thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
        rawUrl: rawUrl || raw,
        videoId: ytId,
        format,
        isShortForm: format === 'portrait',
      };
    }

    const tt = parseTikTokId(rawUrl || source);
    if (tt) {
      return {
        provider: 'tiktok',
        embedUrl: buildTikTokEmbedUrl(tt),
        thumbnailUrl: '',
        rawUrl: rawUrl || source,
        videoId: tt,
        format: 'portrait',
        isShortForm: true,
      };
    }

    return {
      provider: null,
      embedUrl: '',
      thumbnailUrl: '',
      rawUrl: rawUrl || String(raw),
      format: 'landscape',
    };
  }

  /** DB에 저장된 URL이 watch 링크여도 항상 embed URL 반환 */
  function resolveEmbedUrl(storedUrl) {
    const parsed = parseVideoUrl(storedUrl);
    return parsed.embedUrl || '';
  }

  function isValidVideoUrl(raw) {
    return Boolean(parseVideoUrl(raw).provider);
  }

  function looksLikeImageUrl(url) {
    const u = String(url || '').toLowerCase();
    if (!u) return false;
    if (/\/storage\/v1\/object\/public\/post_media\//i.test(u)) return true;
    if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(u)) return true;
    return false;
  }

  function isEmbeddableVideoUrl(url) {
    return isValidVideoUrl(url);
  }

  window.PickleMedia = {
    BUCKET,
    uploadPostImage,
    extractYouTubeId,
    buildYouTubeEmbedUrl,
    detectVideoFormat,
    parseVideoUrl,
    resolveEmbedUrl,
    isValidVideoUrl,
    isEmbeddableVideoUrl,
    looksLikeImageUrl,
    validateImageFile,
    MAX_IMAGE_BYTES,
  };
})();
