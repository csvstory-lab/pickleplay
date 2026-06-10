/**
 * P!CKLE — create.html 불판 등록 (Supabase posts)
 */
(function () {
  'use strict';

  /** UI 칩 라벨 → posts.category (CHECK: hot|brand|love|brain|ugc|other) */
  var CATEGORY_MAP = {
    '💖 연애/과몰입': 'love',
    '⚖️ 뇌정지 밸런스': 'brain',
    '🧠 MBTI/심리': 'brain',
    '🤝 브랜드': 'brand',
    '🔥 HOT': 'hot',
  };

  function getClient() {
    if (!window.PickleSupabase?.getClient) {
      throw new Error('Supabase 클라이언트를 불러오지 못했습니다.');
    }
    return window.PickleSupabase.getClient();
  }

  function resolveCategorySlug(chipLabel) {
    var label = String(chipLabel || '').trim();
    return CATEGORY_MAP[label] || 'ugc';
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
    return {
      categoryLabel: selectedCategory ? selectedCategory.textContent.trim() : '',
      categorySlug: selectedCategory
        ? resolveCategorySlug(selectedCategory.textContent.trim())
        : '',
      title: document.getElementById('inputTitle')?.value.trim() || '',
      description: document.getElementById('inputDesc')?.value.trim() || '',
      optionA: document.getElementById('inputA')?.value.trim() || '',
      optionB: document.getElementById('inputB')?.value.trim() || '',
      hashtags: document.getElementById('inputHashtag')?.value.trim() || '',
    };
  }

  function buildPostsInsertPayload(user, formData, mediaFields) {
    var payload = {
      author_id: user.id,
      title: formData.title,
      category: formData.categorySlug,
      option_a_name: formData.optionA,
      option_b_name: formData.optionB,
      is_sponsor: false,
      visibility_status: 'visible',
    };

    Object.assign(payload, mediaFields);

    Object.keys(payload).forEach(function (key) {
      if (payload[key] === null || payload[key] === undefined || payload[key] === '') {
        delete payload[key];
      }
    });

    return payload;
  }

  function goLogin() {
    window.location.href = 'login.html?redirect=create.html&from=create';
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

    return true;
  }

  /** @returns {boolean} true면 호출측에서 추가 alert 불필요 */
  function handleInsertError(err) {
    var msg = String(err?.message || err || '').toLowerCase();
    var code = String(err?.code || '');

    var missingColumn =
      (msg.indexOf('title') !== -1 && msg.indexOf('column') !== -1) ||
      (msg.indexOf('media_type') !== -1 && msg.indexOf('column') !== -1) ||
      msg.indexOf("could not find the 'title'") !== -1 ||
      msg.indexOf("could not find the 'media_type'") !== -1;

    if (missingColumn) {
      alert('SQL 마이그레이션이 필요합니다. (title 또는 media_type 컬럼 누락)');
      return true;
    }

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

  /**
   * @param {function(string): Promise<object>} buildMediaPayload — create.html 미디어 업로드
   */
  async function submitPost(buildMediaPayload) {
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
    if (!formData.categoryLabel) {
      alert('"어느 전장으로 갈까요?"를 선택해주세요.');
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

    var rawMedia = await buildMediaPayload(user.id);
    var mediaFields = mapMediaForPosts(rawMedia);
    var payload = buildPostsInsertPayload(user, formData, mediaFields);

    var insertResult = await sb.from('posts').insert([payload]).select('id').single();
    if (insertResult.error) {
      if (handleInsertError(insertResult.error)) {
        return { cancelled: true };
      }
      throw insertResult.error;
    }

    alert('🔥 새로운 불판을 지폈습니다! 불타는 참전을 기대하세요.');
    window.location.href = 'index.html';
    return { ok: true, id: insertResult.data?.id };
  }

  window.PickleCreatePage = {
    submitPost: submitPost,
    mapMediaForPosts: mapMediaForPosts,
    resolveCategorySlug: resolveCategorySlug,
    handleInsertError: handleInsertError,
    validateCustomEndDate: validateCustomEndDate,
  };
})();
