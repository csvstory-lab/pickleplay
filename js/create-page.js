/**
 * P!CKLE — create.html 불판 등록 (Supabase posts)
 *
 * DB 마이그레이션 (thumbnail_url):
 *   supabase/11_posts_thumbnail_url.sql 실행
 *   ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
 */
(function () {
  'use strict';

  function resolveCategorySlug(chipLabel) {
    var label = String(chipLabel || '').trim();
    if (window.PickleCategories && window.PickleCategories.resolveCategorySlugFromLabel) {
      return window.PickleCategories.resolveCategorySlugFromLabel(label) || '';
    }
    return '';
  }

  function getClient() {
    if (!window.PickleSupabase?.getClient) {
      throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
    }
    return window.PickleSupabase.getClient();
  }

  function emptyMedia() {
    return {
      media_type: 'none',
      media_url_1: null,
      media_url_2: null,
      layout_style: null,
      option_a_image_url: null,
      option_b_image_url: null,
    };
  }

  function normalizeVideoUrl(raw) {
    var trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    if (window.PickleMedia?.parseVideoUrl) {
      var parsed = window.PickleMedia.parseVideoUrl(trimmed);
      return parsed.rawUrl || trimmed;
    }
    return trimmed;
  }

  function assertVideoUrl(raw, label) {
    if (!window.PickleMedia?.isValidVideoUrl(raw)) {
      throw new Error(
        label + ': 유튜브 또는 틱톡 동영상 URL만 입력할 수 있습니다.'
      );
    }
    return normalizeVideoUrl(raw);
  }

  /** create.html buildMediaPayload 결과 → posts 테이블 컬럼 */
  function mapMediaForPosts(mediaFields) {
    if (!mediaFields || mediaFields.media_mode === 'text') {
      return emptyMedia();
    }

    var layout =
      mediaFields.media_orientation === 'vertical' ? 'vertical' : 'horizontal';
    var url1 = mediaFields.media_url_1 || null;
    var url2 = mediaFields.media_url_2 || null;

    if (mediaFields.media_mode === 'single') {
      if (url1 && window.PickleMedia?.isValidVideoUrl?.(url1)) {
        return {
          media_type: 'video',
          media_url_1: assertVideoUrl(url1, '영상 URL'),
          media_url_2: null,
          layout_style: null,
          option_a_image_url: null,
          option_b_image_url: null,
        };
      }
      return {
        media_type: 'single',
        media_url_1: url1,
        media_url_2: null,
        layout_style: null,
        option_a_image_url: null,
        option_b_image_url: null,
      };
    }

    if (mediaFields.media_mode === 'vs') {
      var videoA = url1 && window.PickleMedia?.isValidVideoUrl?.(url1);
      var videoB = url2 && window.PickleMedia?.isValidVideoUrl?.(url2);

      if (videoA || videoB) {
        return {
          media_type: 'video_dual',
          media_url_1: url1 ? assertVideoUrl(url1, 'A 영상 URL') : null,
          media_url_2: url2 ? assertVideoUrl(url2, 'B 영상 URL') : null,
          layout_style: layout,
          option_a_image_url: null,
          option_b_image_url: null,
        };
      }

      return {
        media_type: 'dual',
        media_url_1: url1,
        media_url_2: url2,
        layout_style: layout,
        option_a_image_url: url1,
        option_b_image_url: url2,
      };
    }

    return emptyMedia();
  }

  function collectFormData() {
    var selectedCategory = document.querySelector('.cat-chip.selected');
    var layoutEl = document.querySelector('input[name="media_layout"]:checked');
    var mediaLayout =
      layoutEl && layoutEl.value === 'vertical' ? 'vertical' : 'horizontal';

    var categorySlug = '';
    var categoryLabel = '';
    if (selectedCategory) {
      categorySlug = (selectedCategory.getAttribute('data-category-slug') || '').trim();
      categoryLabel = (
        selectedCategory.getAttribute('data-category-label') ||
        selectedCategory.textContent ||
        ''
      ).trim();
      if (!categorySlug && categoryLabel) {
        categorySlug = resolveCategorySlug(categoryLabel);
      }
    }

    return {
      categoryLabel: categoryLabel,
      categorySlug: categorySlug,
      title: document.getElementById('inputTitle')?.value.trim() || '',
      description: document.getElementById('inputDesc')?.value.trim() || '',
      optionA: document.getElementById('inputA')?.value.trim() || '',
      optionB: document.getElementById('inputB')?.value.trim() || '',
      hashtags: document.getElementById('inputHashtag')?.value.trim() || '',
      mediaLayout: mediaLayout,
    };
  }

  /**
   * 로그인 유저 메타데이터 → posts.author_nickname / author_avatar_html
   */
  function extractAuthorSnapshot(user) {
    var meta = (user && user.user_metadata) || {};
    var nickname = meta.nickname ? String(meta.nickname).trim() : '';

    if (!nickname && user && user.email) {
      nickname = String(user.email).split('@')[0] || '';
    }
    if (!nickname) {
      nickname = '픽클러';
    }

    var avatarHtml = '';
    if (meta.avatar_html && String(meta.avatar_html).trim()) {
      avatarHtml = String(meta.avatar_html).trim();
    } else if (meta.avatar_emoji && String(meta.avatar_emoji).trim()) {
      avatarHtml = String(meta.avatar_emoji).trim();
    } else {
      var avatarUrl = meta.avatar_url || meta.picture || meta.avatar || '';
      if (avatarUrl) {
        avatarHtml =
          '<img src="' +
          String(avatarUrl).replace(/"/g, '&quot;') +
          '" alt="">';
      } else {
        avatarHtml = '🥒';
      }
    }

    return {
      author_nickname: nickname,
      author_avatar_html: avatarHtml,
    };
  }

  function normalizeThumbnailUrlForDb(value) {
    try {
      if (value == null) return null;
      var trimmed = String(value).trim();
      return trimmed || null;
    } catch (_) {
      return null;
    }
  }

  function resolveExpiresAtFields() {
    var getDuration = window.getPickleCreateDuration;
    var durationKey = getDuration ? getDuration() : '24h';
    var now = new Date();
    var expiresAt = null;

    if (durationKey === 'custom') {
      var endInput = document.getElementById('inputEndDate');
      var endVal = endInput && endInput.value ? String(endInput.value).trim() : '';
      var endDate = endVal ? new Date(endVal) : null;
      expiresAt =
        endDate && !Number.isNaN(endDate.getTime()) ? endDate.toISOString() : null;
    } else {
      var dayMs = 24 * 60 * 60 * 1000;
      var addMs = dayMs;
      if (durationKey === '3') {
        addMs = 3 * dayMs;
      } else if (durationKey === '7') {
        addMs = 7 * dayMs;
      }
      expiresAt = new Date(now.getTime() + addMs).toISOString();
    }

    return { expires_at: expiresAt };
  }

  function buildPostsInsertPayload(user, formData, mediaFields, thumbnailUrl) {
    var payload = {
      author_id: user.id,
      title: formData.title,
      category: formData.categorySlug,
      option_a_name: formData.optionA,
      option_b_name: formData.optionB,
      is_sponsor: false,
      visibility_status: 'visible',
    };

    Object.assign(payload, extractAuthorSnapshot(user));
    Object.assign(payload, mediaFields);

    if (formData.hashtags) {
      payload.tags = formData.hashtags;
    }

    if (formData.description) {
      payload.description = formData.description;
    }

    if (formData.mediaLayout) {
      payload.media_layout = formData.mediaLayout;
    }

    var scheduleFields = resolveExpiresAtFields();
    Object.assign(payload, scheduleFields);

    Object.keys(payload).forEach(function (key) {
      if (key === 'thumbnail_url' || key === 'expires_at') return;
      if (payload[key] === null || payload[key] === undefined || payload[key] === '') {
        delete payload[key];
      }
    });

    var safeThumb = normalizeThumbnailUrlForDb(thumbnailUrl);
    if (safeThumb) {
      payload.thumbnail_url = safeThumb;
    }

    if (scheduleFields.expires_at) {
      payload.expires_at = scheduleFields.expires_at;
    }

    return payload;
  }

  function goLogin() {
    window.location.href = 'login.html?redirect=create.html&from=create';
  }

  function getMaxCustomEndDate() {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  function validateCustomEndDate() {
    var getDuration = window.getPickleCreateDuration;
    if (!getDuration || getDuration() !== 'custom') {
      return true;
    }

    var endInput = document.getElementById('inputEndDate');
    var endVal = endInput?.value?.trim();
    if (!endVal) {
      alert('마감 일시를 선택해 주세요.');
      return false;
    }

    var end = new Date(endVal);
    if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) {
      alert('마감 일시는 현재 시간 이후로만 설정할 수 있습니다.');
      return false;
    }

    if (end.getTime() > getMaxCustomEndDate().getTime()) {
      alert('불판 마감일은 최대 7일 이내로만 설정할 수 있습니다.');
      if (endInput) endInput.value = '';
      return false;
    }

    return true;
  }

  /** @returns {boolean} true면 호출측에서 추가 alert 불필요 */
  function handleInsertError(err) {
    var msg = String(err?.message || err || '').toLowerCase();
    var code = String(err?.code || '');

    var fkError =
      msg.indexOf('author_id') !== -1 ||
      msg.indexOf('foreign key') !== -1 ||
      msg.indexOf('violates foreign key') !== -1 ||
      code === '23503';

    if (fkError) {
      alert('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
      goLogin();
      return true;
    }

    return false;
  }

  async function uploadThumbnailIfAny(userId, getThumbnailFile) {
    var file = resolveThumbnailFile(getThumbnailFile);
    if (!file) {
      console.info('[P!CKLE Create] 썸네일 파일 없음 — thumbnail_url 생략');
      return null;
    }

    console.info('[P!CKLE Create] 썸네일 업로드 시작', {
      name: file.name,
      size: file.size,
      type: file.type,
    });

    if (!window.PickleMedia?.uploadPostImage) {
      throw new Error('이미지 업로드 모듈을 불러오지 못했습니다.');
    }

    var url = await window.PickleMedia.uploadPostImage(file, userId, { aspectRatio: 16 / 9 });
    if (!url || !String(url).trim()) {
      throw new Error('썸네일 업로드는 완료됐지만 URL을 받지 못했습니다.');
    }

    var trimmed = String(url).trim();
    console.info('[P!CKLE Create] 썸네일 Storage 업로드 완료 →', trimmed);
    return trimmed;
  }

  function resolveThumbnailFile(getThumbnailFile) {
    if (typeof getThumbnailFile === 'function') {
      var fromCallback = getThumbnailFile();
      if (fromCallback) return fromCallback;
    }
    if (typeof window.getPickleCreateThumbnailFile === 'function') {
      var fromGlobal = window.getPickleCreateThumbnailFile();
      if (fromGlobal) return fromGlobal;
    }
    var input =
      document.getElementById('thumbnailInput') ||
      document.getElementById('fileThumbnail');
    if (input && input.files && input.files[0]) {
      return input.files[0];
    }
    return null;
  }

  /**
   * @param {function(string): Promise<object>} buildMediaPayload — create.html 미디어 업로드
   * @param {function(): File|null} [getThumbnailFile] — 리스트 썸네일 (선택)
   * @param {string|null} [preloadedThumbnailUrl] — create.html에서 선업로드한 URL
   */
  async function submitPost(buildMediaPayload, getThumbnailFile, preloadedThumbnailUrl) {
    if (window.PickleAuth?.init) {
      await window.PickleAuth.init();
    }

    var sb = getClient();
    var authResult = await sb.auth.getUser();
    if (authResult.error) {
      throw authResult.error;
    }

    var user = authResult.data?.user;
    if (!user) {
      alert('로그인 후 불판을 지필 수 있습니다.');
      goLogin();
      return { cancelled: true };
    }

    var formData = collectFormData();
    if (!formData.categoryLabel || !formData.categorySlug) {
      alert('"어느 전장으로 갈까요?"를 선택해주세요.');
      return { cancelled: true };
    }
    if (
      window.PickleCategories &&
      !window.PickleCategories.isValidCategorySlug(formData.categorySlug)
    ) {
      alert('유효한 카테고리를 선택해 주세요.');
      return { cancelled: true };
    }
    if (!formData.title) {
      alert('불판 제목을 입력해주세요!');
      return { cancelled: true };
    }
    if (formData.title.length < 2) {
      alert('불판 제목은 2자 이상 입력해 주세요.');
      return { cancelled: true };
    }
    if (!formData.optionA || !formData.optionB) {
      alert('A/B 선택지 내용을 완성해주세요!');
      return { cancelled: true };
    }
    if (formData.optionA === formData.optionB) {
      alert('A와 B 선택지는 서로 달라야 합니다!');
      return { cancelled: true };
    }
    if (!validateCustomEndDate()) {
      return { cancelled: true };
    }

    var thumbnailUrl = null;
    if (typeof preloadedThumbnailUrl !== 'undefined') {
      thumbnailUrl = normalizeThumbnailUrlForDb(preloadedThumbnailUrl);
    } else {
      thumbnailUrl = await uploadThumbnailIfAny(user.id, getThumbnailFile);
      thumbnailUrl = normalizeThumbnailUrlForDb(thumbnailUrl);
    }

    var rawMedia = await buildMediaPayload(user.id);
    var mediaFields = mapMediaForPosts(rawMedia);
    var payload = buildPostsInsertPayload(user, formData, mediaFields, thumbnailUrl);

    if (thumbnailUrl) {
      payload.thumbnail_url = thumbnailUrl;
    }

    var insertResult = await sb
      .from('posts')
      .insert([payload])
      .select('id, thumbnail_url')
      .single();
    if (insertResult.error) {
      console.error('[P!CKLE Create] posts.insert 실패', insertResult.error);
      alert('DB 저장 에러: ' + (insertResult.error.message || String(insertResult.error)));
      if (handleInsertError(insertResult.error)) {
        return { cancelled: true };
      }
      throw insertResult.error;
    }

    console.info('[P!CKLE Create] DB 저장 완료', {
      id: insertResult.data && insertResult.data.id,
      thumbnail_url: insertResult.data && insertResult.data.thumbnail_url,
    });

    return { ok: true, id: insertResult.data?.id, thumbnail_url: insertResult.data?.thumbnail_url };
  }

  window.PickleCreatePage = {
    submitPost: submitPost,
    mapMediaForPosts: mapMediaForPosts,
    resolveCategorySlug: resolveCategorySlug,
    handleInsertError: handleInsertError,
    validateCustomEndDate: validateCustomEndDate,
  };
})();
