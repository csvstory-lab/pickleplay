/**
 * P!CKLE — 새 불판 작성 (이미지 Storage · 동영상 URL A/B)
 */
(function () {
  'use strict';

  const state = {
    mode: 'images',
    layout: 'horizontal',
    files: [null, null],
    objectUrls: [null, null],
  };

  function $(id) {
    return document.getElementById(id);
  }

  function showMessage(text, isError) {
    const el = $('createMessage');
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.className = 'form-message' + (isError ? ' error' : ' success');
  }

  function requireLogin() {
    alert('불판을 만들려면 로그인이 필요합니다');
    if (window.PickleAuth?.goToLogin) {
      window.PickleAuth.goToLogin({ redirect: 'create.html', from: 'create' });
    } else {
      window.location.href = 'login.html?redirect=create.html&from=create';
    }
  }

  function revokeObjectUrl(index) {
    if (state.objectUrls[index]) {
      URL.revokeObjectURL(state.objectUrls[index]);
      state.objectUrls[index] = null;
    }
  }

  function updateSlotUI(slotIndex) {
    const i = slotIndex - 1;
    const file = state.files[i];
    const img = $('previewImg' + slotIndex);
    const ph = $('ph' + slotIndex);
    const label = $('slotLabel' + slotIndex);
    const clearBtn = document.querySelector('.btn-clear-img[data-slot="' + slotIndex + '"]');

    revokeObjectUrl(i);

    if (file) {
      const url = URL.createObjectURL(file);
      state.objectUrls[i] = url;
      img.src = url;
      img.hidden = false;
      ph.hidden = true;
      label.classList.add('has-image');
      if (clearBtn) clearBtn.hidden = false;
    } else {
      img.hidden = true;
      img.removeAttribute('src');
      ph.hidden = false;
      label.classList.remove('has-image');
      if (clearBtn) clearBtn.hidden = true;
    }

    const count = state.files.filter(Boolean).length;
    const layoutWrap = $('layoutToggleWrap');
    if (layoutWrap) layoutWrap.hidden = count < 2;
  }

  function updateVideoLayoutToggle() {
    const a = $('videoUrlA')?.value?.trim() || '';
    const b = $('videoUrlB')?.value?.trim() || '';
    const wrap = $('videoLayoutToggleWrap');
    if (wrap) wrap.hidden = !(a && b);
  }

  function bindImageInputs() {
    [1, 2].forEach((slot) => {
      const input = $('imageInput' + slot);
      if (!input) return;

      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          window.PickleMedia.validateImageFile(file);
          state.files[slot - 1] = file;
          updateSlotUI(slot);
        } catch (err) {
          alert(err.message);
          input.value = '';
        }
      });
    });

    document.querySelectorAll('.btn-clear-img').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const slot = Number(btn.dataset.slot);
        state.files[slot - 1] = null;
        const input = $('imageInput' + slot);
        if (input) input.value = '';
        updateSlotUI(slot);
      });
    });
  }

  function bindModeTabs() {
    document.querySelectorAll('.media-mode-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.mode;
        state.mode = mode;
        document.querySelectorAll('.media-mode-tab').forEach((t) => {
          const on = t.dataset.mode === mode;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        $('panelImages').hidden = mode !== 'images';
        $('panelVideo').hidden = mode !== 'video';
      });
    });
  }

  function bindLayoutGroup(containerId) {
    const wrap = $(containerId);
    if (!wrap) return;
    wrap.querySelectorAll('.layout-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.layout = btn.dataset.layout || 'horizontal';
        wrap.querySelectorAll('.layout-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.layout === state.layout);
        });
      });
    });
  }

  function bindLayoutToggle() {
    bindLayoutGroup('layoutToggleWrap');
    bindLayoutGroup('videoLayoutToggleWrap');
  }

  function bindVideoUrlHint(inputId, hintId) {
    const input = $(inputId);
    const hint = $(hintId);
    if (!input || !hint) return;

    const refresh = () => {
      const raw = input.value.trim();
      updateVideoLayoutToggle();
      if (!raw) {
        hint.hidden = true;
        return;
      }
      const parsed = window.PickleMedia.parseVideoUrl(raw);
      hint.hidden = false;
      if (parsed.provider) {
        const label = parsed.provider === 'youtube' ? '유튜브' : '틱톡';
        const fmt =
          parsed.format === 'portrait'
            ? ' · 세로 숏폼(9:16) 자동 인식'
            : ' · 가로 영상(16:9)';
        hint.textContent = `✓ ${label} 연결됨${fmt}`;
        hint.className = 'video-url-hint ok';
      } else {
        hint.textContent =
          '지원: youtube.com, youtu.be, m.youtube.com, tiktok.com/.../video/ID';
        hint.className = 'video-url-hint err';
      }
    };

    input.addEventListener('input', refresh);
    input.addEventListener('blur', refresh);
  }

  function getImageCount() {
    return state.files.filter(Boolean).length;
  }

  function getVideoUrls() {
    return {
      a: $('videoUrlA')?.value?.trim() || '',
      b: $('videoUrlB')?.value?.trim() || '',
    };
  }

  function assertValidVideoUrl(raw, label) {
    if (!window.PickleMedia.isValidVideoUrl(raw)) {
      throw new Error(
        `${label}: 유튜브 또는 틱톡 동영상 URL만 입력할 수 있습니다. (youtu.be, youtube.com/watch, tiktok.com/.../video/...)`
      );
    }
    return window.PickleMedia.parseVideoUrl(raw).rawUrl;
  }

  async function buildMediaPayload(userId) {
    if (state.mode === 'video') {
      const { a, b } = getVideoUrls();
      if (!a && !b) {
        return emptyMedia();
      }
      if (b && !a) {
        throw new Error('URL B만 입력할 수 없습니다. 먼저 URL A를 입력해 주세요.');
      }

      const urlA = assertValidVideoUrl(a, 'URL A');

      if (!b) {
        return {
          media_type: 'video',
          media_url_1: urlA,
          media_url_2: null,
          layout_style: null,
          option_a_image_url: null,
          option_b_image_url: null,
        };
      }

      const urlB = assertValidVideoUrl(b, 'URL B');
      const layout = state.layout === 'vertical' ? 'vertical' : 'horizontal';
      return {
        media_type: 'video_dual',
        media_url_1: urlA,
        media_url_2: urlB,
        layout_style: layout,
        option_a_image_url: null,
        option_b_image_url: null,
      };
    }

    const f0 = state.files[0];
    const f1 = state.files[1];
    if (!f0 && !f1) {
      return emptyMedia();
    }

    if (f0 && f1) {
      const url1 = await window.PickleMedia.uploadPostImage(f0, userId);
      const url2 = await window.PickleMedia.uploadPostImage(f1, userId);
      const layout = state.layout === 'vertical' ? 'vertical' : 'horizontal';
      return {
        media_type: 'dual',
        media_url_1: url1,
        media_url_2: url2,
        layout_style: layout,
        option_a_image_url: url1,
        option_b_image_url: url2,
      };
    }

    const singleFile = f0 || f1;
    const url1 = await window.PickleMedia.uploadPostImage(singleFile, userId);
    return {
      media_type: 'single',
      media_url_1: url1,
      media_url_2: null,
      layout_style: null,
      option_a_image_url: null,
      option_b_image_url: null,
    };
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

  async function createPost(formData, mediaFields) {
    const sb = window.PickleSupabase.getClient();
    const user = window.PickleAuth.getUser();
    if (!user) throw new Error('로그인이 필요합니다');

    const payload = {
      author_id: user.id,
      title: formData.title.trim(),
      category: formData.category,
      option_a_name: formData.optionA.trim(),
      option_b_name: formData.optionB.trim(),
      is_sponsor: false,
      visibility_status: 'visible',
      ...mediaFields,
    };

    const { data, error } = await sb.from('posts').insert(payload).select('id').single();
    if (error) throw error;
    return data;
  }

  function bindForm() {
    const form = $('formCreatePost');
    const btnSubmit = $('btnSubmitPost');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = form.title.value;
      const optionA = form.optionA.value;
      const optionB = form.optionB.value;
      const category = form.category.value;

      if (title.trim().length < 2) {
        showMessage('투표 주제는 2자 이상 입력해 주세요.', true);
        return;
      }
      if (!optionA.trim() || !optionB.trim()) {
        showMessage('A·B 항목 이름을 모두 입력해 주세요.', true);
        return;
      }
      if (optionA.trim() === optionB.trim()) {
        showMessage('A와 B는 서로 다른 이름이어야 합니다.', true);
        return;
      }

      const { a: videoA, b: videoB } = getVideoUrls();
      const hasVideo = Boolean(videoA || videoB);
      const hasImages = getImageCount() > 0;

      if (state.mode === 'images' && hasVideo) {
        showMessage('이미지 탭에서는 동영상 URL을 비워 주세요. (동영상 URL 탭 사용)', true);
        return;
      }
      if (state.mode === 'video' && hasImages) {
        showMessage('동영상 URL 탭에서는 이미지를 제거해 주세요.', true);
        return;
      }
      if (state.mode === 'images' && getImageCount() === 2 && (!state.files[0] || !state.files[1])) {
        showMessage('2장 업로드 시 1번·2번 이미지를 모두 선택해 주세요.', true);
        return;
      }

      const user = window.PickleAuth.getUser();
      if (!user) {
        requireLogin();
        return;
      }

      btnSubmit.disabled = true;
      btnSubmit.textContent = '등록 준비 중…';

      try {
        const mediaFields = await buildMediaPayload(user.id);
        btnSubmit.textContent = '등록 중…';
        await createPost({ title, optionA, optionB, category }, mediaFields);
        window.location.href = 'index.html?created=1';
      } catch (err) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = '불판 올리기';
        const msg = err.message || String(err);
        if (msg.includes('title') && msg.includes('column')) {
          showMessage('title 컬럼이 없습니다. 06_posts_add_title.sql 을 실행해 주세요.', true);
        } else if (msg.includes('media_type') || msg.includes('video_dual')) {
          showMessage(
            '미디어 컬럼/타입이 없습니다. 08_posts_media_columns.sql 과 08b_posts_video_dual_type.sql 을 실행해 주세요.',
            true
          );
        } else {
          showMessage(msg.startsWith('등록 실패') ? msg : '등록 실패: ' + msg, true);
        }
      }
    });
  }

  async function initCreatePage() {
    await window.PickleAuth.init();

    if (!window.PickleAuth.isLoggedIn()) {
      requireLogin();
      return;
    }

    if (!window.PickleMedia) {
      showMessage('media-upload.js 로드를 확인해 주세요.', true);
      return;
    }

    bindImageInputs();
    bindModeTabs();
    bindLayoutToggle();
    bindVideoUrlHint('videoUrlA', 'videoUrlHintA');
    bindVideoUrlHint('videoUrlB', 'videoUrlHintB');
    bindForm();
  }

  window.PickleCreatePost = { init: initCreatePage };

  document.addEventListener('DOMContentLoaded', initCreatePage);
})();
