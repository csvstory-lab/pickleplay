/**
 * P!CKLE — UserInfoModal (취향 정보 수집)
 * 성별 · 연령대 · 지역 · 마케팅 동의 → public.users 업데이트
 */
(function () {
  'use strict';

  var STYLE_ID = 'pickle-user-info-modal-styles';
  var ROOT_ID = 'pickleUserInfoModalRoot';
  var mounted = false;
  var isOpen = false;
  var isSubmitting = false;

  var REGIONS = [
    '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
  ];

  var state = {
    gender: '',
    ageGroup: '',
    region: '',
    age14: false,
    marketing: false,
  };

  function getClient() {
    if (window.PickleAuth && window.PickleAuth.getClient) {
      return window.PickleAuth.getClient();
    }
    if (window.PickleSupabaseBootstrap && window.PickleSupabaseBootstrap.isReady()) {
      return window.PickleSupabaseBootstrap.getClient();
    }
    return null;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#pickleUserInfoModalRoot { position: fixed; inset: 0; z-index: 10050; pointer-events: none; }',
      '#pickleUserInfoModalRoot.is-open { pointer-events: auto; }',
      '.uim-backdrop {',
      '  position: fixed; inset: 0; background: #0a0a0a;',
      '  opacity: 0; transition: opacity 0.25s ease;',
      '}',
      '#pickleUserInfoModalRoot.is-open .uim-backdrop { opacity: 0.92; }',
      '.uim-dialog {',
      '  position: fixed; left: 50%; top: 50%;',
      '  transform: translate(-50%, -48%) scale(0.96);',
      '  width: min(420px, calc(100vw - 32px)); max-height: min(92vh, 720px);',
      '  overflow-y: auto; overflow-x: hidden;',
      '  background: #111111; border: 3px solid #00FFFF;',
      '  box-shadow: 8px 8px 0 #FF00FF;',
      '  padding: 28px 22px 24px; box-sizing: border-box;',
      '  opacity: 0; transition: transform 0.28s cubic-bezier(0.1, 0.9, 0.2, 1), opacity 0.25s ease;',
      '  font-family: Pretendard, -apple-system, BlinkMacSystemFont, sans-serif;',
      '}',
      '#pickleUserInfoModalRoot.is-open .uim-dialog {',
      '  transform: translate(-50%, -50%) scale(1); opacity: 1;',
      '}',
      '.uim-close {',
      '  position: absolute; top: 14px; right: 14px;',
      '  width: 36px; height: 36px; border: 2px solid #3f3f46; background: #1a1a1a;',
      '  color: #fff; font-size: 1.1rem; font-weight: 900; cursor: pointer;',
      '  display: flex; align-items: center; justify-content: center;',
      '  box-shadow: 4px 4px 0 #000; transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.15s;',
      '}',
      '.uim-close:hover { border-color: #FF00FF; color: #FF00FF; }',
      '.uim-close:active { transform: translate(4px, 4px); box-shadow: none; }',
      '.uim-icon {',
      '  font-size: 3rem; text-align: center; margin: 0 0 8px;',
      '  animation: uim-pickle-wiggle 2.2s ease-in-out infinite;',
      '}',
      '@keyframes uim-pickle-wiggle {',
      '  0%, 100% { transform: rotate(0deg); }',
      '  20% { transform: rotate(-8deg); }',
      '  40% { transform: rotate(8deg); }',
      '  60% { transform: rotate(-5deg); }',
      '  80% { transform: rotate(5deg); }',
      '}',
      '.uim-title {',
      '  margin: 0 0 6px; text-align: center;',
      '  font-size: 1.35rem; font-weight: 900; color: #fff; letter-spacing: -0.02em;',
      '}',
      '.uim-subtitle {',
      '  margin: 0 0 22px; text-align: center;',
      '  font-size: 0.85rem; font-weight: 700; color: #a1a1aa; line-height: 1.5;',
      '}',
      '.uim-field { margin-bottom: 18px; }',
      '.uim-label {',
      '  display: block; margin-bottom: 8px;',
      '  font-size: 0.82rem; font-weight: 800; color: #fff;',
      '}',
      '.uim-label .req { color: #FF00FF; margin-left: 2px; }',
      '.uim-chips { display: flex; flex-wrap: wrap; gap: 8px; }',
      '.uim-chip {',
      '  flex: 1; min-width: calc(50% - 4px);',
      '  padding: 12px 10px; border: 2px solid #3f3f46; background: #27272a;',
      '  color: #e4e4e7; font-size: 0.9rem; font-weight: 800; cursor: pointer;',
      '  text-align: center; font-family: inherit;',
      '  box-shadow: 4px 4px 0 #000; transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.15s, border-color 0.15s, color 0.15s;',
      '}',
      '.uim-chip:hover { border-color: #FF00FF; color: #fff; }',
      '.uim-chip.is-active {',
      '  background: #FF00FF; border-color: #FF00FF; color: #000;',
      '  box-shadow: 4px 4px 0 #FFFF00;',
      '}',
      '.uim-chip:active { transform: translate(4px, 4px); box-shadow: none; }',
      '.uim-select {',
      '  width: 100%; padding: 12px 14px; border: 2px solid #3f3f46; background: #27272a;',
      '  color: #fff; font-size: 0.9rem; font-weight: 700; font-family: inherit;',
      '  box-shadow: 4px 4px 0 #000; outline: none; cursor: pointer;',
      '  appearance: none;',
      '  background-image: linear-gradient(45deg, transparent 50%, #00FFFF 50%), linear-gradient(135deg, #00FFFF 50%, transparent 50%);',
      '  background-position: calc(100% - 18px) calc(50% + 2px), calc(100% - 12px) calc(50% + 2px);',
      '  background-size: 6px 6px, 6px 6px; background-repeat: no-repeat;',
      '}',
      '.uim-select:focus { border-color: #00FFFF; }',
      '.uim-checks { display: flex; flex-direction: column; gap: 10px; margin: 20px 0 18px; }',
      '.uim-check-row {',
      '  display: flex; align-items: flex-start; gap: 10px; cursor: pointer;',
      '  font-size: 0.85rem; font-weight: 700; color: #d4d4d8; line-height: 1.45;',
      '}',
      '.uim-check-row input {',
      '  width: 18px; height: 18px; margin-top: 2px; accent-color: #FFFF00; flex-shrink: 0; cursor: pointer;',
      '}',
      '.uim-check-row .tag-req { color: #FF00FF; font-weight: 900; }',
      '.uim-check-row .tag-opt { color: #00FFFF; font-weight: 900; }',
      '.uim-submit {',
      '  width: 100%; padding: 16px 14px; border: 3px solid #000;',
      '  background: #FFFF00; color: #000;',
      '  font-size: 1rem; font-weight: 900; font-family: inherit; cursor: pointer;',
      '  box-shadow: 6px 6px 0 #FF00FF; transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.2s;',
      '}',
      '.uim-submit:hover:not(:disabled) { background: #FF00FF; color: #fff; }',
      '.uim-submit:active:not(:disabled) { transform: translate(6px, 6px); box-shadow: none; }',
      '.uim-submit:disabled {',
      '  background: #3f3f46; color: #71717a; border-color: #52525b;',
      '  box-shadow: 4px 4px 0 #1a1a1a; cursor: not-allowed; opacity: 0.85;',
      '}',
      '.uim-later {',
      '  display: block; width: 100%; margin-top: 14px; padding: 8px;',
      '  background: none; border: none; color: #71717a;',
      '  font-size: 0.82rem; font-weight: 700; font-family: inherit; cursor: pointer; text-decoration: underline;',
      '}',
      '.uim-later:hover { color: #a1a1aa; }',
      '.uim-error {',
      '  margin: 0 0 12px; padding: 10px 12px;',
      '  background: rgba(255, 0, 127, 0.12); border: 2px solid #FF00FF;',
      '  color: #ffb3d9; font-size: 0.82rem; font-weight: 700; display: none;',
      '}',
      '.uim-error.is-visible { display: block; }',
    ].join('\n');

    document.head.appendChild(style);
  }

  function buildRegionOptions() {
    return (
      '<option value="">시·도 선택</option>' +
      REGIONS.map(function (r) {
        return '<option value="' + r + '">' + r + '</option>';
      }).join('')
    );
  }

  function ensureMounted() {
    if (mounted) return;
    injectStyles();

    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML =
      '<div class="uim-backdrop" data-uim-dismiss></div>' +
      '<div class="uim-dialog" role="dialog" aria-modal="true" aria-labelledby="uimTitle">' +
      '  <button type="button" class="uim-close" id="uimCloseBtn" aria-label="닫기">✕</button>' +
      '  <div class="uim-icon" aria-hidden="true">🥒</div>' +
      '  <h2 class="uim-title" id="uimTitle">픽클 세계에 오신 걸 환영해요!</h2>' +
      '  <p class="uim-subtitle">딱 맞는 불판을 추천해 드릴게요.<br>간단한 정보만 알려주세요.</p>' +
      '  <p class="uim-error" id="uimError" role="alert"></p>' +
      '  <div class="uim-field">' +
      '    <span class="uim-label">성별 <span class="req">*</span></span>' +
      '    <div class="uim-chips" role="radiogroup" aria-label="성별">' +
      '      <button type="button" class="uim-chip" data-uim-gender="male">남성</button>' +
      '      <button type="button" class="uim-chip" data-uim-gender="female">여성</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="uim-field">' +
      '    <span class="uim-label">연령대 <span class="req">*</span></span>' +
      '    <div class="uim-chips" role="radiogroup" aria-label="연령대">' +
      '      <button type="button" class="uim-chip" data-uim-age="10s">10대</button>' +
      '      <button type="button" class="uim-chip" data-uim-age="20s">20대</button>' +
      '      <button type="button" class="uim-chip" data-uim-age="30s">30대</button>' +
      '      <button type="button" class="uim-chip" data-uim-age="40s">40대</button>' +
      '      <button type="button" class="uim-chip" data-uim-age="50plus">50대+</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="uim-field">' +
      '    <label class="uim-label" for="uimRegion">활동 지역 <span class="req">*</span></label>' +
      '    <select id="uimRegion" class="uim-select">' +
      buildRegionOptions() +
      '    </select>' +
      '  </div>' +
      '  <div class="uim-checks">' +
      '    <label class="uim-check-row">' +
      '      <input type="checkbox" id="uimAge14">' +
      '      <span><span class="tag-req">[필수]</span> 만 14세 이상입니다.</span>' +
      '    </label>' +
      '    <label class="uim-check-row">' +
      '      <input type="checkbox" id="uimMarketing">' +
      '      <span><span class="tag-opt">[선택]</span> 짜릿한 이벤트 알림 받기</span>' +
      '    </label>' +
      '  </div>' +
      '  <button type="button" class="uim-submit" id="uimSubmitBtn" disabled>픽클 세계로 입장하기</button>' +
      '  <button type="button" class="uim-later" id="uimLaterBtn">나중에 하기</button>' +
      '</div>';

    document.body.appendChild(root);
    bindEvents(root);
    mounted = true;
  }

  function bindEvents(root) {
    root.querySelectorAll('[data-uim-gender]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.gender = btn.getAttribute('data-uim-gender') || '';
        syncChipGroup(root, '[data-uim-gender]', 'data-uim-gender', state.gender);
        updateSubmitState(root);
      });
    });

    root.querySelectorAll('[data-uim-age]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.ageGroup = btn.getAttribute('data-uim-age') || '';
        syncChipGroup(root, '[data-uim-age]', 'data-uim-age', state.ageGroup);
        updateSubmitState(root);
      });
    });

    var regionEl = root.querySelector('#uimRegion');
    var age14El = root.querySelector('#uimAge14');
    var marketingEl = root.querySelector('#uimMarketing');

    regionEl.addEventListener('change', function () {
      state.region = regionEl.value || '';
      updateSubmitState(root);
    });

    age14El.addEventListener('change', function () {
      state.age14 = age14El.checked;
      updateSubmitState(root);
    });

    marketingEl.addEventListener('change', function () {
      state.marketing = marketingEl.checked;
    });

    root.querySelector('#uimSubmitBtn').addEventListener('click', function () {
      submitForm(root);
    });

    root.querySelector('#uimCloseBtn').addEventListener('click', function () {
      close();
    });

    root.querySelector('#uimLaterBtn').addEventListener('click', function () {
      close();
    });

    root.querySelector('[data-uim-dismiss]').addEventListener('click', function () {
      close();
    });
  }

  function syncChipGroup(root, selector, attr, value) {
    root.querySelectorAll(selector).forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute(attr) === value);
    });
  }

  function resetForm(root) {
    state = { gender: '', ageGroup: '', region: '', age14: false, marketing: false };
    syncChipGroup(root, '[data-uim-gender]', 'data-uim-gender', '');
    syncChipGroup(root, '[data-uim-age]', 'data-uim-age', '');
    root.querySelector('#uimRegion').value = '';
    root.querySelector('#uimAge14').checked = false;
    root.querySelector('#uimMarketing').checked = false;
    hideError(root);
    updateSubmitState(root);
  }

  function isFormValid() {
    return !!(state.gender && state.ageGroup && state.region && state.age14);
  }

  function updateSubmitState(root) {
    var btn = root.querySelector('#uimSubmitBtn');
    btn.disabled = !isFormValid() || isSubmitting;
  }

  function showError(root, message) {
    var el = root.querySelector('#uimError');
    el.textContent = message;
    el.classList.add('is-visible');
  }

  function hideError(root) {
    var el = root.querySelector('#uimError');
    el.textContent = '';
    el.classList.remove('is-visible');
  }

  function open() {
    ensureMounted();
    var root = document.getElementById(ROOT_ID);
    resetForm(root);
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    isOpen = true;
  }

  function close() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    isOpen = false;
  }

  function shouldShowModal(profile) {
    if (!profile || !profile.id) return false;
    if (profile.is_info_collected === true) return false;
    return true;
  }

  function maybeShow(profile) {
    if (isOpen) return;
    if (!shouldShowModal(profile)) return;
    open();
  }

  async function submitForm(root) {
    if (!isFormValid() || isSubmitting) return;

    var sb = getClient();
    if (!sb) {
      showError(root, '연결을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    var auth = window.PickleAuth;
    var userId = null;

    try {
      if (auth && auth.ensureAuthenticated) {
        var ctx = await auth.ensureAuthenticated({ skipProfile: true });
        userId = ctx && ctx.user && ctx.user.id;
      }
    } catch (e) {
      console.warn('[UserInfoModal] auth check failed', e);
    }

    if (!userId) {
      showError(root, '로그인이 필요합니다.');
      return;
    }

    isSubmitting = true;
    updateSubmitState(root);
    hideError(root);

    var submitBtn = root.querySelector('#uimSubmitBtn');
    var originalLabel = submitBtn.textContent;
    submitBtn.textContent = '저장 중…';

    try {
      var payload = {
        gender: state.gender,
        age_group: state.ageGroup,
        region: state.region,
        marketing_agreed: !!state.marketing,
        is_info_collected: true,
      };

      var result = await sb.from('users').update(payload).eq('id', userId).select('id').maybeSingle();

      if (result.error) {
        throw result.error;
      }

      if (auth && auth.ensureAuthenticated) {
        await auth.ensureAuthenticated({ forceRefresh: true });
      }

      window.dispatchEvent(
        new CustomEvent('pickle-user-info-collected', {
          detail: { userId: userId, payload: payload },
        })
      );

      close();
    } catch (err) {
      console.error('[UserInfoModal] save failed', err);
      showError(root, '저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      isSubmitting = false;
      submitBtn.textContent = originalLabel;
      updateSubmitState(root);
    }
  }

  function bootstrap() {
    ensureMounted();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  window.PickleUserInfoModal = {
    open: open,
    close: close,
    maybeShow: maybeShow,
    shouldShowModal: shouldShowModal,
  };
})();
